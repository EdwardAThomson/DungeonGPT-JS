# Terrain Studio v2 — Controls Guide

The Layered Terrain Studio generates 3D terrain using a multi-layer noise pipeline. Each control shapes a different aspect of the terrain. This guide explains what each one does and how to use it.

---

## Seed

A number that determines the random pattern of the terrain. **Same seed = same terrain** every time. Change it to get a completely different map — think of it as choosing which "world" to generate.

## Resolution

How many vertices (points) make up the terrain grid. Higher = more detail but slower to generate.

| Value | Detail | Speed |
|-------|--------|-------|
| 64–128 | Low, chunky | Instant |
| 256 | Good balance | Fast |
| 512 | High detail | ~1–2 seconds |

> [!TIP]
> Use 128–256 while experimenting, then bump to 512 once you find settings you like.

---

## Noise Layers

These control the fundamental shape of the terrain — the hills, mountains, and valleys.

### Octaves (2–8)

How many layers of noise are stacked together. Each octave adds **finer detail** on top of the previous one.

- **Low (2–3):** Smooth, rolling hills — very simple shapes
- **Medium (5–6):** Natural mix of large landforms and smaller bumps
- **High (7–8):** Lots of fine texture and roughness

Think of it like painting: octave 1 is the broad brushstroke, octave 8 is the tiny detail brush.

### Persistence / Roughness (0.3–0.7)

Controls how much influence each successive octave has relative to the previous one.

- **Low (0.3–0.4):** Smooth terrain — fine details are subtle
- **Medium (0.5):** Balanced — good default
- **High (0.6–0.7):** Rough, jagged terrain — small details are prominent

> [!NOTE]
> Persistence and Octaves work together. High octaves + high persistence = very noisy terrain. High octaves + low persistence = smooth terrain with subtle texture.

### Sea Level (0–100%)

Controls how much of the terrain is classified as ocean/water. The continental mask uses this to decide where land and sea boundaries fall.

- **Low (10–30%):** Mostly land, small lakes
- **Medium (40–50%):** Mix of continents and oceans
- **High (60–80%):** Archipelago / island world

---

## Shaping

These controls transform the raw noise into more natural-looking terrain.

### Domain Warp Strength (0–2.5)

This is the **"naturalness" control**. It bends and warps the noise coordinates, turning boring circular Perlin blobs into realistic ridgelines, curved valleys, and asymmetric peaks.

- **0:** No warping — terrain looks like regular Perlin noise (circular blobs)
- **0.5–1.0:** Subtle natural distortion
- **1.0–1.5:** Clearly organic shapes — good default range
- **2.0+:** Extreme warping — dramatic, twisted landscapes

> [!IMPORTANT]
> This is the single most impactful control for making terrain look "real." Even small values (0.5) dramatically improve the appearance.

### Peak Exponent (1.0–3.0)

Applies a power curve to the elevation. This shapes the **ratio of peaks to valleys**.

- **1.0:** Linear — what the noise naturally produces (equal high and low terrain)
- **1.3–1.8:** Sharp peaks, wide valleys — looks like real mountain ranges
- **2.0+:** Very sharp spikes with broad flat lowlands
- **3.0:** Extreme — almost all flat with occasional needle-like peaks

Think of it as: higher exponent = taller mountains are preserved but everything else gets pushed down toward flat.

> [!TIP]
> **1.0–1.5** gives the most natural-looking results for most maps. Start there and only go higher if you want dramatic alpine landscapes.

---

## Erosion

### Hydraulic Erosion (toggle)

When enabled, simulates thousands of water droplets flowing downhill, carving river valleys and depositing sediment. This adds realistic fine detail — river channels, smoother slopes, and natural drainage patterns.

**Erosion Particles (10,000–200,000):** More particles = more erosion = more pronounced river valleys. This is computationally expensive, so generation takes longer with high values.

| Particles | Effect | Time |
|-----------|--------|------|
| 10,000–30,000 | Subtle smoothing | Fast |
| 50,000–80,000 | Visible river valleys | ~1–2s |
| 100,000+ | Deep carved channels | Slower |

> [!NOTE]
> Erosion works best at higher resolutions (256+). At low resolution there aren't enough vertices to show the fine detail erosion creates.

---

## Recommended Starting Points

| Style | Octaves | Persistence | Sea Level | Warp | Exponent |
|-------|---------|-------------|-----------|------|----------|
| Rolling countryside | 4–5 | 0.4 | 20% | 0.5 | 1.0 |
| Mountainous island | 6–7 | 0.5 | 40% | 1.2 | 1.5 |
| Dramatic alpine | 8 | 0.45 | 30% | 1.5 | 2.0 |
| Archipelago | 5 | 0.5 | 60% | 1.0 | 1.3 |

---

## Camera Controls

| Action | Input |
|--------|-------|
| Rotate camera | Click + drag / Q and E keys |
| Pan | Right-click + drag / WASD keys |
| Zoom | Scroll wheel |
| Toggle top-down | Click **2D MAP** button |
