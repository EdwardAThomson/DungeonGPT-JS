# World Map Tile Generation Guide

Reference document for generating AI image tiles to replace the current emoji-based world map rendering.

## Current System Overview

- **Grid size**: 10x10 (default), rendered at 40x40px per tile
- **Rendering**: Flat colored backgrounds with emoji overlays and SVG paths for roads/rivers
- **Biomes**: Plains, Water, Beach, Forest, Mountain
- **POIs**: Towns (4 sizes), Cave Entrance
- **Overlays**: Roads (brown paths), Rivers (blue paths)

---

## Tile Categories

### 1. Base Terrain Tiles

These are the foundational tiles that cover every cell of the map.

| # | Tile | Current Look | Notes |
|---|------|-------------|-------|
| 1 | **Plains / Grass** | Flat `#c3e6cb` (light green) | Most common tile. Should be a natural grassy texture. |
| 2 | **Deep Water** | Flat `#007bff` (blue) | Open ocean / deep lake. |
| 3 | **Shallow Water** | Slightly lighter blue | Near coastlines, used in lake edges. |
| 4 | **Beach / Sand** | Flat `#f5deb3` (wheat) | Transition between water and land. |

#### Suggested Prompts (Base Terrain)

- **Plains**: `Top-down seamless grass tile, fantasy RPG style, lush green meadow with subtle texture variation, no objects, square tile, game asset, flat lighting`
- **Deep Water**: `Top-down seamless deep ocean water tile, fantasy RPG style, dark blue water with subtle wave patterns, square tile, game asset`
- **Shallow Water**: `Top-down seamless shallow water tile, fantasy RPG style, light blue-green water with visible sandy bottom, square tile, game asset`
- **Beach**: `Top-down seamless sand tile, fantasy RPG style, golden beach sand with subtle texture, square tile, game asset`

---

### 2. Feature / POI Tiles

These overlay or replace the base terrain to show points of interest.

| # | Tile | Current Emoji | Notes |
|---|------|--------------|-------|
| 5 | **Forest** | `🌲` on green bg | Dense trees, shown on plains biome. Clusters of 2-4 tiles. |
| 6 | **Mountain** | `⛰️` on green bg | Rocky peaks. Ranges of 2-3 tiles. |
| 7 | **Cave Entrance** | `🕳️` on green bg | Dark opening, typically near mountains. |

#### Suggested Prompts (Features)

- **Forest**: `Top-down dense forest tile, fantasy RPG style, thick canopy of green trees seen from above, square tile, game asset, seamless edges`
- **Mountain**: `Top-down rocky mountain peak tile, fantasy RPG style, gray stone with snow-capped summit, square tile, game asset`
- **Cave Entrance**: `Top-down cave entrance tile, fantasy RPG style, dark opening in rocky ground surrounded by grass, square tile, game asset`

---

### 3. Town Tiles (4 sizes)

| # | Tile | Current Emoji | Map Size | Buildings |
|---|------|--------------|----------|-----------|
| 8 | **Hamlet** | `🛖` | 8x8 | 1-3 buildings |
| 9 | **Village** | `🏡` | 12x12 | 3-6 buildings |
| 10 | **Town** | `🏘️` | 16x16 | 10+ buildings |
| 11 | **City** | `🏰` | 20x20 | 15+ buildings, walls |

#### Suggested Prompts (Towns)

- **Hamlet**: `Top-down tiny hamlet tile, fantasy RPG style, 2-3 small thatched-roof cottages with a dirt path, surrounded by grass, square tile, game asset`
- **Village**: `Top-down small village tile, fantasy RPG style, cluster of houses around a central well, dirt roads, square tile, game asset`
- **Town**: `Top-down medieval town tile, fantasy RPG style, dense cluster of buildings with market square, stone roads, square tile, game asset`
- **City**: `Top-down walled medieval city tile, fantasy RPG style, castle keep surrounded by dense buildings within stone walls, square tile, game asset`

---

### 4. Coast / Beach Transition Tiles (THE HARD ONES)

The current system uses CSS gradients with a `beachDirection` property (0-3) to blend sand into water. For image tiles, you need directional variants that line up at the edges.

