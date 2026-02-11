/**
 * Layered Terrain Generator
 * 5-layer noise pipeline: Multi-octave → Continental Mask → Domain Warping → Power Redistribution → Hydraulic Erosion
 */


// Re-export a local Noise instance factory since the existing module exports generateHeightMap
// but we need direct access to the Noise class for per-sample operations.
class PerlinNoise {
    constructor(seed = 42) {
        this.p = new Uint8Array(512);
        this.permutation = new Uint8Array(256);
        const rng = this._seededRandom(seed);
        for (let i = 0; i < 256; i++) this.permutation[i] = i;
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [this.permutation[i], this.permutation[j]] = [this.permutation[j], this.permutation[i]];
        }
        for (let i = 0; i < 512; i++) this.p[i] = this.permutation[i & 255];
    }

    _seededRandom(seed) {
        let state = typeof seed === 'number' ? seed : 42;
        return () => { state = (state * 9301 + 49297) % 233280; return state / 233280; };
    }

    _fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    _lerp(t, a, b) { return a + t * (b - a); }

    _grad(hash, x, y, z) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }

    noise2D(x, y) {
        const z = 0;
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        const Z = Math.floor(z) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const zf = z - Math.floor(z);
        const u = this._fade(x);
        const v = this._fade(y);
        const w = this._fade(zf);
        const A = this.p[X] + Y, AA = this.p[A] + Z, AB = this.p[A + 1] + Z;
        const B = this.p[X + 1] + Y, BA = this.p[B] + Z, BB = this.p[B + 1] + Z;
        return this._lerp(w, this._lerp(v, this._lerp(u, this._grad(this.p[AA], x, y, zf),
            this._grad(this.p[BA], x - 1, y, zf)),
            this._lerp(u, this._grad(this.p[AB], x, y - 1, zf),
                this._grad(this.p[BB], x - 1, y - 1, zf))),
            this._lerp(v, this._lerp(u, this._grad(this.p[AA + 1], x, y, zf - 1),
                this._grad(this.p[BA + 1], x - 1, y, zf - 1)),
                this._lerp(u, this._grad(this.p[AB + 1], x, y - 1, zf - 1),
                    this._grad(this.p[BB + 1], x - 1, y - 1, zf - 1))));
    }
}

// ─── Layer 1: Multi-Octave Noise ───────────────────────────────────────────────
function multiOctaveNoise(x, y, noise, opts) {
    const { octaves = 6, persistence = 0.5, lacunarity = 2.0, baseFreq = 0.01 } = opts;
    let value = 0, amplitude = 1, frequency = baseFreq, maxAmp = 0;
    for (let i = 0; i < octaves; i++) {
        value += amplitude * noise.noise2D(x * frequency, y * frequency);
        maxAmp += amplitude;
        amplitude *= persistence;
        frequency *= lacunarity;
    }
    return value / maxAmp; // [-1, 1]
}

// ─── Layer 2: Continental Mask ─────────────────────────────────────────────────
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function continentalMask(x, y, noise, opts) {
    const { freq = 0.005, seaLevel = -0.1 } = opts;
    // Use multi-octave noise to break up circular blob patterns
    let raw = 0, amp = 1, f = freq, maxAmp = 0;
    for (let i = 0; i < 3; i++) {
        raw += amp * noise.noise2D(x * f, y * f);
        maxAmp += amp;
        amp *= 0.5;
        f *= 2.0;
    }
    raw /= maxAmp;
    return smoothstep(seaLevel - 0.2, seaLevel + 0.2, raw);
}

// ─── Layer 3: Domain Warping ───────────────────────────────────────────────────
function domainWarpedSample(x, y, terrainNoise, warpNoise, terrainOpts, warpOpts) {
    const { strength = 1.2, freq = 0.008 } = warpOpts;
    const warpX = warpNoise.noise2D(x * freq, y * freq);
    const warpY = warpNoise.noise2D(x * freq + 5.2, y * freq + 1.3);
    return multiOctaveNoise(
        x + strength * warpX * 40,
        y + strength * warpY * 40,
        terrainNoise,
        terrainOpts
    );
}

// ─── Layer 4: Power Redistribution ─────────────────────────────────────────────
function redistribute(elevation, exponent) {
    const normalised = (elevation + 1) / 2; // [-1,1] → [0,1]
    return Math.pow(Math.max(0, normalised), exponent);
}

