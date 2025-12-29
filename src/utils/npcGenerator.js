import { v4 as uuidv4 } from "uuid";
import { calculateModifier } from './rules';

/**
 * A simple Linear Congruential Generator (LCG) for deterministic randomness.
 * Should be sufficient for game logic.
 */
class SeededRNG {
    constructor(seed) {
        // If no seed provided, use a random one
        this._seed = seed || Math.floor(Math.random() * 2147483647);
        this._state = this._seed;
    }

    // Returns a float between 0 and 1
    random() {
        this._state = (this._state * 9301 + 49297) % 233280;
        return this._state / 233280;
    }

    // Returns an integer between min (inclusive) and max (inclusive)
    range(min, max) {
        return Math.floor(this.random() * (max - min + 1)) + min;
    }

    // Pick a random element from an array
    pick(array) {
        if (!array || array.length === 0) return null;
        return array[this.range(0, array.length - 1)];
    }
}

// --- Data Lists ---

const HUMAN_NAMES_MALE = [
    "Aelar", "Albert", "Alfred", "Alexander", "Cael", "Darius", "Edgar", "Edward", "Finnian", "Gareth", "Joric", "Kaelen", "Marius", "Orion", "Peregrine", "Ronan", "Tavish", "Warrick",
    "Alden", "Bram", "Cedric", "Doran", "Ewan", "Adric", "Balin", "Corin", "Davik", "Eldrin", "Faelan", "Garrik", "Hadrian", "Ivar", "Jareth",
    "Kegan", "Lorien", "Mylo", "Nevin", "Osric", "Phelan", "Quinn", "Roric", "Silas", "Thoren", "Ulric", "Valen", "Wyatt", "Yoric"
];
const HUMAN_NAMES_FEMALE = [
    "Brynn", "Elara", "Isolde", "Lyra", "Nadia", "Quilla", "Seraphina", "Vanya", "Xylia", "Yarrow", "Anya", "Fiona", "Genevieve", "Helena", "Rowan",
    "Adela", "Beatrix", "Cora", "Dahlia", "Elise", "Aria", "Bella", "Cassia", "Dora", "Elora", "Freya", "Gwen", "Hanna", "Iris", "Juna",
    "Kaia", "Lana", "Mira", "Nova", "Opal", "Piper", "Ria", "Selene", "Tessa", "Una", "Vera", "Willa", "Xena", "Yara", "Zara"
];
const HUMAN_LAST_NAMES = [
    "Ashwood", "Blackwater", "Copperleaf", "Dawnbringer", "Evenfall", "Frostbeard", "Highwind", "Ironhand", "Jadefire", "Kingsley", "Lightfoot", "Moonwhisper", "Nightshade", "Oakenshield", "Pinecroft", "Quickfoot", "Redfern", "Shadowclaw", "Stormblade", "Thornwood", "Underhill", "Valerius", "Wolfsbane", "Youngblood", "Zephyrson",
    "Smith", "Miller", "Baker", "Carter", "Fisher", "Hunter", "Mason", "Potter", "Shepherd", "Tailor", "Weaver",
    "Crowley", "Darkmoor", "Ember", "Falconer", "Grimm", "Hawk", "Ivy", "Juniper", "Knight", "Lance", "Moss", "North", "Owl", "Pike", "Quarrel", "Raven", "Steel", "Torrent", "Vance", "West", "York"
];

