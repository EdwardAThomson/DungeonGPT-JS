// Utility for building AI prompts with optional narrative encounter context
// Phase 2.4: Two-tier encounter system

/**
 * Get a descriptive string for a biome type
 */
const getBiomeDescription = (biome) => {
  const descriptions = {
    'plains': 'rolling grasslands with scattered wildflowers',
    'forest': 'dense woodland with towering trees',
    'mountain': 'rugged mountain terrain with rocky paths',
    'beach': 'sandy coastline with crashing waves',
    'water': 'open water',
    'town': 'a settlement with buildings and people'
  };
  
  return descriptions[biome] || 'unfamiliar terrain';
};

/**
 * Get surrounding terrain description for AI context
 * @param {number} x - Current x coordinate
 * @param {number} y - Current y coordinate
 * @param {Array} worldMap - The world map grid
 * @returns {string} - Description of surrounding tiles
 */
const getSurroundingTerrain = (x, y, worldMap) => {
  if (!worldMap || worldMap.length === 0) return null;
  
  const directions = [
    { dx: 0, dy: -1, name: 'North' },
    { dx: 1, dy: 0, name: 'East' },
    { dx: 0, dy: 1, name: 'South' },
    { dx: -1, dy: 0, name: 'West' }
  ];
  
  const terrainInfo = [];
  
  directions.forEach(({ dx, dy, name }) => {
    const newX = x + dx;
    const newY = y + dy;
    
    // Check bounds
    if (newY >= 0 && newY < worldMap.length && newX >= 0 && newX < worldMap[0].length) {
      const tile = worldMap[newY][newX];
      
      if (tile.biome === 'town' && tile.townName) {
        terrainInfo.push(`${name}: ${tile.townName} (town)`);
      } else if (tile.biome === 'mountain' && tile.mountainName) {
        terrainInfo.push(`${name}: ${tile.mountainName} (mountain range)`);
      } else {
        terrainInfo.push(`${name}: ${tile.biome}`);
      }
    }
  });
  
  return terrainInfo.length > 0 ? terrainInfo.join('\n') : null;
};

// Tone examples for Look around prompts: several, deliberately different, so the
// model takes length and voice from them rather than copying one shape.
export const LOOK_TONE_EXAMPLES = `Tone examples (for length and voice only; do not reuse their wording, images or structure):
- Water ticks somewhere in the dark ahead. The torchlight finds a low roof furred with damp and a floor of loose shale that shifts underfoot; beyond the third bend, the air turns colder.
- Wind combs the long grass flat and lets it rise again. To the north the land climbs toward bare grey shoulders of rock, and a thin line of smoke stands above them, too steady to be a grass fire.
- Half a wall still stands, its mortar gone to sand. Someone has stacked fallen stones into a rough hearth in its shelter, and the ash in it is not old.`;

// What a world tile's POI is, for a Look around on it.
const POI_PHRASES = {
  cave_entrance: 'the dark mouth of a cave',
  cave: 'the dark mouth of a cave',
  ruins: 'old ruins',
  forest: 'the edge of a wood',
  grove: 'a quiet grove',
  hills: 'rolling hills',
  mountain: 'mountain slopes',
  peak: 'a high peak'
};

// Compass direction from (x, y) toward (tx, ty), e.g. 'north-west'.
const directionTo = (x, y, tx, ty) => {
  const ns = ty < y ? 'north' : ty > y ? 'south' : '';
  const ew = tx < x ? 'west' : tx > x ? 'east' : '';
  return ns && ew ? `${ns}-${ew}` : ns || ew;
};

/**
 * Build a movement prompt for the AI, optionally injecting narrative encounter context
 * @param {Object} tile - The tile the player moved to
 * @param {Object} settings - Game settings
 * @param {Object|null} narrativeEncounter - Optional narrative encounter to weave into description
 * @param {Array} worldMap - The full world map (optional, for surrounding terrain context)
 * @param {Object} [opts] - { look: a Look around where the party stands (not an arrival),
 *   placeName: the name of the cave / ruin / mountain on this tile, if known }
 * @returns {string} - Formatted prompt for AI
 */
