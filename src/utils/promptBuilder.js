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
 * Build a movement prompt for the AI, optionally injecting narrative encounter context
 * @param {Object} tile - The tile the player moved to
 * @param {Object} settings - Game settings
 * @param {Object|null} narrativeEncounter - Optional narrative encounter to weave into description
 * @returns {string} - Formatted prompt for AI
 */
export const buildMovementPrompt = (tile, settings, narrativeEncounter = null) => {
  const biomeDescription = getBiomeDescription(tile.biome);
  
  let prompt = `The party moves to a new location: ${biomeDescription}.

Coordinates: (${tile.x}, ${tile.y})
Biome: ${tile.biome}`;

  // Inject narrative encounter if present
  if (narrativeEncounter) {
    prompt += `\n\n**IMPORTANT - Encounter Hook:**
${narrativeEncounter.aiContext}

Weave this discovery naturally into your description. The players can choose to engage with it through conversation or ignore it. Don't force interaction - just make them aware of it.`;
  }

  prompt += `\n\nDescribe what the party sees and experiences as they arrive. Keep it brief (2-3 sentences) and atmospheric.`;
  
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
