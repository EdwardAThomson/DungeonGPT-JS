# Multi-Level Map System Architecture Plan

## 🎯 Core Concept: Hierarchical Map System

**Map Hierarchy:**
```
World Map (Level 0) 
├── Town Maps (Level 1) - for town tiles
├── Forest Maps (Level 1) - for forest areas  
├── Mountain Maps (Level 1) - for mountain regions
└── Future: Building Maps (Level 2) - rooms within towns
```

## 📊 Data Structure Design

### 1. Map Metadata System
```javascript
// Enhanced tile structure
{
  x: 8, y: 8,
  biome: 'plains',
  poi: 'town',
  townSize: 'large',           // NEW: small, medium, large, castle
  townName: 'Millbrook',       // NEW: generated town name
  descriptionSeed: "A small village",
  isStartingTown: true,
  hasSubMap: true,             // NEW: indicates sub-map exists
  subMapId: 'town_8_8',        // NEW: unique identifier for sub-map
  subMapType: 'town'           // NEW: type of sub-map
}
```

### 2. Sub-Map Storage Structure
```javascript
// Database schema addition
{
  sessionId: 'session-123',
  worldMap: [...],             // Existing world map
  subMaps: {                   // NEW: collection of sub-maps
    'town_8_8': {
      id: 'town_8_8',
      type: 'town',
      size: 'large',           // Determines sub-map layout
      name: 'Millbrook',
      parentTile: {x: 8, y: 8},
      mapData: [...],          // Size varies: 10x10, 15x15, 20x20
      playerPosition: {x: 5, y: 9}, // Entry point
      entryPoints: [{x: 5, y: 9}]   // Multiple exits possible
    }
  }
}
```

## 🏰 Town Size System

### Town Types & Visual Representation
| Size | Emoji | Description | Sub-Map Size | Features |
|------|-------|-------------|--------------|----------|
| **Hamlet** | 🛖 | Small Settlement | 8x8 | Few houses, maybe a well |
| **Village** | 🏡 | Rural Community | 12x12 | Houses, inn, small shop |
| **Town** | 🏘️ | Market Town | 16x16 | Market square, multiple shops, temple |
| **City** | 🏰 | Walled City | 20x20 | Districts, guilds, walls, keep |

### Sub-Map Features by Size
```javascript
const townFeatures = {
  hamlet: {
    buildings: ['house', 'well'],
    population: '20-50',
    specialFeatures: []
  },
  village: {
    buildings: ['house', 'inn', 'shop'],
    population: '50-200',
    specialFeatures: []
  },
  town: {
    buildings: ['house', 'inn', 'shop', 'temple', 'market'],
    population: '200-1000', 
    specialFeatures: ['market_square']
  },
  city: {
    buildings: ['house', 'inn', 'shop', 'temple', 'market', 'guild', 'tavern', 'keep', 'walls'],
    population: '1000-5000',
    specialFeatures: ['walls', 'keep', 'districts', 'gates']
  }
};
```

## 🎲 Name Generator System

### Town Name Generation
```javascript
// townNameGenerator.js
const nameComponents = {
  prefixes: [
    'Mill', 'Stone', 'River', 'Oak', 'Iron', 'Gold', 'Silver', 'Green', 
    'White', 'Black', 'Red', 'Blue', 'High', 'Low', 'North', 'South',
    'East', 'West', 'Old', 'New', 'Fair', 'Bright', 'Dark', 'Swift'
  ],
  suffixes: [
    'brook', 'ford', 'bridge', 'haven', 'port', 'gate', 'hill', 'dale',
    'wood', 'field', 'moor', 'shire', 'ton', 'burg', 'keep', 'hold',
    'watch', 'guard', 'rest', 'fall', 'ridge', 'vale', 'glen', 'marsh'
  ],
  castleNames: [
    'Stronghold', 'Fortress', 'Citadel', 'Bastion', 'Rampart', 'Bulwark',
    'Keep', 'Castle', 'Tower', 'Spire', 'Crown', 'Throne'
  ]
};

function generateTownName(size) {
  if (size === 'city') {
    // Special naming for cities (some get castle-like names)
    const useKeepName = Math.random() < 0.3; // 30% chance
    if (useKeepName) {
      const prefix = random(nameComponents.prefixes);
      const suffix = random(nameComponents.castleNames);
      return `${prefix} ${suffix}`;
    }
  }
  
  // Standard town names for hamlet, village, town, and most cities
  const prefix = random(nameComponents.prefixes);
  const suffix = random(nameComponents.suffixes);
  return `${prefix}${suffix}`;
}
```