// ─── Layer 5: Hydraulic Erosion ────────────────────────────────────────────────
function erode(heightmap, width, height, opts) {
    const {
        particles = 70000,
        erosionRate = 0.3,
        depositionRate = 0.3,
        evaporationRate = 0.01,
        maxLifetime = 80
    } = opts;

    const getHeight = (x, y) => {
        const ix = Math.floor(x), iy = Math.floor(y);
        if (ix < 0 || ix >= width - 1 || iy < 0 || iy >= height - 1) return 0;
        const fx = x - ix, fy = y - iy;
        const h00 = heightmap[iy * width + ix];
        const h10 = heightmap[iy * width + ix + 1];
        const h01 = heightmap[(iy + 1) * width + ix];
        const h11 = heightmap[(iy + 1) * width + ix + 1];
        return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
    };

    const getGradient = (x, y) => {
        const eps = 1.0;
        return {
            x: (getHeight(x + eps, y) - getHeight(x - eps, y)) / (2 * eps),
            y: (getHeight(x, y + eps) - getHeight(x, y - eps)) / (2 * eps)
        };
    };

    // Seeded random for reproducibility
    let rngState = 12345;
    const rng = () => { rngState = (rngState * 9301 + 49297) % 233280; return rngState / 233280; };

    for (let p = 0; p < particles; p++) {
        let px = rng() * (width - 2) + 1;
        let py = rng() * (height - 2) + 1;
        let sediment = 0, water = 1, speed = 1;

        for (let step = 0; step < maxLifetime; step++) {
            const grad = getGradient(px, py);
            const gradLen = Math.sqrt(grad.x * grad.x + grad.y * grad.y);
            if (gradLen < 0.0001) break;

            const dirX = -grad.x / gradLen;
            const dirY = -grad.y / gradLen;
            const oldHeight = getHeight(px, py);

            px += dirX;
            py += dirY;

            if (px < 1 || px >= width - 2 || py < 1 || py >= height - 2) break;

            const newHeight = getHeight(px, py);
            const heightDiff = newHeight - oldHeight;

            speed = Math.sqrt(Math.max(0.01, speed * speed - heightDiff * 4));
            const capacity = Math.max(-heightDiff * 8, 0.01) * speed * water;

            const ix = Math.floor(px), iy = Math.floor(py);
            const idx = iy * width + ix;

            if (sediment > capacity || heightDiff > 0) {
                const deposit = (heightDiff > 0)
                    ? Math.min(heightDiff, sediment)
                    : (sediment - capacity) * depositionRate;
                sediment -= deposit;
                heightmap[idx] += deposit * 0.5;
            } else {
                const erodeAmount = Math.min((capacity - sediment) * erosionRate, -heightDiff) * 0.5;
                sediment += erodeAmount;
                heightmap[idx] -= erodeAmount;
            }

            water *= (1 - evaporationRate);
        }
    }
}

// ─── Main Pipeline ─────────────────────────────────────────────────────────────
/**
 * Generate terrain using the 5-layer pipeline.
 * @param {number} width
 * @param {number} height
 * @param {Object} params
 * @returns {{ heightmap: Float32Array, width: number, height: number, seaLevel: number }}
 */
export function generateLayeredTerrain(width, height, params = {}) {
    const {
        seed = 42,
        terrain = {},
        continent = {},
        warp = {},
        exponent = 1.8,
        erosion = null
    } = params;

    const terrainOpts = {
        octaves: terrain.octaves ?? 6,
        persistence: terrain.persistence ?? 0.5,
        lacunarity: terrain.lacunarity ?? 2.0,
        baseFreq: terrain.baseFreq ?? 0.01
    };

    const continentOpts = {
        freq: continent.freq ?? 0.005,
        seaLevel: continent.seaLevel ?? -0.1
    };

    const warpOpts = {
        strength: warp.strength ?? 1.2,
        freq: warp.freq ?? 0.008
    };

    // Create noise instances with different seeds for decorrelation
    const terrainNoise = new PerlinNoise(seed);
    const continentNoise = new PerlinNoise(seed + 100);
    const warpNoise = new PerlinNoise(seed + 200);

    const heightmap = new Float32Array(width * height);

    // Normalize coordinates to a fixed world size so changing resolution
    // only adds detail, not a different map layout.
    const WORLD_SIZE = 256;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            // Map pixel coords to fixed world coords
            const wx = (x / width) * WORLD_SIZE;
            const wy = (y / height) * WORLD_SIZE;

            // Layer 1 + 3: Domain-warped multi-octave noise
            let elevation = domainWarpedSample(wx, wy, terrainNoise, warpNoise, terrainOpts, warpOpts);

            // Layer 2: Continental mask
            const mask = continentalMask(wx, wy, continentNoise, continentOpts);
            elevation *= mask;

            // Layer 4: Power redistribution
            elevation = redistribute(elevation, exponent);

            heightmap[y * width + x] = elevation;
        }
    }

    // Layer 5: Hydraulic erosion (optional)
    if (erosion) {
        erode(heightmap, width, height, erosion);
    }

    return {
        heightmap,
        width,
        height,
        seaLevel: continentOpts.seaLevel
    };
}

export default generateLayeredTerrain;
