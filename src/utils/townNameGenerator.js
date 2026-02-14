// townNameGenerator.js
// Generates contextual town names based on size and biome
import { HUMAN_NAMES_MALE, HUMAN_NAMES_FEMALE, NOBLE_LAST_NAMES } from './nameData';

/**
 * Name components for generating town names
 */
const nameComponents = {
  prefixes: [
    'Mill', 'Stone', 'River', 'Oak', 'Iron', 'Gold', 'Silver', 'Green',
    'White', 'Black', 'Red', 'Blue', 'High', 'Low', 'North', 'South',
    'East', 'West', 'Old', 'New', 'Fair', 'Bright', 'Dark', 'Swift',
    'Deep', 'Shallow', 'Long', 'Short', 'Broad', 'Narrow', 'Wide',
    'Winter', 'Summer', 'Spring', 'Autumn', 'Frost', 'Sun', 'Moon', 'Star',
    'Cloud', 'Mist', 'Fog', 'Rain', 'Storm', 'Thunder', 'Wind', 'Snow',
    'Crystal', 'Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Amber', 'Jade'
  ],
  /*
  suffixes: [
    'brook', 'ford', 'bridge', 'haven', 'port', 'gate', 'hill', 'dale',
    'wood', 'field', 'moor', 'shire', 'ton', 'burg', 'keep', 'hold',
    'watch', 'guard', 'rest', 'fall', 'ridge', 'vale', 'glen', 'marsh',
    'crest', 'point', 'bay', 'cove', 'landing', 'crossing',
    'cliff', 'rock', 'stone', 'mount', 'peak', 'view', 'side', 'edge',
    'wall', 'moat', 'tower', 'spire', 'helm', 'home', 'stead', 'wick'
  ],
  */
  historicalSuffixes: {
    hamlet: ['stead', 'wick', 'croft', 'well', 'hill', 'side', 'edge'],
    village: ['ton', 'ham', 'ley', 'worth', 'field', 'wood', 'burn'],
    town: ['market', 'ford', 'bridge', 'haven', 'shire', 'mouth', 'crossing'],
    city: ['burg', 'bury', 'caster', 'chester', 'cester', 'keep', 'hold', 'bastion']
  },
  cityNames: [
    'Stronghold', 'Fortress', 'Citadel', 'Bastion', 'Rampart', 'Bulwark',
    'Keep', 'Castle', 'Tower', 'Spire', 'Crown', 'Throne', 'Palace',
    'Capital', 'Metropolis', 'Sanctuary', 'Dominion', 'Empire'
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

  // 20% chance for town/city to be named after a noble family
  if ((size === 'town' || size === 'city') && rng() < 0.2) {
    const noblePrefix = randomElement(NOBLE_LAST_NAMES, rng);
    const townSuffixes = ['ton', 'burg', 'shire', 'hold', 'wick', 'stead'];
    const suffix = randomElement(townSuffixes, rng);
    return `${noblePrefix}${suffix}`;
  }

  // Use regional names if biome is recognized, otherwise use generic names
  let prefixList;

  if (regionalNames[biome]) {
    // 70% chance to use regional names, 30% chance to use generic
    if (rng() < 0.7) {
      prefixList = regionalNames[biome].prefixes;
    } else {
      prefixList = nameComponents.prefixes;
    }
  } else {
    // Unknown biome, use generic names
    prefixList = nameComponents.prefixes;
  }

  const prefix = randomElement(prefixList, rng);

  // --- NEW HISTORICAL SUFFIX LOGIC ---
  const historicalList = nameComponents.historicalSuffixes[size] || nameComponents.historicalSuffixes.village;

  /* 
  // Old generic/biome suffix logic (commented out for testing new variation)
  let suffixList;
  if (regionalNames[biome] && rng() < 0.7) {
    suffixList = regionalNames[biome].suffixes;
  } else {
    suffixList = nameComponents.suffixes;
  }
  const suffix = randomElement(suffixList, rng);
  */

  const suffix = randomElement(historicalList, rng);

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
    'Green', 'Blue', 'Black', 'White', 'Iron', 'Stone', 'Wooden',
    'Crimson', 'Azure', 'Violet', 'Amber', 'Emerald', 'Sapphire', 'Ruby',
    'Lost', 'Wandering', 'Hidden', 'Secret', 'Silent', 'Whispering', 'Howling',
    'Flying', 'Running', 'Jumping', 'Fighting', 'Smiling', 'Crying', 'Blind'
  ];

  const nouns = [
    'Pony', 'Dragon', 'Lion', 'Bear', 'Boar', 'Stag', 'Eagle', 'Crow',
    'Tankard', 'Barrel', 'Flagon', 'Mug', 'Keg', 'Bottle', 'Goblet',
    'Sword', 'Shield', 'Hammer', 'Axe', 'Anchor', 'Wheel', 'Crown',
    'Goat', 'Sheep', 'Wolf', 'Fox', 'Cat', 'Dog', 'Horse', 'Mare',
    'Wizard', 'Knight', 'King', 'Queen', 'Prince', 'Princess', 'Jester',
    'Ghost', 'Spirit', 'Soul', 'Shadow', 'Flame', 'Fire', 'Ice', 'Frost'
  ];

  const adj = adjectives[Math.floor(rng() * adjectives.length)];
  const noun = nouns[Math.floor(rng() * nouns.length)];

  return `The ${adj} ${noun}`;
};

