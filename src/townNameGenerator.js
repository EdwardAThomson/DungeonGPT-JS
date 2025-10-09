// townNameGenerator.js
// Generates contextual town names based on size and biome

/**
 * Name components for generating town names
 */
const nameComponents = {
  prefixes: [
    'Mill', 'Stone', 'River', 'Oak', 'Iron', 'Gold', 'Silver', 'Green', 
    'White', 'Black', 'Red', 'Blue', 'High', 'Low', 'North', 'South',
    'East', 'West', 'Old', 'New', 'Fair', 'Bright', 'Dark', 'Swift',
    'Deep', 'Shallow', 'Long', 'Short', 'Broad', 'Narrow', 'Wide'
  ],
  suffixes: [
    'brook', 'ford', 'bridge', 'haven', 'port', 'gate', 'hill', 'dale',
    'wood', 'field', 'moor', 'shire', 'ton', 'burg', 'keep', 'hold',
    'watch', 'guard', 'rest', 'fall', 'ridge', 'vale', 'glen', 'marsh',
    'crest', 'point', 'bay', 'cove', 'landing', 'crossing'
  ],
  cityNames: [
    'Stronghold', 'Fortress', 'Citadel', 'Bastion', 'Rampart', 'Bulwark',
    'Keep', 'Castle', 'Tower', 'Spire', 'Crown', 'Throne', 'Palace'
  ]
};

/**
 * Regional name variations based on biome
 */
const regionalNames = {
  plains: {
    prefixes: ['Green', 'Fair', 'Golden', 'Wheat', 'Barley', 'Corn', 'Hay', 'Meadow'],
    suffixes: ['field', 'meadow', 'vale', 'haven', 'rest', 'shire', 'ton', 'dale']
  },
  forest: {
    prefixes: ['Oak', 'Pine', 'Elder', 'Willow', 'Ash', 'Birch', 'Cedar', 'Maple'],
    suffixes: ['wood', 'grove', 'glen', 'hollow', 'shade', 'leaf', 'branch', 'root']
  },
  mountain: {
    prefixes: ['Stone', 'Iron', 'High', 'Peak', 'Snow', 'Granite', 'Cliff', 'Summit'],
    suffixes: ['hold', 'keep', 'watch', 'guard', 'peak', 'crest', 'ridge', 'point']
  },
  water: {
    prefixes: ['River', 'Lake', 'Bay', 'Harbor', 'Tide', 'Wave', 'Stream', 'Current'],
    suffixes: ['port', 'haven', 'bridge', 'ford', 'mouth', 'bay', 'cove', 'landing']
  }
};

/**
 * Get a random element from an array using provided RNG
 * @param {Array} array - Array to select from
 * @param {Function} rng - Random number generator function
 * @returns {*} Random element from array
 */
const randomElement = (array, rng = Math.random) => {
  return array[Math.floor(rng() * array.length)];
};

/**
 * Generate a town name based on size and biome
 * @param {string} size - Town size: 'hamlet', 'village', 'town', or 'city'
 * @param {string} biome - Biome type: 'plains', 'forest', 'mountain', 'water'
 * @param {Function} rng - Random number generator function (optional)
 * @returns {string} Generated town name
 */
export const generateTownName = (size = 'village', biome = 'plains', rng = Math.random) => {
  // Cities have a 30% chance of getting a grand name
  if (size === 'city' && rng() < 0.3) {
    const prefix = randomElement(nameComponents.prefixes, rng);
    const suffix = randomElement(nameComponents.cityNames, rng);
    return `${prefix} ${suffix}`;
  }
  
  // Use regional names if biome is recognized, otherwise use generic names
  let prefixList, suffixList;
  
  if (regionalNames[biome]) {
    // 70% chance to use regional names, 30% chance to use generic
    if (rng() < 0.7) {
      prefixList = regionalNames[biome].prefixes;
      suffixList = regionalNames[biome].suffixes;
    } else {
      prefixList = nameComponents.prefixes;
      suffixList = nameComponents.suffixes;
    }
  } else {
    // Unknown biome, use generic names
    prefixList = nameComponents.prefixes;
    suffixList = nameComponents.suffixes;
  }
  
  const prefix = randomElement(prefixList, rng);
  const suffix = randomElement(suffixList, rng);
  
  return `${prefix}${suffix}`;
};

/**
 * Generate multiple unique town names
 * @param {number} count - Number of names to generate
 * @param {string} biome - Biome type
 * @param {Array<string>} sizes - Array of town sizes
 * @param {Function} rng - Random number generator function (optional)
 * @returns {Array<string>} Array of unique town names
 */