### Name Categories by Region
```javascript
const regionalNames = {
  plains: {
    prefixes: ['Green', 'Fair', 'Golden', 'Wheat', 'Barley'],
    suffixes: ['field', 'meadow', 'vale', 'haven', 'rest']
  },
  forest: {
    prefixes: ['Oak', 'Pine', 'Elder', 'Willow', 'Ash'],
    suffixes: ['wood', 'grove', 'glen', 'hollow', 'shade']
  },
  mountain: {
    prefixes: ['Stone', 'Iron', 'High', 'Peak', 'Snow'],
    suffixes: ['hold', 'keep', 'watch', 'guard', 'peak']
  },
  water: {
    prefixes: ['River', 'Lake', 'Bay', 'Harbor', 'Tide'],
    suffixes: ['port', 'haven', 'bridge', 'ford', 'mouth']
  }
};
```

## 🚪 Sub-Map Entry/Exit System

### Directional Entry Points
When a player moves from one tile to another on the world map, they should enter the sub-map from the appropriate edge:

```javascript
// Entry point calculation based on movement direction
const getEntryPoint = (fromTile, toTile, subMapSize) => {
  const dx = toTile.x - fromTile.x;
  const dy = toTile.y - fromTile.y;
  
  const center = Math.floor(subMapSize / 2);
  
  if (dy < 0) {
    // Moving north -> enter from south edge
    return { x: center, y: subMapSize - 1, edge: 'south' };
  } else if (dy > 0) {
    // Moving south -> enter from north edge  
    return { x: center, y: 0, edge: 'north' };
  } else if (dx < 0) {
    // Moving west -> enter from east edge
    return { x: subMapSize - 1, y: center, edge: 'east' };
  } else if (dx > 0) {
    // Moving east -> enter from west edge
    return { x: 0, y: center, edge: 'west' };
  }
  
  // Default to center (shouldn't happen)
  return { x: center, y: center, edge: 'center' };
};
```

### Exit Detection
```javascript
// Detect when player tries to leave sub-map
const checkSubMapExit = (playerPos, subMapSize, currentEdge) => {
  const { x, y } = playerPos;
  
  // Check if player is at edge and trying to move further
  if (x === 0) return { canExit: true, direction: 'west' };
  if (x === subMapSize - 1) return { canExit: true, direction: 'east' };
  if (y === 0) return { canExit: true, direction: 'north' };
  if (y === subMapSize - 1) return { canExit: true, direction: 'south' };
  
  return { canExit: false };
};
```

### Sub-Map Transition Flow
1. **Player clicks adjacent tile on world map**
2. **System calculates entry direction** (north/south/east/west)
3. **Generate or load sub-map** for target tile
4. **Place player at appropriate edge** of sub-map
5. **Switch to sub-map view** with entry point highlighted

### Exit Flow
1. **Player moves to edge of sub-map**
2. **System prompts**: "Leave Millbrook?" 
3. **If confirmed**: Return to world map at original tile
4. **Player position**: Back on world map tile

## 🛤️ Path System Between Towns

### Overview
Create visual paths connecting towns on the world map to enhance navigation and visual appeal.

### Path Generation Algorithm

#### 1. Find Shortest Paths
Use A* or Dijkstra's algorithm to find shortest paths between all towns:
```javascript
// Pathfinding between towns
const generateTownPaths = (mapData, townsList) => {
  const paths = [];
  
  // Connect each town to its nearest neighbors
  townsList.forEach((town, index) => {
    // Find 1-2 nearest towns
    const nearestTowns = findNearestTowns(town, townsList, 2);
    
    nearestTowns.forEach(targetTown => {
      // Use A* to find path
      const path = findPath(mapData, town, targetTown);
      if (path) {
        paths.push(path);
      }
    });
  });
  
  return paths;
};
```