| # | Tile | Direction | Description |
|---|------|-----------|-------------|
| 12 | **Coast North** | `beachDirection: 0` | Water to the north, sand/land to the south |
| 13 | **Coast East** | `beachDirection: 1` | Water to the east, sand/land to the west |
| 14 | **Coast South** | `beachDirection: 2` | Water to the south, sand/land to the north |
| 15 | **Coast West** | `beachDirection: 3` | Water to the west, sand/land to the east |

#### Corner Coasts (if needed later)

| # | Tile | Description |
|---|------|-------------|
| 16 | **Coast NE Corner** | Water wraps around northeast corner |
| 17 | **Coast NW Corner** | Water wraps around northwest corner |
| 18 | **Coast SE Corner** | Water wraps around southeast corner |
| 19 | **Coast SW Corner** | Water wraps around southwest corner |

#### Suggested Prompts (Coast)

- **Coast North**: `Top-down coastal transition tile, fantasy RPG style, water on top half transitioning to sandy beach on bottom half, straight horizontal shoreline, square tile, game asset, seamless`
- **Coast East**: `Top-down coastal transition tile, fantasy RPG style, sandy beach on left transitioning to water on right half, straight vertical shoreline, square tile, game asset, seamless`
- **Coast Corner NE**: `Top-down coastal corner tile, fantasy RPG style, water in top-right corner with sandy beach curving around it, square tile, game asset, seamless`

---

### 5. Road Overlay Tiles

Roads connect towns via A* pathfinding. The current system uses SVG paths with brown (`#8B4513`) strokes.

| # | Tile | Direction | SVG Equivalent |
|---|------|-----------|----------------|
| 20 | **Road N-S** | Vertical | `M20,0 L20,40` |
| 21 | **Road E-W** | Horizontal | `M0,20 L40,20` |
| 22 | **Road NE** | Corner | `M20,0 Q20,20 40,20` |
| 23 | **Road NW** | Corner | `M20,0 Q20,20 0,20` |
| 24 | **Road SE** | Corner | `M20,40 Q20,20 40,20` |
| 25 | **Road SW** | Corner | `M20,40 Q20,20 0,20` |
| 26 | **Road Intersection** | Cross | `M20,0 L20,40 M0,20 L40,20` |

#### Suggested Prompts (Roads)

- **Road N-S**: `Top-down dirt road tile, fantasy RPG style, vertical brown path through grass, transparent/green background, square tile, game asset, seamless top and bottom edges`
- **Road Intersection**: `Top-down dirt road crossroads tile, fantasy RPG style, two crossing paths forming a plus shape, transparent/green background, square tile, game asset`

> **Note**: Road tiles work best as transparent PNGs overlaid on terrain tiles, rather than standalone tiles. Consider generating them with transparent backgrounds or keeping the current SVG approach for roads.

---

### 6. River Overlay Tiles

Rivers flow from mountains to lakes/coasts. Currently rendered as blue (`#4169E1`) SVG paths. Same directional variants as roads.

| # | Tile | Direction |
|---|------|-----------|
| 27 | **River N-S** | Vertical |
| 28 | **River E-W** | Horizontal |
| 29 | **River NE** | Corner |
| 30 | **River NW** | Corner |
| 31 | **River SE** | Corner |
| 32 | **River SW** | Corner |
| 33 | **River Intersection** | Cross |

#### Suggested Prompts (Rivers)

- **River N-S**: `Top-down river tile, fantasy RPG style, vertical blue stream flowing through green grass, square tile, game asset, seamless top and bottom edges`

> **Note**: Same recommendation as roads -- transparent overlays or keep SVG rendering for rivers.

---

## Summary Tile Count

| Category | Count | Difficulty |
|----------|-------|------------|
| Base Terrain | 4 | Easy -- standalone tiles |
| Features / POIs | 3 | Easy -- standalone tiles |
| Towns | 4 | Easy -- standalone tiles |
| Coast Transitions | 4 straight + 4 corners | Hard -- must align with neighbors |
| Road Overlays | 7 | Medium -- need transparency |
| River Overlays | 7 | Medium -- need transparency |
| **Total** | **~33 tiles** | |

---

## Dealing with AI Image Whitespace

