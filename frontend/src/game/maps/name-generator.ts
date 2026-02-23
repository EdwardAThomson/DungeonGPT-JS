/**
 * Name generators for towns, taverns, guilds, temples, shops, banks, manors, and mountains.
 * Includes name data (ported from nameData.js + townNameGenerator.js).
 * Ported from src/utils/townNameGenerator.js + src/utils/nameData.js — zero behavioral changes.
 */

// ── Name data (from nameData.js) ────────────────────────────────────────────

export const HUMAN_NAMES_MALE: readonly string[] = [
  "Aelar", "Albert", "Alfred", "Alexander", "Cael", "Darius", "Edgar",
  "Edward", "Finnian", "Gareth", "Joric", "Kaelen", "Marius", "Orion",
  "Peregrine", "Ronan", "Tavish", "Warrick", "Alden", "Bram", "Cedric",
  "Doran", "Adric", "Balin", "Corin", "Davik", "Eldrin", "Faelan",
  "Garrik", "Hadrian", "Ivar", "Kegan", "Lorien", "Mylo", "Osric",
  "Phelan", "Quinn", "Roric", "Silas", "Thoren", "Ulric", "Valen",
  "Wyatt", "Yoric",
];

export const HUMAN_NAMES_FEMALE: readonly string[] = [
  "Brynn", "Elara", "Isolde", "Lyra", "Nadia", "Quilla", "Seraphina",
  "Vanya", "Xylia", "Yarrow", "Anya", "Fiona", "Genevieve", "Helena",
  "Rowan", "Adela", "Beatrix", "Cora", "Dahlia", "Elise", "Aria",
  "Bella", "Cassia", "Dora", "Elora", "Freya", "Gwen", "Hanna", "Iris",
  "Juna", "Kaia", "Lana", "Mira", "Nova", "Opal", "Piper", "Ria",
  "Selene", "Tessa", "Una", "Vera", "Willa", "Xena", "Yara", "Zara",
];

export const NOBLE_LAST_NAMES: readonly string[] = [
  "Ashwood", "Blackwater", "Copperleaf", "Dawnbringer", "Evenfall",
  "Frostbeard", "Highwind", "Ironhand", "Jadefire", "Kingsley",
  "Lightfoot", "Moonwhisper", "Nightshade", "Oakenshield", "Pinecroft",
  "Quickfoot", "Redfern", "Shadowclaw", "Stormblade", "Thornwood",
  "Underhill", "Valerius", "Wolfsbane", "Stormwind", "Fireheart",
  "Winterbourne", "Summerfield", "Rosewood", "Hawthorne", "Ravenscroft",
  "Dragonbane", "Lionshield", "Bearclaw", "Eagleeye", "Foxglove",
];

export const COMMON_LAST_NAMES: readonly string[] = [
  "Smith", "Miller", "Baker", "Carter", "Fisher", "Hunter", "Mason",
  "Potter", "Shepherd", "Tailor", "Weaver", "Crowley", "Darkmoor",
  "Ember", "Falconer", "Grimm", "Hawk", "Ivy", "Juniper", "Knight",
  "Lance", "Moss", "North", "Owl", "Pike", "Quarrel", "Raven", "Steel",
  "Torrent", "Vance", "West", "York", "Youngblood", "Zephyrson",
];

export const HUMAN_LAST_NAMES: readonly string[] = [
  ...NOBLE_LAST_NAMES,
  ...COMMON_LAST_NAMES,
];

// ── RNG type ────────────────────────────────────────────────────────────────

/** Random number generator function type. */
export type RngFunction = () => number;

// ── Name components ─────────────────────────────────────────────────────────

const nameComponents = {
  prefixes: [
    "Mill", "Stone", "River", "Oak", "Iron", "Gold", "Silver", "Green",
    "White", "Black", "Red", "Blue", "High", "Low", "North", "South",
    "East", "West", "Old", "New", "Fair", "Bright", "Dark", "Swift",
    "Deep", "Shallow", "Long", "Short", "Broad", "Narrow", "Wide",
    "Winter", "Summer", "Spring", "Autumn", "Frost", "Sun", "Moon", "Star",
    "Cloud", "Mist", "Fog", "Rain", "Storm", "Thunder", "Wind", "Snow",
    "Crystal", "Diamond", "Ruby", "Emerald", "Sapphire", "Amber", "Jade",
  ],
  historicalSuffixes: {
    hamlet: ["stead", "wick", "croft", "well", "hill", "side", "edge"],
    village: ["ton", "ham", "ley", "worth", "field", "wood", "burn"],
    town: ["market", "ford", "bridge", "haven", "shire", "mouth", "crossing"],
    city: ["burg", "bury", "caster", "chester", "cester", "keep", "hold", "bastion"],
  } as Record<string, readonly string[]>,
  cityNames: [
    "Stronghold", "Fortress", "Citadel", "Bastion", "Rampart", "Bulwark",
    "Keep", "Castle", "Tower", "Spire", "Crown", "Throne", "Palace",
    "Capital", "Metropolis", "Sanctuary", "Dominion", "Empire",
  ],
};