export const buildMovementPrompt = (tile, settings, narrativeEncounter = null, worldMap = null, opts = {}) => {
  const { look = false, placeName = null } = opts;
  const biomeDescription = getBiomeDescription(tile.biome);
  
  let prompt = look
    ? `The party stops and looks around where they stand: ${biomeDescription}.`
    : `The party moves to a new location: ${biomeDescription}.`;
  if (look && POI_PHRASES[tile.poi]) {
    prompt += ` Right here is ${POI_PHRASES[tile.poi]}${placeName ? `, known as "${placeName}" (a place, not a person)` : ''}.`;
  }
  prompt += `

Coordinates: (${tile.x}, ${tile.y})
Biome: ${tile.biome}`;

  // Add surrounding terrain context if worldMap is provided
  if (worldMap) {
    const surroundingTerrain = getSurroundingTerrain(tile.x, tile.y, worldMap);
    if (surroundingTerrain) {
      prompt += `\n\n**Surrounding Terrain:**
${surroundingTerrain}`;
    }
  }

  // Inject narrative encounter if present
  if (narrativeEncounter) {
    prompt += `\n\n**IMPORTANT - Encounter Hook:**
${narrativeEncounter.aiContext}`;
    // A hook rolled on an earlier tile is a short way back, not underfoot.
    const origin = narrativeEncounter.origin;
    if (origin && (origin.x !== tile.x || origin.y !== tile.y)) {
      const dir = directionTo(tile.x, tile.y, origin.x, origin.y);
      prompt += `\nThis is a short way back${dir ? ` to the ${dir}` : ''}, where the party has just been, not where they stand now.`;
    }
    prompt += `

Weave this discovery naturally into your description. The players can choose to engage with it through conversation or ignore it. Don't force interaction - just make them aware of it.`;
  }

  prompt += look
    ? `\n\nDescribe what the party sees from where they stand. Keep it brief (2-3 sentences) and atmospheric. Base your description on this tile and the actual surrounding terrain provided. Do not describe the party travelling.\n\n${LOOK_TONE_EXAMPLES}`
    : `\n\nDescribe what the party sees and experiences as they arrive. Keep it brief (2-3 sentences) and atmospheric. Base your description on the actual surrounding terrain provided.`;
  
  return prompt;
};

/**
 * Build a prompt for entering a town
 * @param {Object} townTile - The town tile
 * @param {string} townName - Name of the town
 * @returns {string} - Formatted prompt for AI
 */
export const buildTownEntryPrompt = (townTile, townName) => {
  return `The party enters ${townName}, a ${townTile.poiType || 'settlement'}.

Describe the town's atmosphere, notable features, and the general mood of the inhabitants. Keep it brief (2-3 sentences).`;
};

/**
 * Check if a message contains keywords suggesting engagement with a narrative encounter
 * @param {string} message - User's message
 * @param {Object} encounter - The narrative encounter context
 * @returns {boolean} - True if user is trying to engage
 */
export const messageContainsEngagement = (message, encounter) => {
  if (!message || !encounter) return false;
  
  const engagementKeywords = [
    'approach', 'investigate', 'talk to', 'examine', 
    'help', 'attack', 'engage', 'interact', 'check out',
    'look at', 'inspect', 'go to', 'move to', 'head to'
  ];
  
  const messageLower = message.toLowerCase();
  const hookLower = encounter.hook?.toLowerCase() || '';
  
  // Check if message includes action keyword
  const hasActionKeyword = engagementKeywords.some(keyword => messageLower.includes(keyword));
  
  // Check if message references the encounter
  const referencesEncounter = 
    messageLower.includes(hookLower) ||
    messageLower.includes('stranger') ||
    messageLower.includes('traveler') ||
    messageLower.includes('treasure') ||
    messageLower.includes('smoke') ||
    messageLower.includes('merchant') ||
    messageLower.includes('bard') ||
    messageLower.includes('minstrel') ||
    messageLower.includes('child') ||
    messageLower.includes('shrine') ||
    messageLower.includes('herbs') ||
    messageLower.includes('camp');
  
  return hasActionKeyword && referencesEncounter;
};