AI image generators (DALL-E, Midjourney, etc.) tend to add padding/whitespace around subjects. Strategies to mitigate this:

### At Generation Time
- **Prompt engineering**: Include phrases like `"fills the entire frame"`, `"no border"`, `"no padding"`, `"edge-to-edge"`, `"flush with edges"`, `"zoomed in to fill canvas"`
- **Use inpainting/outpainting**: Generate a smaller tile and outpaint to fill edges
- **Tiling mode**: Midjourney has a `--tile` parameter specifically for seamless tiles. Some Stable Diffusion workflows also support tiling mode

### Post-Processing
- **Auto-crop**: Use ImageMagick to trim whitespace: `convert input.webp -trim -resize 128x128! output.webp`
- **CSS object-fit**: Use `object-fit: cover` on `<img>` tags to crop whitespace visually without editing files
- **Batch trim script**: A simple script using `sharp` (already a common Node dependency) or ImageMagick can batch-process all tiles
- **Background removal**: For overlay tiles (roads, rivers), use rembg or similar to isolate the subject on a transparent background

### Recommended Tile Resolution
- Generate at **512x512** or **1024x1024** (AI models produce better results at higher res)
- Downscale to **128x128** or **64x64** for the actual game (current tiles render at 40x40px CSS, but higher res allows for zoom)

---

## Coast Tile Alignment Strategy

Coasts are the hardest tiles to get right. Some approaches:

### Option A: Simple Gradient Approach (Easiest)
Keep the current CSS gradient system for coasts. Only replace the solid terrain tiles (plains, water, forest, mountain, towns) with AI images. This is the lowest-risk approach and still provides a big visual upgrade.

### Option B: Directional Tiles with Fixed Edge Colors
Generate coast tiles where:
- The water edge always uses the exact same blue as the deep water tile
- The land edge always uses the exact same green as the plains tile
- This ensures adjacent tiles line up at their shared edge

Include in prompts: `"left edge must be solid [hex color], right edge must be solid [hex color]"`

### Option C: Procedural Blending in CSS
Use AI-generated base terrain tiles but blend them with CSS:
- `mask-image` with gradients to fade tiles into each other at coast boundaries
- This gives seamless transitions without needing perfectly matching tile edges

### Option D: Tileset Generation
Use a specialized tileset generator (like the Stable Diffusion tiling workflows) to generate an entire matching tileset at once, ensuring all edges are consistent.

---

## Recommended Approach: Phased Rollout

### Phase 1 -- Quick Wins (Low Risk)
Replace standalone tiles that don't need to match edges:
- Forest (on green background)
- Mountain (on green background)
- Cave Entrance
- 4 Town variants
- **7 tiles total**

### Phase 2 -- Base Terrain (Medium Risk)
Replace flat-color terrain with textured tiles:
- Plains / Grass
- Deep Water
- Shallow Water
- Beach / Sand
- Keep CSS gradients for coast transitions (Option A above)
- **4 tiles total**

### Phase 3 -- Coast Transitions (High Risk)
Tackle the coast alignment problem:
- 4 directional coast tiles
- 4 corner coast tiles (if needed)
- **4-8 tiles total**

### Phase 4 -- Overlays (Optional)
Consider whether roads and rivers look better as:
- AI-generated transparent overlays
- Keep as SVG paths (may actually look fine over textured tiles)
- **7-14 tiles total (if replacing)**

---

## 2D vs 3D Considerations

You already have an experimental 3D system using React Three Fiber. Here's the trade-off:

| Factor | Enhanced 2D | 3D |
|--------|------------|-----|
| Visual impact | High with good tiles | Very high |
| Implementation effort | Low-Medium | Already partially built |
| Performance | Excellent | Heavier (WebGL) |
| Mobile support | Great | Variable |
| Tile generation needed | Yes (this doc) | Textures instead of tiles |
| Artist control | High | Medium (lighting/camera matter) |

**Recommendation**: Start with enhanced 2D tiles as a proof of concept. The 2D system is simpler, the tiles are useful regardless, and you can evaluate the visual quality before deciding whether the 3D route is worth pursuing further. The 3D system uses solid colors currently anyway -- good 2D tiles could eventually double as 3D terrain textures.
