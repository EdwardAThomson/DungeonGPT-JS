import { v4 as uuidv4 } from "uuid";
import { calculateModifier } from './rules';
import { HUMAN_NAMES_MALE, HUMAN_NAMES_FEMALE, HUMAN_LAST_NAMES, NOBLE_LAST_NAMES } from './nameData';

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
// Removed local constants (now imported from nameData.js)

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
        possibleTitles: {
            Male: ["Lord", "Baron", "Duke", "Earl", "Count", "Viscount", "Sir"],
            Female: ["Lady", "Baroness", "Duchess", "Countess", "Countess", "Viscountess", "Dame"]
        },
        defaultClass: "Aristocrat",
        baseStats: { Strength: 9, Dexterity: 12, Constitution: 9, Intelligence: 12, Wisdom: 11, Charisma: 15 },
        inventory: ["Silk Clothes", "Signet Ring", "Jewelry"],
        hpRange: [6, 12]
    },
    "Noble Child": {
        possibleTitles: {
            Male: ["Young Lord", "Master"],
            Female: ["Young Lady", "Miss"]
        },
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
        possibleTitles: {
            Male: ["Innkeeper", "Barkeep", "Owner", "Host"],
            Female: ["Innkeeper", "Barkeep", "Owner", "Hostess"]
        },
        defaultClass: "Expert",
        baseStats: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 12, Wisdom: 13, Charisma: 14 },
        inventory: ["Apron", "Keys to the Cellar", "Tankard", "Towel"],
        hpRange: [6, 12]
    },
    "Tavern Worker": {
        possibleTitles: {
            Male: ["Server", "Cook", "Stablehand", "Potboy"],
            Female: ["Server", "Cook", "Maid", "Hostess"]
        },
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
        possibleTitles: {
            Male: ["Father", "High Priest", "Curate", "Bishop", "Elder"],
            Female: ["Mother", "High Priestess", "Bishop", "Elder"]
        },
        defaultClass: "Cleric",
        baseStats: { Strength: 10, Dexterity: 10, Constitution: 12, Intelligence: 12, Wisdom: 16, Charisma: 14 },
        inventory: ["Holy Symbol", "Vestments", "Prayer Book", "Incense"],
        hpRange: [12, 24]
    },
    "Acolyte": {
        possibleTitles: {
            Male: ["Brother", "Novice", "Initiate", "Deacon"],
            Female: ["Sister", "Novice", "Initiate", "Deacon"]
        },
        defaultClass: "Adept",
        baseStats: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 11, Wisdom: 13, Charisma: 12 },
        inventory: ["Holy Symbol", "Simple Robes", "Candle"],
        hpRange: [6, 12]
    },
    // Specialized Trades
    "Blacksmith": {
        possibleTitles: {
            Male: ["Smith", "Blacksmith", "Armorer", "Ironwright", "Master Smith"],
            Female: ["Smith", "Blacksmith", "Armorer", "Ironwright", "Master Smith"]
        },
        defaultClass: "Expert",
        baseStats: { Strength: 15, Dexterity: 10, Constitution: 14, Intelligence: 10, Wisdom: 11, Charisma: 10 },
        inventory: ["Leather Apron", "Hammer", "Tongs", "Iron Scraps"],
        hpRange: [10, 18]
    },
    "Farmer": {
        possibleTitles: ["Farmer", "Crofter", "Husbandman", "Harvester", "Plowman"],
        defaultClass: "Commoner",
        baseStats: { Strength: 13, Dexterity: 11, Constitution: 12, Intelligence: 10, Wisdom: 11, Charisma: 10 },
        inventory: ["Rough Clothes", ["Pitchfork", "Scythe", "Sickle"], "Straw Hat"],
        hpRange: [6, 10]
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
    let title;
    let selectedTitleIndex = -1;
    if (options.title) {
        title = options.title;
    } else {
        const titles = roleData.possibleTitles;
        if (Array.isArray(titles)) {
            selectedTitleIndex = options.titleIndex !== undefined ? options.titleIndex : rng.range(0, titles.length - 1);
            title = titles[selectedTitleIndex];
        } else if (typeof titles === 'object') {
            const list = titles[gender] || titles.Male || [];
            selectedTitleIndex = options.titleIndex !== undefined ? options.titleIndex : rng.range(0, list.length - 1);
            title = list[selectedTitleIndex] || "Citizen";
        }
    }

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
        selectedTitleIndex: selectedTitleIndex, // Return the index for spouse matching
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
    const rng = new SeededRNG(seed);
    const npcs = [];
    const { mapData, width, height, townSize, townName } = townMapData;

    // 1. ANALYZE MAP FOR BUILDINGS & SITES
    const residentialSites = [];
    const serviceBuildings = [];
    const workSites = []; // Fields, Barns
    let vocationSlots = null;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const tile = mapData[y][x];
            if (tile.type === 'building') {
                if (tile.buildingType === 'house' || tile.buildingType === 'manor' || tile.buildingType === 'keep') {
                    residentialSites.push({ x, y, type: tile.buildingType, name: tile.buildingName });
                } else {
                    serviceBuildings.push({ x, y, type: tile.buildingType, name: tile.buildingName });
                }
            } else if (tile.type === 'farm_field' || (tile.type === 'building' && tile.buildingType === 'barn')) {
                workSites.push({ x, y, type: tile.type === 'farm_field' ? 'field' : 'barn' });
            }
        }
    }

    // Helper to add NPC with linkage
    const addNPC = (role, workplace, home, options = {}) => {
        const npcSeed = parseInt(seed) + (workplace.x * 1000) + (workplace.y * 100) + rng.range(0, 9999);
        const npc = generateNPC({ seed: npcSeed, role, noEvil: true, ...options });

        npc.location = {
            x: workplace.x,
            y: workplace.y,
            buildingName: workplace.name || workplace.type || "Outdoors",
            buildingType: workplace.type,
            homeCoords: home ? { x: home.x, y: home.y } : null
        };
        npcs.push(npc);
        return npc;
    };

    // 2. TOWN LEADER LOGIC
    let leaderSet = false;
    let mainResidence = residentialSites.find(r => r.type === 'keep' || r.type === 'manor');

    if (mainResidence) {
        // High Noble Leader and Family
        let familyName;
        if (mainResidence.name && mainResidence.name !== "Manor" && mainResidence.name !== "Keep") {
            familyName = mainResidence.name.split(' ')[0];
        } else if (rng.random() < 0.4) {
            // 40% chance the noble house takes the name of the town (e.g. House Everfell)
            // Strip common suffixes if present
            familyName = townName.replace(/(ton|burg|shire|hold|wick|stead)$/, '');
        } else {
            familyName = rng.pick(NOBLE_LAST_NAMES);
        }

        // 1. Head of House
        const head = addNPC("Noble", mainResidence, mainResidence, { lastName: familyName });
        head.job = `${head.title} of ${townName}`;

        // 2. Spouse
        const spouseGender = head.gender === "Male" ? "Female" : "Male";
        const spouse = addNPC("Noble", mainResidence, mainResidence, {
            lastName: familyName,
            gender: spouseGender,
            titleIndex: head.selectedTitleIndex // Match title index for spouse correlation
        });
        spouse.job = `${spouse.title} of ${townName}`;

        // 3. Children (1-3)
        const childCount = rng.range(1, 3);
        for (let i = 0; i < childCount; i++) {
            const child = addNPC("Noble Child", mainResidence, mainResidence, { lastName: familyName });
            child.job = `${child.title} of the House ${familyName}`;
        }

        leaderSet = true;
    } else if (residentialSites.length > 0) {
        // Village Elder / Headman
        const elderHome = residentialSites[0]; // Take first house
        const elder = addNPC("Villager", elderHome, elderHome, { title: townSize === 'hamlet' ? 'Headman' : 'Elder' });
        elder.job = `Leader of ${townName}`;
        leaderSet = true;
    }

    // 3. SERVICE BUILDINGS (Inns, Shops, Temples, Blacksmiths)
    serviceBuildings.forEach(b => {
        if (b.type === 'tavern' || b.type === 'inn') {
            const keeper = addNPC("Tavern Keeper", b, b, { title: "Owner" });
            keeper.job = `Owner of ${b.name}`;
            const spouseGender = keeper.gender === "Male" ? "Female" : "Male";
            const spouse = addNPC("Tavern Keeper", b, b, {
                gender: spouseGender,
                lastName: keeper.lastName,
                titleIndex: keeper.selectedTitleIndex // Sync titles like 'Host' & 'Hostess'
            });
            spouse.job = `Co-Owner of ${b.name}`;
        } else if (b.type === 'shop' || b.type === 'market') {
            // Check for "Name's Goods" pattern in building name
            let forcedOptions = {};
            if (b.name && b.name.includes("'s ")) {
                const possibleName = b.name.split("'s ")[0];
                if (HUMAN_NAMES_MALE.includes(possibleName)) {
                    forcedOptions = { firstName: possibleName, gender: "Male" };
                } else if (HUMAN_NAMES_FEMALE.includes(possibleName)) {
                    forcedOptions = { firstName: possibleName, gender: "Female" };
                }
            }

            const merchant = addNPC("Merchant", b, b, forcedOptions);
            merchant.job = `Proprietor of ${b.name}`;
            const spouseGender = merchant.gender === "Male" ? "Female" : "Male";
            const spouse = addNPC("Merchant", b, b, {
                gender: spouseGender,
                lastName: merchant.lastName,
                titleIndex: merchant.selectedTitleIndex
            });
            spouse.job = `Merchant at ${b.name}`;
        } else if (b.type === 'temple') {
            const priest = addNPC("Priest", b, b);
            priest.job = `${priest.title} of ${b.name}`;
            const spouseGender = priest.gender === "Male" ? "Female" : "Male";
            const spouse = addNPC("Acolyte", b, b, {
                gender: spouseGender,
                lastName: priest.lastName,
                titleIndex: priest.selectedTitleIndex // Father & Sister (or Mother & Brother)
            });
            spouse.job = `${spouse.title} of ${b.name}`;
        } else if (b.type === 'blacksmith') {
            const smith = addNPC("Blacksmith", b, b);
            smith.job = `Master Smith of ${b.name}`;
            const spouseGender = smith.gender === "Male" ? "Female" : "Male";
            const spouse = addNPC("Blacksmith", b, b, {
                gender: spouseGender,
                lastName: smith.lastName,
                titleIndex: smith.selectedTitleIndex
            });
            spouse.job = `Assistant Smith at ${b.name}`;
        } else if (b.type === 'guild') {
            const master = addNPC("Guild Master", b, b);
            master.job = `Master of ${b.name}`;
        }
    });

    // 4. RESIDENTIAL POPULATION (Families)
    const occupiedHomes = new Set(npcs.filter(n => n.location.homeCoords).map(n => `${n.location.homeCoords.x},${n.location.homeCoords.y}`));

    residentialSites.forEach(home => {
        if (occupiedHomes.has(`${home.x},${home.y}`)) return; // Skip if already populated (e.g. leader)

        const familyName = rng.pick(HUMAN_LAST_NAMES);
        const familySize = rng.range(3, 6); // More authentic medieval family sizes (1-4 children)

        for (let i = 0; i < familySize; i++) {
            const isChild = i >= 2;
            const canBeFarmer = workSites.length > 0 && (townSize === 'hamlet' || townSize === 'village' || townSize === 'town');
            const role = isChild ? "Villager" : (canBeFarmer ? "Farmer" : "Villager");
            const npc = addNPC(role, home, home, {
                lastName: familyName,
                title: isChild ? "Child" : (role === "Farmer" ? "Farmer" : "Citizen")
            });

            // Assign jobs to adults
            if (!isChild) {
                if (role === "Farmer" && workSites.length > 0) {
                    const site = workSites[rng.range(0, workSites.length - 1)];
                    npc.location.x = site.x;
                    npc.location.y = site.y;
                    npc.location.buildingType = site.type;
                    npc.job = site.type === 'field' ? "Tilling the fields" : "Tending to the barn";
                } else {
                    // Balanced Vocation System
                    if (!vocationSlots) {
                        const slotsBySize = {
                            hamlet: { "Cloth Weaver": 1, "Tool Mender": 1 },
                            village: { "Cloth Weaver": 1, "Tool Mender": 1, "Tanner": 1, "Tailor": 1, "Carpenter": 1 },
                            town: { "Cloth Weaver": 2, "Tool Mender": 2, "Tanner": 2, "Tailor": 2, "Carpenter": 2, "Ale Brewer": 2, "Baker": 2 },
                            city: { "Cloth Weaver": 5, "Tool Mender": 4, "Tanner": 4, "Tailor": 5, "Carpenter": 4, "Ale Brewer": 3, "Baker": 4 }
                        };
                        vocationSlots = { ...(slotsBySize[townSize] || slotsBySize.village) };
                    }

                    // Try to pick an available specialized vocation
                    const availableVocations = Object.keys(vocationSlots).filter(v => vocationSlots[v] > 0);
                    if (availableVocations.length > 0) {
                        const vocation = rng.pick(availableVocations);
                        npc.job = vocation;
                        vocationSlots[vocation]--;
                    } else {
                        // Fallback to more common/domestic activities
                        const domesticActivities = [
                            "Tending the hearth", "Cleaning the house", "Resting in the square",
                            "Trading at the market", "Mending nets", "Preparing a meal",
                            "Helping neighbors", "Running errands", "Fetching water"
                        ];
                        npc.job = rng.pick(domesticActivities);
                    }
                }
            } else {
                const childActivities = ["Playing in the street", "Helping parents", "Exploring nearby", "Playing tag"];
                npc.job = rng.pick(childActivities);
            }
        }
    });

    return npcs;
};

export default generateNPC;