/** Regional name variations based on biome. */
const regionalNames: Record<
  string,
  { readonly prefixes: readonly string[]; readonly suffixes: readonly string[] }
> = {
  plains: {
    prefixes: ["Green", "Fair", "Golden", "Wheat", "Barley", "Corn", "Hay", "Meadow"],
    suffixes: ["field", "meadow", "vale", "haven", "rest", "shire", "ton", "dale"],
  },
  forest: {
    prefixes: ["Oak", "Pine", "Elder", "Willow", "Ash", "Birch", "Cedar", "Maple"],
    suffixes: ["wood", "grove", "glen", "hollow", "shade", "leaf", "branch", "root"],
  },
  mountain: {
    prefixes: ["Stone", "Iron", "High", "Peak", "Snow", "Granite", "Cliff", "Summit"],
    suffixes: ["hold", "keep", "watch", "guard", "peak", "crest", "ridge", "point"],
  },
  water: {
    prefixes: ["River", "Lake", "Bay", "Harbor", "Tide", "Wave", "Stream", "Current"],
    suffixes: ["port", "haven", "bridge", "ford", "mouth", "bay", "cove", "landing"],
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get a random element from an array using provided RNG.
 */
const randomElement = <T>(array: readonly T[], rng: RngFunction = Math.random): T => {
  return array[Math.floor(rng() * array.length)] as T;
};

// ── Town name generator ─────────────────────────────────────────────────────

/**
 * Generate a town name based on size and biome.
 * @param size - Town size: 'hamlet', 'village', 'town', or 'city'
 * @param biome - Biome type: 'plains', 'forest', 'mountain', 'water'
 * @param rng - Random number generator function (optional)
 * @returns Generated town name
 */
export const generateTownName = (
  size = "village",
  biome = "plains",
  rng: RngFunction = Math.random,
): string => {
  // Cities have a 30% chance of getting a grand name
  if (size === "city" && rng() < 0.3) {
    const prefix = randomElement(nameComponents.prefixes, rng);
    const suffix = randomElement(nameComponents.cityNames, rng);
    return `${prefix} ${suffix}`;
  }

  // 20% chance for town/city to be named after a noble family
  if ((size === "town" || size === "city") && rng() < 0.2) {
    const noblePrefix = randomElement(NOBLE_LAST_NAMES, rng);
    const townSuffixes = ["ton", "burg", "shire", "hold", "wick", "stead"];
    const suffix = randomElement(townSuffixes, rng);
    return `${noblePrefix}${suffix}`;
  }

  // Use regional names if biome is recognized, otherwise use generic names
  const regional = regionalNames[biome];
  const prefixList: readonly string[] = regional && rng() < 0.7
    ? regional.prefixes
    : nameComponents.prefixes;

  const prefix = randomElement(prefixList, rng);

  // Historical suffix logic
  const villageFallback: readonly string[] = nameComponents.historicalSuffixes["village"] ?? ["ton", "ham", "ley"];
  const historicalList: readonly string[] =
    nameComponents.historicalSuffixes[size] ?? villageFallback;

  const suffix = randomElement(historicalList, rng);

  return `${prefix}${suffix}`;
};

/**
 * Generate multiple unique town names.
 * @param count - Number of names to generate
 * @param biome - Biome type
 * @param sizes - Array of town sizes
 * @param rng - Random number generator function (optional)
 * @returns Array of unique town names
 */
export const generateUniqueTownNames = (
  count: number,
  biome = "plains",
  sizes: readonly string[] = [],
  rng: RngFunction = Math.random,
): string[] => {
  const names = new Set<string>();
  const maxAttempts = count * 10; // Prevent infinite loops
  let attempts = 0;

  while (names.size < count && attempts < maxAttempts) {
    const size = sizes[names.size] ?? "village";
    const name = generateTownName(size, biome, rng);
    names.add(name);
    attempts++;
  }

  return [...names];
};

/**
 * Test function to generate sample names.
 */
export const testNameGenerator = (): void => {
  console.log("=== TOWN NAME GENERATOR TEST ===");

  const biomes = ["plains", "forest", "mountain", "water"];
  const sizes = ["hamlet", "village", "town", "city"];

  for (const biome of biomes) {
    console.log(`\n${biome.toUpperCase()} Towns:`);
    for (const size of sizes) {
      const name = generateTownName(size, biome);
      console.log(`  ${size.padEnd(10)} - ${name}`);
    }
  }

  console.log("\n=== TEST COMPLETE ===");
};

// ── Tavern name generator ───────────────────────────────────────────────────

/**
 * Generate a tavern name.
 */
export const generateTavernName = (rng: RngFunction = Math.random): string => {
  const adjectives = [
    "Prancing", "Golden", "Silver", "Drunken", "Rusty", "Broken", "Dancing",
    "Sleeping", "Laughing", "Singing", "Roaring", "Jolly", "Merry", "Red",
    "Green", "Blue", "Black", "White", "Iron", "Stone", "Wooden",
    "Crimson", "Azure", "Violet", "Amber", "Emerald", "Sapphire", "Ruby",
    "Lost", "Wandering", "Hidden", "Secret", "Silent", "Whispering", "Howling",
    "Flying", "Running", "Jumping", "Fighting", "Smiling", "Crying", "Blind",
  ];

  const nouns = [
    "Pony", "Dragon", "Lion", "Bear", "Boar", "Stag", "Eagle", "Crow",
    "Tankard", "Barrel", "Flagon", "Mug", "Keg", "Bottle", "Goblet",
    "Sword", "Shield", "Hammer", "Axe", "Anchor", "Wheel", "Crown",
    "Goat", "Sheep", "Wolf", "Fox", "Cat", "Dog", "Horse", "Mare",
    "Wizard", "Knight", "King", "Queen", "Prince", "Princess", "Jester",
    "Ghost", "Spirit", "Soul", "Shadow", "Flame", "Fire", "Ice", "Frost",
  ];

  const adj = randomElement(adjectives, rng);
  const noun = randomElement(nouns, rng);

  return `The ${adj} ${noun}`;
};

// ── Guild name generator ────────────────────────────────────────────────────

/**
 * Generate a guild name with weighted probabilities.
 */
export const generateGuildName = (rng: RngFunction = Math.random): string => {
  // Weighted categories
  const categories = [
    { weight: 60, types: ["Merchants", "Smiths", "Masons", "Bakers", "Brewers", "Weavers", "Carpenters", "Farmers", "Cobblers", "Tailors"] },
    { weight: 25, types: ["Warriors", "Healers", "Alchemists", "Scribes", "Scholars", "Inventors", "Explorers", "Rangers"] },
    { weight: 10, types: ["Thieves", "Assassins", "Spies", "Smugglers", "Bards", "Illusionists"] },
    { weight: 5, types: ["Mages", "Wizards", "Sorcerers", "Necromancers", "Druids"] },
  ];

  // Pick category based on weight
  let totalWeight = 0;
  for (const cat of categories) {
    totalWeight += cat.weight;
  }
  let randomVal = rng() * totalWeight;
  let selectedTypes: readonly string[] = categories[0]?.types ?? ["Merchants"];

  for (const cat of categories) {
    if (randomVal < cat.weight) {
      selectedTypes = cat.types;
      break;
    }
    randomVal -= cat.weight;
  }

  const type = randomElement(selectedTypes, rng);

  const descriptors = [
    "Honorable", "Ancient", "Noble", "Royal", "Imperial", "Grand",
    "United", "Free", "Independent", "Loyal", "True", "Faithful",
    "Mystic", "Secret", "Hidden", "Golden", "Silver", "Iron",
  ];

  // 40% chance to add descriptor
  if (rng() < 0.4) {
    const desc = randomElement(descriptors, rng);
    return `${desc} Order of ${type}`;
  } else if (rng() < 0.8) {
    return `${type} Guild`;
  } else {
    return `The Order of ${type}`;
  }
};

// ── Temple name generator ───────────────────────────────────────────────────

/**
 * Generate a temple name.
 */
export const generateTempleName = (rng: RngFunction = Math.random): string => {
  const domains = [
    "Light", "Life", "Nature", "War", "Peace", "Death", "Storms", "Seas",
    "Knowledge", "Trickery", "Love", "Justice", "Time", "Fate",
  ];

  const titles = [
    "Temple", "Shrine", "Sanctuary", "Cathedral", "Chapel", "Altar", "Hall",
  ];

  const domain = randomElement(domains, rng);
  const title = randomElement(titles, rng);

  // 50/50 format split
  if (rng() < 0.5) {
    return `${title} of ${domain}`;
  } else {
    const adjectives = [
      "Holy", "Sacred", "Divine", "Eternal", "Blessed", "Hallowed", "Silent", "Golden",
    ];
    const adj = randomElement(adjectives, rng);
    return `The ${adj} ${title}`;
  }
};

// ── Bank name generator ─────────────────────────────────────────────────────

/**
 * Generate a bank name.
 */
export const generateBankName = (rng: RngFunction = Math.random): string => {
  const founders = [
    "Goldsworth", "Silverton", "Ironvault", "Stonekeeper", "Coinmaster",
    "Wealthguard", "Treasurekeep", "Safehaven", "Vaultwright", "Gemhold",
    "Richman", "Moneychanger", "Goldkeeper", "Silversmith",
    "Profitmaker", "Loadstone", "Bullion", "Cache", "Hoard", "Stash",
  ];

  const types = [
    "Bank", "Trust", "Vault", "Treasury", "Reserve", "Exchange",
    "Counting House", "Money Lenders", "Financial House",
    "Coffers", "Depository", "Fund", "Investment", "Capital",
  ];

  const founder = randomElement(founders, rng);
  const type = randomElement(types, rng);

  // 70% chance for "Founder & Type" format, 30% for just "Founder Type"
  if (rng() < 0.7) {
    return `${founder} & Co. ${type}`;
  }

  return `${founder} ${type}`;
};

// ── Shop name generator ─────────────────────────────────────────────────────

/**
 * Generate a shop name.
 */
export const generateShopName = (rng: RngFunction = Math.random): string => {
  const format = rng() < 0.6 ? "adjective_noun" : "person_goods";

  if (format === "adjective_noun") {
    const adjectives = [
      "Lucky", "Golden", "Silver", "Honest", "Fair", "Quality", "Best",
      "Quick", "Strong", "Sturdy", "Fine", "Cheap", "Useful", "Magic",
      "Mystic", "Ancient", "Old", "New", "Bright", "Dark", "Shining",
      "Rusty", "Dusty", "Clean", "Dirty", "Broken", "Fixed",
    ];
    const nouns = [
      "Horseshoe", "Hammer", "Shield", "Sword", "Cloak", "Potion", "Scroll",
      "Backpack", "Boot", "Glove", "Gem", "Anvil", "Arrow", "Bow",
      "Lantern", "Compass", "Map", "Book", "Feather", "Quill", "Ink",
    ];
    const adj = randomElement(adjectives, rng);
    const noun = randomElement(nouns, rng);
    return `The ${adj} ${noun}`;
  } else {
    const names: readonly string[] = [...HUMAN_NAMES_MALE, ...HUMAN_NAMES_FEMALE];
    const goods = [
      "Goods", "Supplies", "Wares", "Trade", "Emporium", "Exchange",
      "General Store", "Market", "Provisions", "Equipment",
      "Trinkets", "Treasures", "Oddities", "Curiosities", "Sundries",
    ];
    const name = randomElement(names, rng);
    const good = randomElement(goods, rng);
    return `${name}'s ${good}`;
  }
};

// ── Manor name generator ────────────────────────────────────────────────────

/**
 * Generate a manor or estate name.
 */
export const generateManorName = (rng: RngFunction = Math.random): string => {
  const types = [
    "Manor", "Hall", "Estate", "House", "Keep", "Lodge", "Chateau",
    "Villa", "Palace", "Castle",
  ];

  const surname = randomElement(NOBLE_LAST_NAMES, rng);
  const type = randomElement(types, rng);

  return `${surname} ${type}`;
};

// ── Mountain name generator ─────────────────────────────────────────────────

/**
 * Generate a mountain range name.
 */
export const generateMountainName = (rng: RngFunction = Math.random): string => {
  const prefixes = [
    "Iron", "Stone", "Thunder", "Storm", "Frost", "Fire", "Shadow", "Crystal",
    "Silver", "Gold", "Granite", "Obsidian", "Amber", "Crimson", "Azure",
    "White", "Black", "Grey", "Red", "Bone", "Cinder", "Ash", "Dusk", "Dawn",
    "Dragon", "Eagle", "Wolf", "Serpent", "Giant", "Titan", "Ancient", "Broken",
    "Jagged", "Shattered", "Frozen", "Burning", "Howling", "Silent", "Lonely",
  ];

  const suffixes = [
    "Mountains", "Peaks", "Ridge", "Range", "Heights", "Spires", "Crags",
    "Pinnacles", "Summits", "Teeth", "Spine", "Crown", "Horns", "Cliffs",
  ];

  const prefix = randomElement(prefixes, rng);
  const suffix = randomElement(suffixes, rng);

  return `${prefix} ${suffix}`;
};
