# Layered Terrain Generation — Proposed Approach

> Goal: Replace current non-linear map generator with a layered noise pipeline that produces natural-looking overland terrain with sharp peaks, wide valleys, and intuitive controls.

---

## Architecture Overview

```
┌─────────────────────────────────────┐
│  Layer 1: Multi-Octave Simplex      │  ← Terrain shape
│  (octaves, persistence, frequency)  │
├─────────────────────────────────────┤
│  Layer 2: Continental Mask          │  ← Land vs water
│  (low-freq noise or gradient)       │
├─────────────────────────────────────┤
│  Layer 3: Domain Warping            │  ← Natural bending
│  (warp strength)                    │
├─────────────────────────────────────┤
│  Layer 4: Power Redistribution      │  ← Sharp peaks / wide valleys
│  (exponent)                         │
├─────────────────────────────────────┤
│  Layer 5: Hydraulic Erosion (opt.)  │  ← River valleys, ridgelines
│  (particle count, rates)            │
└─────────────────────────────────────┘
         ↓
    Final Heightmap
```

---

## Layer 1: Multi-Octave Noise (Terrain Skeleton)

The Minecraft-style foundation. Layer multiple octaves of Simplex/Perlin noise with decreasing amplitude and increasing frequency:

```
elevation = 0
for each octave i (0 to N):
    elevation += amplitude_i × noise(x × frequency_i, y × frequency_i)
```

### Parameters

| Parameter | Typical Range | Controls | Intuitive? |
|---|---|---|---|
| **Octaves** | 4–8 | Detail level — more = more crinkly | ✅ Very |
| **Lacunarity** | ~2.0 | How fast frequency increases per octave | ⚠️ Moderate |
| **Persistence** | 0.4–0.6 | How fast amplitude decreases — think "roughness" | ✅ Yes |
| **Base frequency** | 0.005–0.02 | Scale of largest features — think "continent size" | ✅ Yes |

### Pseudocode

```javascript
function multiOctaveNoise(x, y, opts) {
  const { octaves = 6, persistence = 0.5, lacunarity = 2.0, baseFreq = 0.01, seed = 0 } = opts;
  let value = 0;
  let amplitude = 1;
  let frequency = baseFreq;
  let maxAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += amplitude * simplex.noise2D(x * frequency + seed, y * frequency + seed);
    maxAmp += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return value / maxAmp; // Normalise to [-1, 1]
}
```

---

## Layer 2: Continental Mask (Macro Shape)

A separate **very low-frequency** noise layer that defines land vs water. Multiply against Layer 1:

```javascript
function continentalMask(x, y, opts) {
  const { freq = 0.002, seaLevel = 0.0 } = opts;
  const raw = simplex.noise2D(x * freq, y * freq);
  // Smooth step to create clear land/water boundary
  return smoothstep(seaLevel - 0.1, seaLevel + 0.1, raw);
}

// Usage:
elevation = multiOctaveNoise(x, y, terrainOpts) * continentalMask(x, y, maskOpts);
```

### Parameters

| Parameter | Controls |
|---|---|
| **Mask frequency** (0.001–0.005) | Size of continents/islands |
| **Sea level** (-0.2 to 0.2) | How much land vs water |

---

## Layer 3: Domain Warping (The "Naturalness" Secret)

Instead of sampling `noise(x, y)`, warp the input coordinates using separate noise fields. This transforms boring circular Perlin blobs into realistic ridgelines, curved valleys, and asymmetric peaks.

```javascript
function domainWarpedElevation(x, y, opts) {
  const { warpStrength = 1.0, warpFreq = 0.008 } = opts;

  // Separate noise fields for X and Y displacement
  const warpX = simplex.noise2D(x * warpFreq, y * warpFreq);
  const warpY = simplex.noise2D(x * warpFreq + 5.2, y * warpFreq + 1.3); // Offset to decorrelate

  // Sample terrain noise at warped coordinates
  return multiOctaveNoise(
    x + warpStrength * warpX * 100,
    y + warpStrength * warpY * 100,
    terrainOpts
  );
}
```

### Parameters

| Parameter | Typical Range | Effect |
|---|---|---|
| **Warp strength** | 0.5–2.0 | How much terrain bends and twists |
| **Warp frequency** | 0.005–0.015 | Scale of the warping pattern |

> **Note:** Domain warping was confirmed as one of Minecraft's techniques when Mojang open-sourced parts of the biome generation in later versions. It's what makes terrain feel less "obviously fractal".

---

## Layer 4: Power Redistribution (Peak Sharpness)

Raw noise gives approximately equal amounts of high and low terrain. Real geography has **sharp peaks with broad valleys**. Apply a power curve:

```javascript
function redistribute(elevation, exponent) {
  // Input should be normalised to [0, 1]
  const normalised = (elevation + 1) / 2; // From [-1,1] to [0,1]
  return Math.pow(normalised, exponent);
}
```

### Effect of Exponent

| Exponent | Effect |
|---|---|
| 1.0 | Linear — default Perlin look |
| 1.5–2.0 | **Sharp peaks, wide valleys** ← recommended starting point |
| 3.0+ | Extreme spikes, very flat lowlands |

