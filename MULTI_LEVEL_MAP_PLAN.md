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

## 📋 Development Roadmap

### Sprint 1: Names & Sizes (1-2 days)
- [ ] Create `townNameGenerator.js`
- [ ] Update town generation to assign sizes and names
- [ ] Update WorldMapDisplay with size-based emojis
- [ ] Add town names to tooltips

### Sprint 2: Database & UI (2-3 days)  
- [ ] Extend database schema for sub-maps
- [ ] Create basic town map generator
- [ ] Update map modal UI with level toggle
- [ ] Add town name display in UI

### Sprint 3: Sub-Maps (3-4 days)
- [ ] Implement castle map generation
- [ ] Add map transition system
- [ ] Integrate with existing save/load system
- [ ] Test multi-level functionality

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
