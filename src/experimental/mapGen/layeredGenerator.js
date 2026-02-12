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
        erosionRate = 0.15,
        depositionRate = 0.15,
        evaporationRate = 0.02,
        maxLifetime = 60
    } = opts;

    // Clamp indices to valid range (edge-clamping, not returning 0)
    const clampX = (x) => Math.max(0, Math.min(width - 2, x));
    const clampY = (y) => Math.max(0, Math.min(height - 2, y));

    const getHeight = (x, y) => {
        const cx = clampX(x), cy = clampY(y);
        const ix = Math.floor(cx), iy = Math.floor(cy);
        const fx = cx - ix, fy = cy - iy;
        const h00 = heightmap[iy * width + ix];
        const h10 = heightmap[iy * width + ix + 1];
        const h01 = heightmap[(iy + 1) * width + ix];
        const h11 = heightmap[(iy + 1) * width + ix + 1];
        return h00 * (1 - fx) * (1 - fy) + h10 * fx * (1 - fy) + h01 * (1 - fx) * fy + h11 * fx * fy;
    };

    const getGradient = (x, y) => {
        return {
            x: getHeight(x + 1, y) - getHeight(x - 1, y),
            y: getHeight(x, y + 1) - getHeight(x, y - 1)
        };
    };

    // Safe heightmap modification with bilinear splatting
    const deposit = (x, y, amount) => {
        if (!isFinite(amount)) return;
        const ix = Math.floor(x), iy = Math.floor(y);
        if (ix < 0 || ix >= width - 1 || iy < 0 || iy >= height - 1) return;
        const fx = x - ix, fy = y - iy;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        heightmap[iy * width + ix] += amount * w00;
        heightmap[iy * width + ix + 1] += amount * w10;
        heightmap[(iy + 1) * width + ix] += amount * w01;
        heightmap[(iy + 1) * width + ix + 1] += amount * w11;
    };

    // Seeded random for reproducibility
    let rngState = 12345;
    const rng = () => { rngState = (rngState * 9301 + 49297) % 233280; return rngState / 233280; };

    for (let p = 0; p < particles; p++) {
        let px = rng() * (width - 4) + 2;
        let py = rng() * (height - 4) + 2;
        let sediment = 0, water = 1, speed = 0.5;
        let dirX = 0, dirY = 0;

        for (let step = 0; step < maxLifetime; step++) {
            const grad = getGradient(px, py);
            const gradLen = Math.sqrt(grad.x * grad.x + grad.y * grad.y);

            // Blend gradient direction with previous direction for inertia
            const inertia = 0.3;
            dirX = dirX * inertia - grad.x * (1 - inertia);
            dirY = dirY * inertia - grad.y * (1 - inertia);
            const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
            if (dirLen < 0.0001) break;
            dirX /= dirLen;
            dirY /= dirLen;

            const oldHeight = getHeight(px, py);
            const newPx = px + dirX;
            const newPy = py + dirY;

            // Bounds check
            if (newPx < 2 || newPx >= width - 3 || newPy < 2 || newPy >= height - 3) break;

            const newHeight = getHeight(newPx, newPy);
            const heightDiff = newHeight - oldHeight;

            // Carrying capacity based on slope and speed
            const capacity = Math.max(Math.abs(heightDiff), 0.001) * speed * water * 6;

            if (sediment > capacity || heightDiff > 0) {
                // Deposit sediment
                const depositAmount = (heightDiff > 0)
                    ? Math.min(heightDiff * 0.5, sediment)
                    : Math.min((sediment - capacity) * depositionRate, sediment);
                sediment -= depositAmount;
                deposit(px, py, depositAmount);
            } else {
                // Erode terrain
                const erodeAmount = Math.min((capacity - sediment) * erosionRate, 0.05);
                sediment += erodeAmount;
                deposit(px, py, -erodeAmount);
            }

            // Update particle
            speed = Math.sqrt(Math.max(0.01, speed * speed + heightDiff));
            speed = Math.min(speed, 5); // cap speed
            water *= (1 - evaporationRate);
            px = newPx;
            py = newPy;
        }
    }

    // Final safety pass: clamp any NaN/Infinity values
    for (let i = 0; i < heightmap.length; i++) {
        if (!isFinite(heightmap[i])) heightmap[i] = 0;
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
    const forestNoise = new PerlinNoise(seed + 300);

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

    // ─── Forest density map ────────────────────────────────────────────
    // Forests grow in mid-elevation land — not on beaches, water, or snow.
    const forestMap = new Float32Array(width * height);
    let hMin = Infinity, hMax = -Infinity;
    for (let i = 0; i < heightmap.length; i++) {
        if (heightmap[i] < hMin) hMin = heightmap[i];
        if (heightmap[i] > hMax) hMax = heightmap[i];
    }
    const hRange = hMax - hMin || 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const wx = (x / width) * WORLD_SIZE;
            const wy = (y / height) * WORLD_SIZE;
            const h = heightmap[y * width + x];
            const norm = (h - hMin) / hRange; // 0..1

            // Elevation suitability: forests between 0.32 and 0.72 (land, not snow)
            let suitability = 0;
            if (norm > 0.32 && norm < 0.72) {
                // Ramp up from 0.32, peak at 0.45-0.60, ramp down to 0.72
                if (norm < 0.45) suitability = (norm - 0.32) / 0.13;
                else if (norm < 0.60) suitability = 1.0;
                else suitability = (0.72 - norm) / 0.12;
            }

            // Forest noise — multi-octave for clumpy, natural distribution
            let fNoise = 0, fAmp = 1, fFreq = 0.03, fMaxAmp = 0;
            for (let o = 0; o < 3; o++) {
                fNoise += fAmp * forestNoise.noise2D(wx * fFreq, wy * fFreq);
                fMaxAmp += fAmp;
                fAmp *= 0.5;
                fFreq *= 2.0;
            }
            fNoise = (fNoise / fMaxAmp + 1) / 2; // normalise to 0..1

            forestMap[y * width + x] = suitability * fNoise;
        }
    }

    // ─── Town placement ────────────────────────────────────────────────
    // Score-based: prefer flat, mid-elevation, coastal areas
    const towns = [];
    const candidateStride = Math.max(8, Math.floor(Math.min(width, height) / 20));
    const candidates = [];

    // Seeded RNG for town placement
    let townRng = seed * 7 + 31;
    const tRng = () => { townRng = (townRng * 9301 + 49297) % 233280; return townRng / 233280; };

    // Water threshold for town placement — reuse hMin/hRange from forest section
    const sortedForTowns = [...heightmap].sort((a, b) => a - b);
    const waterThreshold = sortedForTowns[Math.floor(sortedForTowns.length * 0.3)];
    const waterNorm = (waterThreshold - hMin) / hRange;

    for (let y = candidateStride; y < height - candidateStride; y += candidateStride) {
        for (let x = candidateStride; x < width - candidateStride; x += candidateStride) {
            // Add jitter
            const jx = Math.floor(x + (tRng() - 0.5) * candidateStride * 0.6);
            const jy = Math.floor(y + (tRng() - 0.5) * candidateStride * 0.6);
            const cx = Math.max(2, Math.min(width - 3, jx));
            const cy = Math.max(2, Math.min(height - 3, jy));

            const h = heightmap[cy * width + cx];
            const norm = (h - hMin) / hRange;

            // Skip underwater and extreme elevations
            if (norm <= waterNorm + 0.03 || norm > 0.75) continue;

            // Flatness score: low local height variance is good
            let variance = 0;
            const r = 3;
            let count = 0;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const diff = heightmap[ny * width + nx] - h;
                        variance += diff * diff;
                        count++;
                    }
                }
            }
            variance /= count;
            const flatness = Math.max(0, 1 - variance * 500); // 0=rough, 1=flat

            // Elevation suitability: prefer 0.35-0.50 (plains/lowlands)
            let elevScore = 0;
            if (norm > 0.33 && norm < 0.55) elevScore = 1.0;
            else if (norm >= 0.55 && norm < 0.70) elevScore = (0.70 - norm) / 0.15;
            else if (norm > waterNorm + 0.03 && norm <= 0.33) elevScore = (norm - waterNorm - 0.03) / 0.10;

            // Coastal proximity bonus: check if water is nearby
            let coastalBonus = 0;
            const coastR = 8;
            for (let dy = -coastR; dy <= coastR; dy += 2) {
                for (let dx = -coastR; dx <= coastR; dx += 2) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                        const nh = (heightmap[ny * width + nx] - hMin) / hRange;
                        if (nh <= waterNorm) { coastalBonus = 0.3; break; }
                    }
                }
                if (coastalBonus > 0) break;
            }

            const score = flatness * 0.5 + elevScore * 0.3 + coastalBonus + tRng() * 0.1;
            if (score > 0.3) {
                candidates.push({ x: cx, y: cy, elevation: h, norm, score });
            }
        }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Pick top candidates with minimum spacing
    const minSpacing = Math.min(width, height) * 0.08;
    const selectedTowns = [];

    for (const c of candidates) {
        let tooClose = false;
        for (const t of selectedTowns) {
            const dx = c.x - t.x, dy = c.y - t.y;
            if (Math.sqrt(dx * dx + dy * dy) < minSpacing) { tooClose = true; break; }
        }
        if (!tooClose) {
            selectedTowns.push(c);
            if (selectedTowns.length >= 15) break; // max 15 towns
        }
    }

    // Assign sizes based on rank
    selectedTowns.forEach((t, i) => {
        if (i < 2) t.size = 'city';
        else if (i < 6) t.size = 'town';
        else t.size = 'village';
        towns.push(t);
    });

    return {
        heightmap,
        forestMap,
        towns,
        width,
        height,
        seaLevel: continentOpts.seaLevel
    };
}

export default generateLayeredTerrain; // v2.1