/**
 * Generate a guild name with weighted probabilities
 * @param {Function} rng - Random number generator function (optional)
 * @returns {string} Generated guild name
 */
export const generateGuildName = (rng = Math.random) => {
  // Weighted categories
  const categories = [
    { weight: 60, types: ['Merchants', 'Smiths', 'Masons', 'Bakers', 'Brewers', 'Weavers', 'Carpenters', 'Farmers', 'Cobblers', 'Tailors'] }, // Common
    { weight: 25, types: ['Warriors', 'Healers', 'Alchemists', 'Scribes', 'Scholars', 'Inventors', 'Explorers', 'Rangers'] }, // Uncommon
    { weight: 10, types: ['Thieves', 'Assassins', 'Spies', 'Smugglers', 'Bards', 'Illusionists'] }, // Rare / Illicit
    { weight: 5, types: ['Mages', 'Wizards', 'Sorcerers', 'Necromancers', 'Druids'] } // Very Rare / Magic
  ];

  // Pick category based on weight
  const totalWeight = categories.reduce((sum, cat) => sum + cat.weight, 0);
  let randomVal = rng() * totalWeight;
  let selectedTypes = categories[0].types;

  for (const cat of categories) {
    if (randomVal < cat.weight) {
      selectedTypes = cat.types;
      break;
    }
    randomVal -= cat.weight;
  }

  const type = selectedTypes[Math.floor(rng() * selectedTypes.length)];

  const descriptors = [
    'Honorable', 'Ancient', 'Noble', 'Royal', 'Imperial', 'Grand',
    'United', 'Free', 'Independent', 'Loyal', 'True', 'Faithful',
    'Mystic', 'Secret', 'Hidden', 'Golden', 'Silver', 'Iron'
  ];

  // 40% chance to add descriptor
  if (rng() < 0.4) {
    const desc = descriptors[Math.floor(rng() * descriptors.length)];
    return `${desc} Order of ${type}`;
  } else if (rng() < 0.8) {
    return `${type} Guild`;
  } else {
    return `The Order of ${type}`;
  }
};

/**
 * Generate a temple name
 * @param {Function} rng - Random number generator function (optional)
 * @returns {string} Generated temple name
 */
export const generateTempleName = (rng = Math.random) => {
  const domains = [
    'Light', 'Life', 'Nature', 'War', 'Peace', 'Death', 'Storms', 'Seas',
    'Knowledge', 'Trickery', 'Love', 'Justice', 'Time', 'Fate'
  ];

  const titles = [
    'Temple', 'Shrine', 'Sanctuary', 'Cathedral', 'Chapel', 'Altar', 'Hall'
  ];

  const domain = domains[Math.floor(rng() * domains.length)];
  const title = titles[Math.floor(rng() * titles.length)];

  // 50/50 format split
  if (rng() < 0.5) {
    return `${title} of ${domain}`;
  } else {
    const adjectives = ['Holy', 'Sacred', 'Divine', 'Eternal', 'Blessed', 'Hallowed', 'Silent', 'Golden'];
    const adj = adjectives[Math.floor(rng() * adjectives.length)];
    return `The ${adj} ${title}`;
  }
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
    'Richman', 'Moneychanger', 'Goldkeeper', 'Silversmith',
    'Profitmaker', 'Loadstone', 'Bullion', 'Cache', 'Hoard', 'Stash'
  ];

  const types = [
    'Bank', 'Trust', 'Vault', 'Treasury', 'Reserve', 'Exchange',
    'Counting House', 'Money Lenders', 'Financial House',
    'Coffers', 'Depository', 'Fund', 'Investment', 'Capital'
  ];

  const founder = founders[Math.floor(rng() * founders.length)];
  const type = types[Math.floor(rng() * types.length)];

  // 70% chance for "Founder & Type" format, 30% for just "Founder Type"
  if (rng() < 0.7) {
    return `${founder} & Co. ${type}`;
  }

  return `${founder} ${type}`;
};