const ROLES = {
    "Villager": {
        possibleTitles: ["Citizen", "Peasant", "Farmer", "Laborer", "Elder"],
        defaultClass: "Commoner",
        baseStats: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 },
        inventory: ["Simple Clothes", "Bread"],
        hpRange: [4, 8]
    },
    "Guard": {
        possibleTitles: ["Sentry", "Watchman", "Constable", "Captain", "Sergeant", "Lieutenant"],
        defaultClass: "Fighter",
        baseStats: { Strength: 14, Dexterity: 12, Constitution: 13, Intelligence: 10, Wisdom: 11, Charisma: 10 },
        inventory: ["Chain Shirt", ["Spear", "Longsword", "Halberd"], "Shield", "Whistle"],
        hpRange: [12, 20]
    },
    "Merchant": {
        possibleTitles: ["Shopkeeper", "Trader", "Vendor", "Master", "Supplier"],
        defaultClass: "Expert",
        baseStats: { Strength: 10, Dexterity: 11, Constitution: 10, Intelligence: 13, Wisdom: 12, Charisma: 14 },
        inventory: ["Fine Clothes", "Ledger", "Ink & Quill"],
        hpRange: [6, 10]
    },
    "Noble": {
        possibleTitles: ["Lord", "Lady", "Baron", "Baroness", "Duke", "Duchess", "Sir", "Dame"],
        defaultClass: "Aristocrat",
        baseStats: { Strength: 9, Dexterity: 12, Constitution: 9, Intelligence: 12, Wisdom: 11, Charisma: 15 },
        inventory: ["Silk Clothes", "Signet Ring", "Jewelry"],
        hpRange: [6, 12]
    },
    "Noble Child": {
        possibleTitles: ["Young Lord", "Young Lady", "Heir", "Master", "Miss"],
        defaultClass: "Aristocrat",
        baseStats: { Strength: 6, Dexterity: 10, Constitution: 8, Intelligence: 10, Wisdom: 8, Charisma: 12 },
        inventory: ["Fine Clothes", "Toy Sword", "Doll"],
        hpRange: [4, 6]
    },
    "Criminal": {
        possibleTitles: ["Thief", "Bandit", "Cutpurse", "Thug", "Smuggler"],
        defaultClass: "Rogue",
        baseStats: { Strength: 12, Dexterity: 15, Constitution: 12, Intelligence: 10, Wisdom: 10, Charisma: 11 },
        inventory: [["Leather Armor", "Padded Armor"], ["Dagger", "Shortsword"], "Thieves' Tools", "Stolen Goods"],
        hpRange: [10, 16]
    },
    "Tavern Keeper": {
        possibleTitles: ["Innkeeper", "Barkeep", "Owner", "Host"],
        defaultClass: "Expert",
        baseStats: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 12, Wisdom: 13, Charisma: 14 },
        inventory: ["Apron", "Keys to the Cellar", "Tankard", "Towel"],
        hpRange: [6, 12]
    },
    "Tavern Worker": {
        possibleTitles: ["Server", "Cook", "Stablehand", "Maid", "Potboy"],
        defaultClass: "Commoner",
        baseStats: { Strength: 11, Dexterity: 12, Constitution: 11, Intelligence: 9, Wisdom: 10, Charisma: 10 },
        inventory: ["Simple Clothes", "Dirty Apron", ["Broom", "Tray", "Bucket"]],
        hpRange: [4, 8]
    },
    // Guild Functions
    "Guild Master": {
        possibleTitles: ["Grandmaster", "High Artisan", "Guildmaster", "Director", "Foreman"],
        defaultClass: "Expert",
        baseStats: { Strength: 12, Dexterity: 12, Constitution: 12, Intelligence: 14, Wisdom: 14, Charisma: 14 },
        inventory: ["Guild Badge", "Masterwork Tool", "Fine Clothes", "Ledger"],
        hpRange: [10, 20]
    },
    "Guild Member": {
        possibleTitles: ["Journeyman", "Apprentice", "Member", "Initiate", "Adept"],
        defaultClass: "Expert",
        baseStats: { Strength: 11, Dexterity: 12, Constitution: 11, Intelligence: 12, Wisdom: 10, Charisma: 10 },
        inventory: ["Guild Badge", "Tools", "Apron"],
        hpRange: [6, 12]
    },
    // Religious Functions
    "Priest": {
        possibleTitles: ["Father", "Mother", "High Priest", "Curate", "Bishop", "Elder"],
        defaultClass: "Cleric",
        baseStats: { Strength: 10, Dexterity: 10, Constitution: 12, Intelligence: 12, Wisdom: 16, Charisma: 14 },
        inventory: ["Holy Symbol", "Vestments", "Prayer Book", "Incense"],
        hpRange: [12, 24]
    },
    "Acolyte": {
        possibleTitles: ["Brother", "Sister", "Novice", "Initiate", "Deacon"],
        defaultClass: "Adept",
        baseStats: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 11, Wisdom: 13, Charisma: 12 },
        inventory: ["Holy Symbol", "Simple Robes", "Candle"],
        hpRange: [6, 12]
    }
};

