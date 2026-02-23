# Experimental Terrain System

Edward's next-gen terrain generation and 3D visualization system. This is a significant upgrade over the current `mapGenerator.js` (basic biome grid) — it produces realistic terrain with continental shapes, erosion patterns, road networks, and 3D rendering via Three.js.

**Status:** Preserved from `src/experimental/`. Not yet integrated into the game. Will be ported to TypeScript and wired into the TerrainStudio debug page when ready.

---

## Architecture

```
experimental-terrain/
  map-generators/
    layeredGenerator.js                  (773 lines)  — 5-layer terrain pipeline
    organicGenerator.js                  (116 lines)  — Alternate biome-focused generator
  utils/
    noise.js                             (107 lines)  — Perlin noise implementation
  3d-components/
    terrain-mesh-3d.js                     (1172 lines) — Three.js terrain renderer
    world-map-display-3d.js                 (247 lines)  — 3D world map viewer
  layered_terrain_generation.md                       — Technical spec for the 5-layer pipeline
  terrain_studio_v2_controls.md                       — User-facing guide for TerrainStudio controls
```

**Total: 2,415 lines of code across 5 files + 2 design docs**

---

## File Breakdown

### map-generators/layeredGenerator.js

The crown jewel. A 5-layer procedural terrain pipeline:

1. **Multi-octave Perlin noise** — base heightmap with configurable octaves, persistence, lacunarity
2. **Continental masking** — creates large landmasses with natural coastlines using radial gradient + noise
3. **Domain warping** — distorts the heightmap using secondary noise fields for organic, non-grid shapes
4. **Power redistribution** — applies exponential curves to create dramatic elevation contrasts (flat plains, steep mountains)
5. **Hydraulic erosion** — simulates water flow to carve rivers and valleys into the terrain

On top of the heightmap, it also handles:
- **Biome assignment** — deep water, water, beach, plains, forest, hills, mountain, snow based on elevation + moisture
- **Town placement** — algorithmic placement of towns at viable locations (flat land, near water, spaced apart)
- **Road pathfinding** — A\* pathfinding between towns to generate road networks
- **POI generation** — forests, mountain peaks, ruins placed based on terrain features

Depends on: `townNameGenerator` (already ported to `frontend/src/game/maps/name-generator.ts`)

### map-generators/organicGenerator.js

Simpler alternative generator focused on:
- 3-layer noise blending (continent shape + rolling hills + surface detail)
- Configurable mountain threshold, forest density, hill density, water level
- Direct biome classification without the full erosion pipeline

Depends on: `utils/noise.js`

### utils/noise.js

Standalone Perlin noise implementation:
- `Noise` class with seeded permutation table
- `perlin(x, y, z)` — classic Perlin noise in 2D/3D
- `generateHeightMap(width, height, seed, options)` — fractal noise with configurable octaves, persistence, scale

### 3d-components/terrain-mesh-3d.js

Three.js terrain renderer using React Three Fiber (`@react-three/fiber` + `@react-three/drei`):
- Instanced meshes for ground blocks (colored by biome)
- Instanced tree meshes (trunk + leaves) placed on forest tiles
- Instanced mountain pyramids on mountain tiles
- 3D town labels using parchment-styled HTML overlays
- Road rendering as 3D lines between towns
- River rendering as blue tubes following terrain contours
- Dynamic lighting (directional + ambient)
- Sky dome with atmosphere simulation
- OrbitControls for camera navigation

This is the largest file (1,172 lines) and the most complex — it's a full 3D terrain visualization.

### 3d-components/world-map-display-3d.js

Wrapper component that combines the generator + renderer:
- Takes `mapData` as prop
- Renders the terrain in a Three.js Canvas
- Adds camera, controls, environment, and lighting setup
- Biome color palette matching the 2D map display

---

## Dependencies Required

When porting, these dependencies will be needed:

```
@react-three/fiber    — React renderer for Three.js
@react-three/drei     — Helper components (OrbitControls, Sky, etc.)
three                 — Three.js core
```

These are already in the root `package.json` as legacy deps. When porting, add them to `frontend/package.json` instead.

---

## Integration Plan

### Phase 1: Port generators to TypeScript
- `noise.js` → `frontend/src/game/experimental/noise.ts`
- `organicGenerator.js` → `frontend/src/game/experimental/organic-generator.ts`
- `layeredGenerator.js` → `frontend/src/game/experimental/layered-generator.ts`
- Update `layeredGenerator` import from `townNameGenerator` to new path
- Pure functions, no React — straightforward TS conversion

### Phase 2: Wire into TerrainStudio debug page
- `frontend/src/pages/debug/terrain.tsx` already exists as a placeholder
- Add generator controls (seed, parameters, layer toggles)
- Render output on the existing 2D map display first

### Phase 3: Port 3D visualization
- Add Three.js deps to frontend
- `terrain-mesh-3d.js` → `frontend/src/pages/debug/components/terrain-mesh-3d.tsx`
- `world-map-display-3d.js` → `frontend/src/pages/debug/components/world-map-3d.tsx`
- Toggle between 2D/3D views in TerrainStudio

### Phase 4: Replace default map generator
- Evaluate whether layeredGenerator should replace `mapGenerator.js` as the default world gen
- The current generator is simpler but less realistic
- Could offer both as options in game settings (Simple vs Advanced terrain)

---

## Notes

- The `layeredGenerator` has its own inline `PerlinNoise` class separate from `utils/noise.js` — it was developed independently and should be consolidated during the TS port
- The A\* pathfinding in `layeredGenerator` overlaps with `frontend/src/game/npcs/pathfinding.ts` — evaluate reuse
- Three.js adds ~500KB to the bundle — should be code-split / lazy-loaded, only loaded when entering TerrainStudio