#### 2. Path Tile Marking
```javascript
// Mark tiles as part of a path
const markPathTiles = (mapData, paths) => {
  paths.forEach(path => {
    path.forEach(tile => {
      if (mapData[tile.y][tile.x].poi === null) {
        mapData[tile.y][tile.x].hasPath = true;
        mapData[tile.y][tile.x].pathDirection = calculateDirection(tile, path);
      }
    });
  });
};
```

#### 3. Visual Path Rendering
Paths should curve naturally within tiles:
```javascript
// In WorldMapDisplay.js - render path overlay
const renderPath = (tile) => {
  if (!tile.hasPath) return null;
  
  // SVG path with curves based on entry/exit directions
  return (
    <svg className="path-overlay" viewBox="0 0 40 40">
      <path
        d={generateCurvedPath(tile.pathDirection)}
        stroke="#8B4513"  // Brown color
        strokeWidth="3"
        fill="none"
        opacity="0.7"
      />
    </svg>
  );
};
```

### Path Direction System
```javascript
const pathDirections = {
  NORTH_SOUTH: 'M20,0 L20,40',           // Straight vertical
  EAST_WEST: 'M0,20 L40,20',             // Straight horizontal
  NORTH_EAST: 'M20,0 Q20,20 40,20',      // Curved from north to east
  NORTH_WEST: 'M20,0 Q20,20 0,20',       // Curved from north to west
  SOUTH_EAST: 'M20,40 Q20,20 40,20',     // Curved from south to east
  SOUTH_WEST: 'M20,40 Q20,20 0,20',      // Curved from south to west
  INTERSECTION: 'M20,0 L20,40 M0,20 L40,20' // Cross intersection
};
```

### Path Tile Properties
```javascript
{
  x: 5, y: 5,
  biome: 'plains',
  poi: null,
  hasPath: true,              // NEW: indicates path present
  pathDirection: 'NORTH_EAST', // NEW: path direction for rendering
  pathConnections: ['north', 'east'] // NEW: which sides connect
}
```

### Implementation Steps
1. **Add pathfinding algorithm** (A* implementation)
2. **Generate paths during map creation** (after towns are placed)
3. **Mark path tiles** with direction information
4. **Update WorldMapDisplay** to render path overlays
5. **Add path styling** (brown color, curves, transparency)