const ALIGNMENTS = [
    "Lawful Good", "Neutral Good", "Chaotic Good",
    "Lawful Neutral", "True Neutral", "Chaotic Neutral",
    "Lawful Evil", "Neutral Evil", "Chaotic Evil"
];

const TRINKETS = [
    "Brass Key", "Carved Wooden Duck", "Silver Locket", "Strange Coin", "Dice Set",
    "Dried Rabbit's Foot", "Letter from home", "Map fragment", "Shiny rock", "Bone whistle",
    "Copper Ring", "Old pipe", "Deck of cards", "Small mirror", "Bag of marbles"
];

// --- Generator Functions ---

/**
 * Generates a full NPC object deterministically based on input options and/or a seed.
 * 
 * @param {Object} options Configuration options
 * @param {string} [options.seed] Seed for deterministic generation. If null, random seed used.
 * @param {string} [options.race="Human"] Race of the NPC.
 * @param {string} [options.gender] "Male", "Female", or null (random).
 * @param {string} [options.role] Specific role key (e.g. "Guard"). If null, random role.
 * @param {number} [options.level=1] Level of the NPC.
 */
export const generateNPC = (options = {}) => {
    // 1. Initialize RNG
    // Use provided seed or generate a random integer seed
    const seed = options.seed || Math.floor(Math.random() * 1000000);
    const rng = new SeededRNG(seed);

    // 2. Determine basic properties
    const race = options.race || "Human"; // Default to Human for now
    const gender = options.gender || (rng.random() > 0.5 ? "Male" : "Female");

    // 3. Determine Role
    const roleKeys = Object.keys(ROLES);
    const roleKey = options.role && ROLES[options.role] ? options.role : rng.pick(roleKeys);
    const roleData = ROLES[roleKey];

    // 4. Determine Title
    const title = options.title || rng.pick(roleData.possibleTitles);

    // 5. Determine Age
    let age;
    if (roleKey === "Noble Child") {
        age = rng.range(6, 15);
    } else if (title.includes("Elder")) {
        age = rng.range(60, 90);
    } else {
        // Weighted random for adults: mostly 20-50, some older
        const roll = rng.random();
        if (roll < 0.6) {
            age = rng.range(18, 35); // Young adult
        } else if (roll < 0.9) {
            age = rng.range(36, 55); // Middle aged
        } else {
            age = rng.range(56, 75); // Older
        }
    }

    // 6. Generate Name
    let firstName;
    if (gender === "Male") {
        firstName = rng.pick(HUMAN_NAMES_MALE);
    } else {
        firstName = rng.pick(HUMAN_NAMES_FEMALE);
    }
    const lastName = options.lastName || rng.pick(HUMAN_LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;

    // 6. Generate Stats (Base + Variance)
    const stats = { ...roleData.baseStats };
    // Add some simple variance (-1 to +2) to each stat to make them unique
    Object.keys(stats).forEach(stat => {
        const variance = rng.range(-1, 2);
        stats[stat] = Math.max(1, stats[stat] + variance); // Ensure stat doesn't drop below 1
    });

    // 7. Calculate Derived Stats
    const level = options.level || 1;
    const conMod = calculateModifier(stats.Constitution);
    const baseHp = rng.range(roleData.hpRange[0], roleData.hpRange[1]);
    const maxHP = Math.max(1, baseHp + (conMod * level)); // HP formula approximation

    // 8. Other properties
    let availableAlignments = ALIGNMENTS;
    if (options.noEvil) {
        availableAlignments = ALIGNMENTS.filter(a => !a.includes("Evil"));
    }
    const alignment = rng.pick(availableAlignments);
    const npcClass = roleData.defaultClass;

    // 9. Inventory
    // Start with role-based items
    let inventory = [...roleData.inventory].map(item => {
        // Resolve choices: if item is an array, pick one
        if (Array.isArray(item)) {
            return rng.pick(item);
        }
        return item;
    });

    // Add Wealth based on Role/Class (Simple approximation)
    let coins = 0;
    if (roleKey === "Noble Child") {
        coins = rng.range(2, 10) + " Silver Pieces (Allowance)";
    } else if (roleKey === "Noble" || roleKey === "Merchant") {
        coins = rng.range(20, 100) + " Gold Places";
    } else if (roleKey === "Guard" || roleKey === "Tavern Keeper") {
        coins = rng.range(5, 20) + " Silver Pieces";
    } else {
        coins = rng.range(2, 15) + " Copper Pieces";
    }
    inventory.push(coins);

    // Add Trinket (30% chance)
    if (rng.random() < 0.3) {
        inventory.push(rng.pick(TRINKETS));
    }

    return {
        id: uuidv4(),
        seed: seed, // Store seed for reproduction
        name: fullName,
        age: age,
        gender: gender,
        race: race,
        role: roleKey,
        title: title,
        class: npcClass,
        level: level,
        alignment: alignment,
        stats: stats,
        hp: {
            current: maxHP,
            max: maxHP
        },
        inventory: inventory,
        isNPC: true
    };
};

// --- Town Population Logic ---

/**
 * scanning the town map data and generating NPCs for employment buildings.
 * @param {Object} townMapData Output from generateTownMap
 * @param {string|number} seed Seed for deterministic generation
 * @returns {Array} List of generated NPCs with location data
 */
export const populateTown = (townMapData, seed) => {
    // 1. Initialize RNG with town seed to stay consistent
    const rng = new SeededRNG(seed);
    const npcs = [];

    // Helper to add NPC
    const addNPC = (role, buildingName, x, y, options = {}) => {
        // Create unique seed for this specific NPC
        // Combine town seed + coordinates + role + random variance
        const npcSeed = parseInt(seed) + (x * 1000) + (y * 100) + rng.range(0, 9999);

        // Default to no evil alignments for town NPCs unless overridden
        const npcOptions = {
            seed: npcSeed,
            role: role,
            noEvil: true,
            ...options
        };

        const npc = generateNPC(npcOptions);

        // Add location data
        npc.location = {
            x,
            y,
            buildingName: buildingName || "Unknown Building",
            buildingType: townMapData.mapData[y][x].buildingType
        };

        // Add job description based on role
        if (role === "Tavern Keeper") npc.job = `Owner of ${buildingName}`;
        else if (role === "Tavern Worker") npc.job = `Staff at ${buildingName}`;
        else if (role === "Merchant") npc.job = `Proprietor of ${buildingName}`;
        else if (role === "Guard") npc.job = `Guard at ${buildingName}`;
        else if (role === "Noble") npc.job = `${npc.title} of ${buildingName}`; // Use specific title (Lord, Lady, Baroness, etc.)

        npcs.push(npc);
    };

    const { mapData, width, height } = townMapData;

    // Scan map for buildings
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = mapData[y][x];

            if (tile.type === 'building') {
                // Ensure we only process each building once (using its top-left coordinate or unique name check)
                // Since our current generator places single tiles or marks them, we need to be careful.
                // However, the current map info stores name/type on the specific placed tile.
                // Assuming 1 tile = 1 building distinct entry for our logic's sake for now.
                // (Refinement: If buildings are multi-tile, we'd need a way to dedupe. 
                // Currently placeBuildings puts a type/name on specific tiles.)

                const bType = tile.buildingType;
                const bName = tile.buildingName || `${bType} at ${x},${y}`;

                if (bType === 'tavern' || bType === 'inn') {
                    // Tavern Couple Logic
                    const keeperLastName = rng.pick(HUMAN_LAST_NAMES);
                    const keeperGender = rng.random() > 0.5 ? "Male" : "Female";
                    const spouseGender = keeperGender === "Male" ? "Female" : "Male";

                    // 1 Primary Keeper
                    addNPC("Tavern Keeper", bName, x, y, {
                        gender: keeperGender,
                        lastName: keeperLastName,
                        title: "Owner"
                    });

                    // 1 Spouse (Co-Owner)
                    addNPC("Tavern Keeper", bName, x, y, {
                        gender: spouseGender,
                        lastName: keeperLastName,
                        title: "Co-Owner"
                    });

                    // 1-2 Workers
                    const workerCount = rng.range(1, 2);
                    for (let i = 0; i < workerCount; i++) {
                        addNPC("Tavern Worker", bName, x, y);
                    }
                }
                else if (bType === 'shop' || bType === 'market') {
                    // 1 Merchant
                    addNPC("Merchant", bName, x, y);
                }
                else if (bType === 'bank') {
                    // 1 Merchant (Banker)
                    addNPC("Merchant", bName, x, y, { title: "Banker" }); // Override title maybe?
                    // 2 Guards
                    addNPC("Guard", bName, x, y, { gender: "Male" });
                    addNPC("Guard", bName, x, y, { gender: "Male" });
                }
                else if (bType === 'keep' || bType === 'manor') {
                    // Noble Family
                    // Attempt to parse family name from building name (e.g. "Ashwood Manor" -> "Ashwood")
                    let familyName = null;
                    // Check for various manor-like suffixes
                    if (bName) {
                        const suffixes = ['Manor', 'Hall', 'House', 'Keep', 'Estate', 'Lodge', 'Castle', 'Palace'];
                        for (const suffix of suffixes) {
                            if (bName.includes(suffix)) {
                                familyName = bName.split(' ' + suffix)[0]; // robustly get everything before the suffix
                                break;
                            }
                        }
                        // Fallback: just take first word if we missed the suffix
                        if (!familyName) familyName = bName.split(' ')[0];
                    }

                    // Noble Family Logic

                    // 1. Determine Head of Household Gender & Title
                    const headGender = rng.random() > 0.5 ? "Male" : "Female";
                    let headTitle, spouseTitle;

                    // Pick a title pair
                    const pairs = [
                        { m: "Lord", f: "Lady" },
                        { m: "Baron", f: "Baroness" },
                        { m: "Duke", f: "Duchess" },
                        { m: "Count", f: "Countess" }
                    ];
                    const pair = rng.pick(pairs);

                    if (headGender === "Male") {
                        headTitle = pair.m;
                        spouseTitle = pair.f;
                    } else {
                        headTitle = pair.f;
                        spouseTitle = pair.m;
                    }

                    // 1 Head of Household
                    addNPC("Noble", bName, x, y, {
                        gender: headGender,
                        title: headTitle,
                        lastName: familyName
                    });

                    // Spouse
                    const spouseGender = headGender === "Male" ? "Female" : "Male";
                    addNPC("Noble", bName, x, y, {
                        gender: spouseGender,
                        title: spouseTitle,
                        lastName: familyName
                    });

                    // 1-3 Children
                    const childCount = rng.range(1, 3);
                    for (let i = 0; i < childCount; i++) {
                        addNPC("Noble Child", bName, x, y, { lastName: familyName });
                    }

                    const guardCount = rng.range(2, 4);
                    for (let i = 0; i < guardCount; i++) {
                        addNPC("Guard", bName, x, y, { gender: "Male" });
                    }
                }
                else if (bType === 'guild') {
                    // Guild Master
                    addNPC("Guild Master", bName, x, y);

                    // 2-4 Members
                    const memberCount = rng.range(2, 4);
                    for (let i = 0; i < memberCount; i++) {
                        addNPC("Guild Member", bName, x, y);
                    }
                }
                else if (bType === 'temple') {
                    // Head Priest
                    addNPC("Priest", bName, x, y);

                    // 2-5 Acolytes
                    const acolyteCount = rng.range(2, 5);
                    for (let i = 0; i < acolyteCount; i++) {
                        addNPC("Acolyte", bName, x, y);
                    }
                }
            }
        }
    }

    return npcs;
};

export default generateNPC;