> **This is the key to achieving DLA-like mountain aesthetics** (sharp peaks + wide valleys) without the performance cost of DLA. One parameter, zero iteration.

---

## Layer 5 (Optional): Hydraulic Erosion

For the final polish — realistic ridge lines, river-cut valleys, sediment deposits. Simulate raindrops flowing downhill:

```javascript
function erode(heightmap, opts) {
  const {
    particles = 100000,
    erosionRate = 0.3,
    depositionRate = 0.3,
    evaporationRate = 0.01,
    maxLifetime = 100
  } = opts;

  for (let p = 0; p < particles; p++) {
    let x = Math.random() * width;
    let y = Math.random() * height;
    let sediment = 0;
    let water = 1;
    let speed = 0;

    for (let step = 0; step < maxLifetime; step++) {
      // Calculate gradient at current position
      const gradient = getGradient(heightmap, x, y);

      // Move downhill
      x += gradient.x;
      y += gradient.y;

      if (outOfBounds(x, y)) break;

      // Calculate height difference
      const oldHeight = sampleHeight(heightmap, x - gradient.x, y - gradient.y);
      const newHeight = sampleHeight(heightmap, x, y);
      const heightDiff = newHeight - oldHeight;

      // Update speed
      speed = Math.sqrt(Math.max(0, speed * speed - heightDiff));

      // Sediment capacity
      const capacity = Math.max(-heightDiff, 0.01) * speed * water;

      if (sediment > capacity || heightDiff > 0) {
        // Deposit sediment
        const deposit = (heightDiff > 0)
          ? Math.min(heightDiff, sediment)
          : (sediment - capacity) * depositionRate;
        sediment -= deposit;
        addToHeightmap(heightmap, x, y, deposit);
      } else {
        // Erode terrain
        const erodeAmount = Math.min((capacity - sediment) * erosionRate, -heightDiff);
        sediment += erodeAmount;
        addToHeightmap(heightmap, x, y, -erodeAmount);
      }

      // Evaporate water
      water *= (1 - evaporationRate);
    }
  }
}
```

### Parameters

| Parameter | Controls |
|---|---|
| **Particle count** (50k–200k) | How much erosion occurs overall |
| **Erosion rate** (0.1–0.5) | How aggressively water carves |
| **Deposition rate** (0.1–0.5) | How much sediment fills valleys |
| **Evaporation rate** (0.005–0.02) | How far water travels before drying |

---

## Complete Pipeline

```javascript
function generateTerrain(width, height, params) {
  const heightmap = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Layer 1: Base terrain
      let elevation = multiOctaveNoise(x, y, params.terrain);

      // Layer 3: Domain warping (applied to Layer 1)
      // In practice, fold this into the noise sampling above
      // See domainWarpedElevation() function

      // Layer 2: Continental mask
      const mask = continentalMask(x, y, params.continent);
      elevation *= mask;

      // Layer 4: Redistribution
      elevation = redistribute(elevation, params.exponent || 1.8);

      heightmap[y * width + x] = elevation;
    }
  }

  // Layer 5: Erosion (one-time post-process)
  if (params.erosion) {
    erode(heightmap, params.erosion);
  }

  return heightmap;
}
```

---

## Performance Expectations

| Technique | 512×512 | 1024×1024 | Notes |
|---|---|---|---|
| Layers 1–4 only | ~20–80ms | ~100–300ms | Real-time preview friendly |
| + Hydraulic erosion | ~200–500ms | ~1–2s | One-time generation cost |
| DLA (for comparison) | ~5–30s | Minutes | Far too slow |

---

## Parameter Summary (Recommended Defaults)

```javascript
const defaultParams = {
  terrain: {
    octaves: 6,
    persistence: 0.5,
    lacunarity: 2.0,
    baseFreq: 0.01,
    seed: 42
  },
  continent: {
    freq: 0.003,
    seaLevel: 0.0
  },
  warp: {
    strength: 1.2,
    freq: 0.008
  },
  exponent: 1.8,  // Sharp peaks, wide valleys
  erosion: {
    particles: 100000,
    erosionRate: 0.3,
    depositionRate: 0.3,
    evaporationRate: 0.01
  }
};
```

---

## Why This Beats Current Approach

1. **Predictable controls** — each layer has 1–3 parameters with obvious visual effects
2. **DLA-like aesthetics** — power curve (Layer 4) gives sharp peaks + wide valleys, effectively free
3. **Minecraft-quality detail** — multi-octave noise + domain warping is their confirmed approach
4. **Fast** — layers 1–4 are pure math, fast enough for live slider preview
5. **Optional polish** — erosion layer adds stunning realism at a one-time cost

## References & Further Reading

- Sebastian Lague's "Hydraulic Erosion" video/code (excellent implementation reference)
- Inigo Quilez's domain warping articles (iquilezles.org)
- Red Blob Games terrain generation tutorials
- Minecraft's `MultiNoiseBiomeSource` (open-sourced deobfuscated code)