export const generateUniqueTownNames = (count, biome = 'plains', sizes = [], rng = Math.random) => {
  const names = new Set();
  const maxAttempts = count * 10; // Prevent infinite loops
  let attempts = 0;
  
  while (names.size < count && attempts < maxAttempts) {
    const size = sizes[names.size] || 'village';
    const name = generateTownName(size, biome, rng);
    names.add(name);
    attempts++;
  }
  
  return Array.from(names);
};

/**
 * Test function to generate sample names
 */
export const testNameGenerator = () => {
  console.log('=== TOWN NAME GENERATOR TEST ===');
  
  const biomes = ['plains', 'forest', 'mountain', 'water'];
  const sizes = ['hamlet', 'village', 'town', 'city'];
  
  biomes.forEach(biome => {
    console.log(`\n${biome.toUpperCase()} Towns:`);
    sizes.forEach(size => {
      const name = generateTownName(size, biome);
      console.log(`  ${size.padEnd(10)} - ${name}`);
    });
  });
  
  console.log('\n=== TEST COMPLETE ===');
};

/**
 * Generate a tavern name
 * @param {Function} rng - Random number generator function (optional)
 * @returns {string} Generated tavern name
 */
export const generateTavernName = (rng = Math.random) => {
  const adjectives = [
    'Prancing', 'Golden', 'Silver', 'Drunken', 'Rusty', 'Broken', 'Dancing',
    'Sleeping', 'Laughing', 'Singing', 'Roaring', 'Jolly', 'Merry', 'Red',
    'Green', 'Blue', 'Black', 'White', 'Iron', 'Stone', 'Wooden'
  ];
  
  const nouns = [
    'Pony', 'Dragon', 'Lion', 'Bear', 'Boar', 'Stag', 'Eagle', 'Crow',
    'Tankard', 'Barrel', 'Flagon', 'Mug', 'Keg', 'Bottle', 'Goblet',
    'Sword', 'Shield', 'Hammer', 'Axe', 'Anchor', 'Wheel', 'Crown'
  ];
  
  const adj = adjectives[Math.floor(rng() * adjectives.length)];
  const noun = nouns[Math.floor(rng() * nouns.length)];
  
  return `The ${adj} ${noun}`;
};

/**
 * Generate a guild name
 * @param {Function} rng - Random number generator function (optional)
 * @returns {string} Generated guild name
 */
export const generateGuildName = (rng = Math.random) => {
  const types = [
    'Merchants', 'Artisans', 'Craftsmen', 'Traders', 'Smiths', 'Masons',
    'Weavers', 'Brewers', 'Bakers', 'Scribes', 'Scholars', 'Mages',
    'Alchemists', 'Healers', 'Adventurers', 'Explorers'
  ];
  
  const descriptors = [
    'Honorable', 'Ancient', 'Noble', 'Royal', 'Imperial', 'Grand',
    'United', 'Free', 'Independent', 'Loyal', 'True', 'Faithful'
  ];
  
  const type = types[Math.floor(rng() * types.length)];
  
  // 50% chance to add descriptor
  if (rng() < 0.5) {
    const desc = descriptors[Math.floor(rng() * descriptors.length)];
    return `${desc} ${type} Guild`;
  }
  
  return `${type} Guild`;
};

/**
 * Generate a bank name
 * @param {Function} rng - Random number generator function (optional)
 * @returns {string} Generated bank name
 */
export const generateBankName = (rng = Math.random) => {
  const founders = [
    'Goldsworth', 'Silverton', 'Ironvault', 'Stonekeeper', 'Coinmaster',
    'Wealthguard', 'Treasurekeep', 'Safehaven', 'Vaultwright', 'Gemhold',
    'Richman', 'Moneychanger', 'Goldkeeper', 'Silversmith'
  ];
  
  const types = [
    'Bank', 'Trust', 'Vault', 'Treasury', 'Reserve', 'Exchange',
    'Counting House', 'Money Lenders', 'Financial House'
  ];
  
  const founder = founders[Math.floor(rng() * founders.length)];
  const type = types[Math.floor(rng() * types.length)];
  
  // 70% chance for "Founder & Type" format, 30% for just "Founder Type"
  if (rng() < 0.7) {
    return `${founder} & Co. ${type}`;
  }
  
  return `${founder} ${type}`;
};

export default generateTownName;