### Visual Design
- **Color**: Brown (#8B4513) with 70% opacity
- **Width**: 3-4 pixels
- **Style**: Curved paths using SVG quadratic bezier curves
- **Layering**: Paths render below POI emojis but above biome color

### Pathfinding Considerations
- **Avoid water tiles** (if present)
- **Prefer plains over forests/mountains** (optional weight system)
- **Connect to nearest 1-2 neighbors** (avoid over-connecting)
- **Ensure all towns are reachable** (minimum spanning tree)

## 🏗️ Implementation Strategy

### Phase 1: Foundation (Immediate)
1. **Create Name Generator**
   - `townNameGenerator.js` - generates contextual town names
   - Regional name variations based on biome
   - Size-appropriate naming conventions

2. **Extend Town Size System**
   - Update `mapGenerator.js` to assign town sizes
   - Add castle towns (1 per map maximum)
   - Update POI emojis in `WorldMapDisplay.js`

3. **Extend Database Schema**
   - Add `townName`, `townSize` fields to tiles
   - Add `subMaps` field to conversation storage
   - Update save/load functions in `server.js`

### Phase 2: Sub-Map Generation
4. **Create Town Map Generators**
   - `townMapGenerator.js` - base town generation
   - Size-specific generators for each town type
   - Castle-specific features (keep, walls, districts)

5. **Update Map Modal UI**
   - Add "View Local Map" / "View World Map" toggle
   - Show current map level indicator
   - Display town names in tooltips

### Phase 3: Core Functionality
6. **Map Navigation System**
   - Detect when player clicks on tile with sub-map
   - Transition between map levels
   - Handle entry/exit points

7. **Enhanced WorldMapDisplay**
   - Support multiple map types
   - Different rendering for different levels
   - Show town names on hover/click

## 🎨 UI/UX Design

### Updated Map Modal
```
┌─────────────────────────────────┐
│ 🗺️ Maps - Millbrook (Large City)│
│ ┌─ World Map > Millbrook ──────┐│
│ │ [World] [Local] [🏠 Building]││  
│ │                              ││
│ │  🏛️  🏪  🏘️  🏛️             ││
│ │     🛤️     🛤️               ││
│ │  🏘️  ⛲  🏪  🏘️             ││  <- Market Square
│ │     🛤️  ⭐  🛤️               ││  <- Player
│ │  🏪  🏘️  🏛️  🏪             ││
│ │                              ││
│ └──────────────────────────────┘│
│              [Close]             │
└─────────────────────────────────┘
```

### World Map with Named Towns
```
🏡 Millbrook    🏰 Ironhold Keep
   (Village)       (Castle)

🏘️ Fairhaven    🏙️ Goldport
   (Town)          (City)
```

## 🔧 Technical Implementation Details

### 1. Enhanced Map Generator
```javascript
// mapGenerator.js updates
function assignTownSizes(townsList, rng) {
  // Ensure variety in town sizes
  const sizes = ['small', 'small', 'medium', 'large']; // Weighted distribution
  
  // Always have one castle if 3+ towns
  if (townsList.length >= 3) {
    sizes.push('castle');
  }
  
  return townsList.map((town, index) => ({
    ...town,
    size: sizes[index % sizes.length] || 'small',
    name: generateTownName(sizes[index % sizes.length], town.biome)
  }));
}
```

### 2. Updated POI Emojis
```javascript
// WorldMapDisplay.js updates
const poiEmojis = {
  forest: '🌲',
  mountain: '⛰️',
  cave_entrance: '🕳️',
  // Town emojis by size
  town_hamlet: '🛖',
  town_village: '🏡',
  town_town: '🏘️', 
  town_city: '🏰'
};

// Dynamic emoji selection
const getTownEmoji = (tile) => {
  if (tile.poi === 'town') {
    return poiEmojis[`town_${tile.townSize}`] || poiEmojis.town_hamlet;
  }
  return poiEmojis[tile.poi];
};
```

### 3. Castle Sub-Map Features
```javascript
const castleLayout = {
  outerWalls: true,
  innerWalls: true,
  keep: { x: 12, y: 12 }, // Center of 25x25 map
  districts: [
    { name: 'Noble Quarter', area: {x: 10, y: 10, w: 6, h: 6} },
    { name: 'Merchant District', area: {x: 5, y: 15, w: 8, h: 5} },
    { name: 'Barracks', area: {x: 15, y: 5, w: 5, h: 8} },
    { name: 'Stables', area: {x: 2, y: 2, w: 6, h: 4} }
  ],
  gates: [
    { x: 12, y: 0, direction: 'north' },
    { x: 24, y: 12, direction: 'east' },
    { x: 12, y: 24, direction: 'south' },
    { x: 0, y: 12, direction: 'west' }
  ]
};
```

## 🎯 Current Implementation Status

### Encounter System (Phase 0) - ✅ COMPLETED
**Date Completed:** 2025-10-10

The encounter system provides a modal interface when players arrive at POI locations, offering choices for interaction.

**Components Added:**
- `EncounterModalContent` - React component in `Game.js`
- `isEncounterModalOpen` - State for modal visibility
- `currentEncounter` - State for encounter data
- `handleEnterLocation()` - Handler for entering locations (stub)

**Encounter Data Structure:**
```javascript
{
  name: 'Millbrook',           // POI name from tile
  poiType: 'town',             // Type of location
  description: '...',          // Location description
  canEnter: true,              // Whether location is enterable
  tile: {...}                  // Full tile data
}
```

**Location Icons:**
- Town: 🏘️
- City: 🏰
- Village: 🏡
- Hamlet: 🏚️
- Dungeon: ⚔️
- Ruins: 🏛️
- Cave: 🕳️
- Forest: 🌲
- Mountain: ⛰️

**User Actions:**
1. **Enter [Location]** - Available for towns, cities, villages, hamlets, dungeons
2. **Continue Journey** - Close modal, stay on world map
3. **View Map** - Opens map modal for navigation

**Trigger Logic:**
- Automatically detects POI when player moves to new tile
- Creates encounter object from tile data
- Shows modal with appropriate icon and options
- Guides user to map navigation

**Next Integration Point:**
The `handleEnterLocation()` function is ready to:
1. Generate/load town map
2. Switch to town map view
3. Place player at entry point
4. Enable town navigation

---

## 📋 Development Roadmap

### ✅ Phase 0: Encounter System (COMPLETED)
- [x] Create encounter modal component
- [x] Add encounter detection on tile movement
- [x] Display location icon, name, and description
- [x] Add action buttons (Enter Location, Continue Journey, View Map)
- [x] Add user guidance tip for map navigation
- [x] Create `handleEnterLocation()` stub for future integration

**Implementation Details:**
- `EncounterModalContent` component in `Game.js`
- Triggers when player moves to POI tile
- Shows large emoji icon based on location type
- Provides 3 action options
- Ready for Phase 1 integration

### ✅ Sprint 1: Town Map Generation (COMPLETED)
- [x] Create `townMapGenerator.js` with size-based generation
- [x] Implement hamlet (8x8), village (12x12), town (16x16), city (20x20) maps
- [x] Add building placement system (houses, shops, temples, etc.)
- [x] Create path generation between buildings
- [x] Add city walls and keep for cities
- [x] Integrate town map display into encounter modal
- [x] Add "Leave Town" functionality to return to world map

**Implementation Details:**
- `TownMapDisplay` component renders town maps with full visual styling
- `handleEnterLocation()` generates town map and switches to town view
- `handleLeaveTown()` returns player to world map
- Map modal shows either world or town map based on `currentMapLevel` state
- Player position tracked separately for world and town maps
- Entry point marked with blue border, player marked with yellow star ⭐

### Sprint 2: Map State Management (IN PROGRESS)  
- [x] Add current map level state (`worldMap` vs `townMap`)
- [x] Implement map switching logic
- [x] Track player position across map levels
- [ ] Extend database schema for sub-maps storage
- [ ] Save/load sub-maps with game state
- [ ] Persist town maps across sessions

**Completed:**
- State variables: `currentMapLevel`, `currentTownMap`, `townPlayerPosition`, `currentTownTile`
- Map switching works between world and town views
- Player positions tracked independently

**Remaining:**
- Database schema updates for storing generated town maps
- Save/load functionality for town map state

### Sprint 3: Town Navigation (NEXT)
- [ ] Enable tile-by-tile movement within towns
- [ ] Add building interaction system (click to enter shops, inns, etc.)
- [ ] Implement exit detection at town edges
- [ ] Add "Leave Town" confirmation dialog
- [ ] AI descriptions for town locations

### Sprint 4: Names & Polish (1-2 days)
- [ ] Create `townNameGenerator.js`
- [ ] Update town generation to assign names
- [ ] Update WorldMapDisplay with size-based emojis
- [ ] Add town names to tooltips and encounter modal

### Future Enhancements:
- [ ] Forest/mountain sub-maps with appropriate names
- [ ] Building interiors (Level 2) - "The Prancing Pony Inn"
- [ ] Dynamic name generation based on AI descriptions
- [ ] Historical events affecting town names and sizes

## 🎮 Gameplay Integration

### Enhanced AI Context
```javascript
// Include town information in AI prompts
const locationInfo = `Player is in ${currentTile.townName} (${currentTile.townSize} ${currentTile.poi}) 
at coordinates (${playerPosition.x}, ${playerPosition.y}) in a ${currentTile.biome} biome.`;
```

### Town-Specific Encounters
- **Villages**: Simple quests, local rumors
- **Towns**: Trade opportunities, guild missions  
- **Cities**: Political intrigue, major questlines
- **Castles**: Noble audiences, military campaigns

This enhanced system will create a much more immersive and varied world for players to explore!