/**
 * Generate a shop name
 * @param {Function} rng - Random number generator function (optional)
 * @returns {string} Generated shop name
 */
export const generateShopName = (rng = Math.random) => {
  const format = rng() < 0.6 ? 'adjective_noun' : 'person_goods';

  if (format === 'adjective_noun') {
    const adjectives = [
      'Lucky', 'Golden', 'Silver', 'Honest', 'Fair', 'Quality', 'Best',
      'Quick', 'Strong', 'Sturdy', 'Fine', 'Cheap', 'Useful', 'Magic',
      'Mystic', 'Ancient', 'Old', 'New', 'Bright', 'Dark', 'Shining',
      'Rusty', 'Dusty', 'Clean', 'Dirty', 'Broken', 'Fixed'
    ];
    const nouns = [
      'Horseshoe', 'Hammer', 'Shield', 'Sword', 'Cloak', 'Potion', 'Scroll',
      'Backpack', 'Boot', 'Glove', 'Gem', 'Anvil', 'Arrow', 'Bow',
      'Lantern', 'Compass', 'Map', 'Book', 'Feather', 'Quill', 'Ink'
    ];
    const adj = adjectives[Math.floor(rng() * adjectives.length)];
    const noun = nouns[Math.floor(rng() * nouns.length)];
    return `The ${adj} ${noun}`;
  } else {
    const names = [...HUMAN_NAMES_MALE, ...HUMAN_NAMES_FEMALE];
    const goods = [
      "Goods", "Supplies", "Wares", "Trade", "Emporium", "Exchange",
      "General Store", "Market", "Provisions", "Equipment",
      "Trinkets", "Treasures", "Oddities", "Curiosities", "Sundries"
    ];
    const name = names[Math.floor(rng() * names.length)];
    const good = goods[Math.floor(rng() * goods.length)];
    return `${name}'s ${good}`;
  }
};

/**
 * Generate a manor or estate name
 * @param {Function} rng - Random number generator function (optional)
 * @returns {string} Generated manor name
 */
export const generateManorName = (rng = Math.random) => {
  const types = ["Manor", "Hall", "Estate", "House", "Keep", "Lodge", "Chateau", "Villa", "Palace", "Castle"];

  const surname = randomElement(NOBLE_LAST_NAMES, rng);
  const type = randomElement(types, rng);

  return `${surname} ${type}`;
};
/**
 * Generate a mountain range name
 * @param {Function} rng - Random number generator function (optional)
 * @returns {string} Generated mountain name
 */
export const generateMountainName = (rng = Math.random) => {
  const prefixes = [
    'Iron', 'Stone', 'Thunder', 'Storm', 'Frost', 'Fire', 'Shadow', 'Crystal',
    'Silver', 'Gold', 'Granite', 'Obsidian', 'Amber', 'Crimson', 'Azure',
    'White', 'Black', 'Grey', 'Red', 'Bone', 'Cinder', 'Ash', 'Dusk', 'Dawn',
    'Dragon', 'Eagle', 'Wolf', 'Serpent', 'Giant', 'Titan', 'Ancient', 'Broken',
    'Jagged', 'Shattered', 'Frozen', 'Burning', 'Howling', 'Silent', 'Lonely'
  ];

  const suffixes = [
    'Mountains', 'Peaks', 'Ridge', 'Range', 'Heights', 'Spires', 'Crags',
    'Pinnacles', 'Summits', 'Teeth', 'Spine', 'Crown', 'Horns', 'Cliffs'
  ];

  const prefix = prefixes[Math.floor(rng() * prefixes.length)];
  const suffix = suffixes[Math.floor(rng() * suffixes.length)];

  return `${prefix} ${suffix}`;
};

export default generateTownName;
