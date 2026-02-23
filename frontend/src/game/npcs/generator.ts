/**
 * NPC generator — generates NPCs and populates towns.
 * Ported from src/utils/npcGenerator.js — zero behavioral changes.
 *
 * NOTE: This file is intentionally large because the original npcGenerator.js
 * contained all NPC generation + town population logic in one file.
 */

import { v4 as uuidv4 } from "uuid";

import {
  HUMAN_LAST_NAMES,
  HUMAN_NAMES_FEMALE,
  HUMAN_NAMES_MALE,
  NOBLE_LAST_NAMES,
} from "../maps/name-generator.js";
import { calculateModifier } from "../rules/index.js";

// ── Seeded RNG ──────────────────────────────────────────────────────────────

/**
 * A simple Linear Congruential Generator (LCG) for deterministic randomness.
 * Should be sufficient for game logic.
 */
export class SeededRNG {
  private _seed: number;
  private _state: number;

  constructor(seed?: number | null) {
    // If no seed provided, use a random one
    this._seed = seed ?? Math.floor(Math.random() * 2_147_483_647);
    this._state = this._seed;
  }

  /** Returns a float between 0 and 1. */
  random(): number {
    this._state = (this._state * 9301 + 49_297) % 233_280;
    return this._state / 233_280;
  }

  /** Returns an integer between min (inclusive) and max (inclusive). */
  range(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /** Pick a random element from an array. */
  pick<T>(array: readonly T[]): T | null {
    if (array.length === 0) return null;
    return array[this.range(0, array.length - 1)] ?? null;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

/** Stat block for an NPC. */
export interface NPCStats {
  Strength: number;
  Dexterity: number;
  Constitution: number;
  Intelligence: number;
  Wisdom: number;
  Charisma: number;
  [key: string]: number;
}

/** NPC HP tracker. */
export interface NPCHP {
  current: number;
  max: number;
}

/** NPC location data. */
export interface NPCLocation {
  x: number;
  y: number;
  buildingName: string;
  buildingType: string;
  homeCoords: { x: number; y: number } | null;
}

/** A fully generated NPC. */
export interface NPC {
  id: string;
  seed: number;
  name: string;
  age: number;
  gender: string;
  race: string;
  role: string;
  title: string;
  class: string;
  level: number;
  alignment: string;
  stats: NPCStats;
  hp: NPCHP;
  inventory: (string | number)[];
  selectedTitleIndex: number;
  isNPC: boolean;
  location?: NPCLocation;
  job?: string;
  lastName?: string;
}

/** Options for generating an NPC. */
export interface GenerateNPCOptions {
  seed?: number | null | undefined;
  race?: string | undefined;
  gender?: string | undefined;
  role?: string | undefined;
  level?: number | undefined;
  title?: string | undefined;
  titleIndex?: number | undefined;
  lastName?: string | undefined;
  noEvil?: boolean | undefined;
  firstName?: string | undefined;
}

/** Role definition for NPC generation. */
interface RoleDefinition {
  possibleTitles: string[] | Record<string, string[]>;
  defaultClass: string;
  baseStats: NPCStats;
  inventory: (string | string[])[];
  hpRange: [number, number];
}

/** Town map tile as needed by populateTown. */
interface TownMapTile {
  type: string;
  buildingType?: string;
  buildingName?: string;
}

/** Town map data shape for populateTown. */
export interface PopulateTownMapData {
  mapData: TownMapTile[][];
  width: number;
  height: number;
  townSize: string;
  townName: string;
}

// ── Data ────────────────────────────────────────────────────────────────────

/** Frequently-referenced string literals extracted to satisfy sonarjs/no-duplicate-string. */
const FINE_CLOTHES = "Fine Clothes";
const ROLE_NOBLE_CHILD = "Noble Child";
const ROLE_TAVERN_KEEPER = "Tavern Keeper";

const ROLES: Record<string, RoleDefinition> = {
  Villager: {
    possibleTitles: ["Citizen", "Peasant", "Farmer", "Laborer", "Elder"],
    defaultClass: "Commoner",
    baseStats: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 10, Wisdom: 10, Charisma: 10 },
    inventory: ["Simple Clothes", "Bread"],
    hpRange: [4, 8],
  },
  Guard: {
    possibleTitles: ["Sentry", "Watchman", "Constable", "Captain", "Sergeant", "Lieutenant"],
    defaultClass: "Fighter",
    baseStats: { Strength: 14, Dexterity: 12, Constitution: 13, Intelligence: 10, Wisdom: 11, Charisma: 10 },
    inventory: ["Chain Shirt", ["Spear", "Longsword", "Halberd"], "Shield", "Whistle"],
    hpRange: [12, 20],
  },
  Merchant: {
    possibleTitles: ["Shopkeeper", "Trader", "Vendor", "Master", "Supplier"],
    defaultClass: "Expert",
    baseStats: { Strength: 10, Dexterity: 11, Constitution: 10, Intelligence: 13, Wisdom: 12, Charisma: 14 },
    inventory: [FINE_CLOTHES, "Ledger", "Ink & Quill"],
    hpRange: [6, 10],
  },
  Noble: {
    possibleTitles: {
      Male: ["Lord", "Baron", "Duke", "Earl", "Count", "Viscount", "Sir"],
      Female: ["Lady", "Baroness", "Duchess", "Countess", "Countess", "Viscountess", "Dame"],
    },
    defaultClass: "Aristocrat",
    baseStats: { Strength: 9, Dexterity: 12, Constitution: 9, Intelligence: 12, Wisdom: 11, Charisma: 15 },
    inventory: ["Silk Clothes", "Signet Ring", "Jewelry"],
    hpRange: [6, 12],
  },
  [ROLE_NOBLE_CHILD]: {
    possibleTitles: {
      Male: ["Young Lord", "Master"],
      Female: ["Young Lady", "Miss"],
    },
    defaultClass: "Aristocrat",
    baseStats: { Strength: 6, Dexterity: 10, Constitution: 8, Intelligence: 10, Wisdom: 8, Charisma: 12 },
    inventory: [FINE_CLOTHES, "Toy Sword", "Doll"],
    hpRange: [4, 6],
  },
  Criminal: {
    possibleTitles: ["Thief", "Bandit", "Cutpurse", "Thug", "Smuggler"],
    defaultClass: "Rogue",
    baseStats: { Strength: 12, Dexterity: 15, Constitution: 12, Intelligence: 10, Wisdom: 10, Charisma: 11 },
    inventory: [["Leather Armor", "Padded Armor"], ["Dagger", "Shortsword"], "Thieves' Tools", "Stolen Goods"],
    hpRange: [10, 16],
  },
  [ROLE_TAVERN_KEEPER]: {
    possibleTitles: {
      Male: ["Innkeeper", "Barkeep", "Owner", "Host"],
      Female: ["Innkeeper", "Barkeep", "Owner", "Hostess"],
    },
    defaultClass: "Expert",
    baseStats: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 12, Wisdom: 13, Charisma: 14 },
    inventory: ["Apron", "Keys to the Cellar", "Tankard", "Towel"],
    hpRange: [6, 12],
  },
  "Tavern Worker": {
    possibleTitles: {
      Male: ["Server", "Cook", "Stablehand", "Potboy"],
      Female: ["Server", "Cook", "Maid", "Hostess"],
    },
    defaultClass: "Commoner",
    baseStats: { Strength: 11, Dexterity: 12, Constitution: 11, Intelligence: 9, Wisdom: 10, Charisma: 10 },
    inventory: ["Simple Clothes", "Dirty Apron", ["Broom", "Tray", "Bucket"]],
    hpRange: [4, 8],
  },
  "Guild Master": {
    possibleTitles: ["Grandmaster", "High Artisan", "Guildmaster", "Director", "Foreman"],
    defaultClass: "Expert",
    baseStats: { Strength: 12, Dexterity: 12, Constitution: 12, Intelligence: 14, Wisdom: 14, Charisma: 14 },
    inventory: ["Guild Badge", "Masterwork Tool", FINE_CLOTHES, "Ledger"],
    hpRange: [10, 20],
  },
  "Guild Member": {
    possibleTitles: ["Journeyman", "Apprentice", "Member", "Initiate", "Adept"],
    defaultClass: "Expert",
    baseStats: { Strength: 11, Dexterity: 12, Constitution: 11, Intelligence: 12, Wisdom: 10, Charisma: 10 },
    inventory: ["Guild Badge", "Tools", "Apron"],
    hpRange: [6, 12],
  },
  Priest: {
    possibleTitles: {
      Male: ["Father", "High Priest", "Curate", "Bishop", "Elder"],
      Female: ["Mother", "High Priestess", "Bishop", "Elder"],
    },
    defaultClass: "Cleric",
    baseStats: { Strength: 10, Dexterity: 10, Constitution: 12, Intelligence: 12, Wisdom: 16, Charisma: 14 },
    inventory: ["Holy Symbol", "Vestments", "Prayer Book", "Incense"],
    hpRange: [12, 24],
  },
  Acolyte: {
    possibleTitles: {
      Male: ["Brother", "Novice", "Initiate", "Deacon"],
      Female: ["Sister", "Novice", "Initiate", "Deacon"],
    },
    defaultClass: "Adept",
    baseStats: { Strength: 10, Dexterity: 10, Constitution: 10, Intelligence: 11, Wisdom: 13, Charisma: 12 },
    inventory: ["Holy Symbol", "Simple Robes", "Candle"],
    hpRange: [6, 12],
  },
  Blacksmith: {
    possibleTitles: {
      Male: ["Smith", "Blacksmith", "Armorer", "Ironwright", "Master Smith"],
      Female: ["Smith", "Blacksmith", "Armorer", "Ironwright", "Master Smith"],
    },
    defaultClass: "Expert",
    baseStats: { Strength: 15, Dexterity: 10, Constitution: 14, Intelligence: 10, Wisdom: 11, Charisma: 10 },
    inventory: ["Leather Apron", "Hammer", "Tongs", "Iron Scraps"],
    hpRange: [10, 18],
  },
  Farmer: {
    possibleTitles: ["Farmer", "Crofter", "Husbandman", "Harvester", "Plowman"],
    defaultClass: "Commoner",
    baseStats: { Strength: 13, Dexterity: 11, Constitution: 12, Intelligence: 10, Wisdom: 11, Charisma: 10 },
    inventory: ["Rough Clothes", ["Pitchfork", "Scythe", "Sickle"], "Straw Hat"],
    hpRange: [6, 10],
  },
};

const ALIGNMENTS: readonly string[] = [
  "Lawful Good", "Neutral Good", "Chaotic Good",
  "Lawful Neutral", "True Neutral", "Chaotic Neutral",
  "Lawful Evil", "Neutral Evil", "Chaotic Evil",
];

const TRINKETS: readonly string[] = [
  "Brass Key", "Carved Wooden Duck", "Silver Locket", "Strange Coin", "Dice Set",
  "Dried Rabbit's Foot", "Letter from home", "Map fragment", "Shiny rock", "Bone whistle",
  "Copper Ring", "Old pipe", "Deck of cards", "Small mirror", "Bag of marbles",
];

// ── Name generator ──────────────────────────────────────────────────────────

/**
 * Picks a random name from the dataset.
 * @param gender - "Male", "Female", or null/other
 * @param rng - Optional SeededRNG instance
 * @param lastName - Optional fixed last name
 * @returns Full name string
 */
export const generateName = (
  gender: string | null,
  rng: SeededRNG | null = null,
  lastName: string | null = null,
): string => {
  const pick = <T>(arr: readonly T[]): T => {
    if (rng) return rng.pick(arr) as T;
    return arr[Math.floor(Math.random() * arr.length)] as T;
  };

  let firstName: string;
  if (gender === "Male") {
    firstName = pick(HUMAN_NAMES_MALE);
  } else if (gender === "Female") {
    firstName = pick(HUMAN_NAMES_FEMALE);
  } else {
    firstName = pick([...HUMAN_NAMES_MALE, ...HUMAN_NAMES_FEMALE]);
  }

  const selectedLastName = lastName ?? pick(HUMAN_LAST_NAMES);
  return `${firstName} ${selectedLastName}`;
};

// ── NPC generator helpers ───────────────────────────────────────────────────

/**
 * Determine the NPC's role key and role data.
 */
function determineRole(
  options: GenerateNPCOptions,
  rng: SeededRNG,
): { roleKey: string; roleData: RoleDefinition } {
  const roleKeys = Object.keys(ROLES);
  const roleKey =
    options.role && ROLES[options.role]
      ? options.role
      : rng.pick(roleKeys) ?? "Villager";
  const roleData = ROLES[roleKey] ?? ROLES["Villager"];
  if (!roleData) {
    // This should never happen since "Villager" is always defined
    throw new Error(`Role data not found for: ${roleKey}`);
  }
  return { roleKey, roleData };
}

/**
 * Determine the NPC's title and selected title index from role data.
 */
function determineTitle(
  options: GenerateNPCOptions,
  roleData: RoleDefinition,
  gender: string,
  rng: SeededRNG,
): { title: string; selectedTitleIndex: number } {
  if (options.title) {
    return { title: options.title, selectedTitleIndex: -1 };
  }

  const titles = roleData.possibleTitles;
  if (Array.isArray(titles)) {
    const idx = options.titleIndex ?? rng.range(0, titles.length - 1);
    const title = titles[idx] ?? "Citizen";
    return { title, selectedTitleIndex: idx };
  }

  // Record<string, string[]> — gendered titles
  const list = titles[gender] ?? titles["Male"] ?? [];
  const idx = options.titleIndex ?? rng.range(0, list.length - 1);
  const title = list[idx] ?? "Citizen";
  return { title, selectedTitleIndex: idx };
}

/**
 * Determine the NPC's age based on their role and title.
 */
function determineAge(roleKey: string, title: string, rng: SeededRNG): number {
  if (roleKey === ROLE_NOBLE_CHILD) {
    return rng.range(6, 15);
  }
  if (title.includes("Elder")) {
    return rng.range(60, 90);
  }
  // Weighted random for adults: mostly 20-50, some older
  const roll = rng.random();
  if (roll < 0.6) {
    return rng.range(18, 35); // Young adult
  }
  if (roll < 0.9) {
    return rng.range(36, 55); // Middle aged
  }
  return rng.range(56, 75); // Older
}

/**
 * Generate the NPC's inventory including wealth and optional trinket.
 */
function generateInventory(
  roleData: RoleDefinition,
  roleKey: string,
  rng: SeededRNG,
): (string | number)[] {
  const inventory: (string | number)[] = [...roleData.inventory].map(
    (item) => {
      // Resolve choices: if item is an array, pick one
      if (Array.isArray(item)) {
        return rng.pick(item) ?? item[0] ?? "Unknown Item";
      }
      return item;
    },
  );

  // Add Wealth based on Role/Class (Simple approximation)
  const coins = generateCoins(roleKey, rng);
  inventory.push(coins);

  // Add Trinket (30% chance)
  if (rng.random() < 0.3) {
    const trinket = rng.pick(TRINKETS);
    if (trinket) inventory.push(trinket);
  }

  return inventory;
}

/**
 * Generate a coins string based on the NPC's role.
 */
function generateCoins(roleKey: string, rng: SeededRNG): string {
  switch (roleKey) {
  case ROLE_NOBLE_CHILD: {
    return `${String(rng.range(2, 10))} Silver Pieces (Allowance)`;
  }
  case "Noble":
  case "Merchant": {
    return `${String(rng.range(20, 100))} Gold Places`;
  }
  case "Guard":
  case ROLE_TAVERN_KEEPER: {
    return `${String(rng.range(5, 20))} Silver Pieces`;
  }
  default: {
    return `${String(rng.range(2, 15))} Copper Pieces`;
  }
  }
}

// ── NPC generator ───────────────────────────────────────────────────────────

/**
 * Generates a full NPC object deterministically based on input options and/or a seed.
 */
export const generateNPC = (options: GenerateNPCOptions = {}): NPC => {
  // 1. Initialize RNG
  const seed = options.seed ?? Math.floor(Math.random() * 1_000_000);
  const rng = new SeededRNG(seed);

  // 2. Determine basic properties
  const race = options.race ?? "Human";
  const gender = options.gender ?? (rng.random() > 0.5 ? "Male" : "Female");

  // 3. Determine Role
  const { roleKey, roleData } = determineRole(options, rng);

  // 4. Determine Title
  const { title, selectedTitleIndex } = determineTitle(options, roleData, gender, rng);

  // 5. Determine Age
  const age = determineAge(roleKey, title, rng);

  // 6. Generate Name
  const fullName = generateName(gender, rng, options.lastName ?? null);

  // 7. Generate Stats (Base + Variance)
  const stats: NPCStats = { ...roleData.baseStats };
  // Add some simple variance (-1 to +2) to each stat to make them unique
  for (const stat of Object.keys(stats)) {
    const variance = rng.range(-1, 2);
    stats[stat] = Math.max(1, (stats[stat] ?? 10) + variance);
  }

  // 8. Calculate Derived Stats
  const level = options.level ?? 1;
  const conMod = calculateModifier(stats.Constitution);
  const baseHp = rng.range(roleData.hpRange[0], roleData.hpRange[1]);
  const maxHP = Math.max(1, baseHp + conMod * level);

  // 9. Other properties
  let availableAlignments: readonly string[] = ALIGNMENTS;
  if (options.noEvil) {
    availableAlignments = ALIGNMENTS.filter((a) => !a.includes("Evil"));
  }
  const alignment = rng.pick(availableAlignments) ?? "True Neutral";
  const npcClass = roleData.defaultClass;

  // 10. Inventory
  const inventory = generateInventory(roleData, roleKey, rng);

  return {
    id: uuidv4(),
    seed,
    name: fullName,
    age,
    gender,
    race,
    role: roleKey,
    title,
    class: npcClass,
    level,
    alignment,
    stats,
    hp: {
      current: maxHP,
      max: maxHP,
    },
    inventory,
    selectedTitleIndex,
    isNPC: true,
  };
};

// ── Town population ─────────────────────────────────────────────────────────

/** Site info extracted from town map analysis. */
interface SiteInfo {
  x: number;
  y: number;
  type: string;
  name?: string | undefined;
}

/** Result of analyzing the town map for buildings and sites. */
interface TownSiteAnalysis {
  residentialSites: SiteInfo[];
  serviceBuildings: SiteInfo[];
  workSites: SiteInfo[];
}

/**
 * Analyze a single map tile and categorize it into the appropriate site list.
 */
function categorizeTile(
  tile: TownMapTile,
  x: number,
  y: number,
  analysis: TownSiteAnalysis,
): void {
  if (tile.type === "building") {
    if (
      tile.buildingType === "house" ||
      tile.buildingType === "manor" ||
      tile.buildingType === "keep"
    ) {
      analysis.residentialSites.push({
        x,
        y,
        type: tile.buildingType,
        name: tile.buildingName,
      });
    } else {
      analysis.serviceBuildings.push({
        x,
        y,
        type: tile.buildingType ?? "unknown",
        name: tile.buildingName,
      });
    }
  } else if (tile.type === "farm_field") {
    analysis.workSites.push({ x, y, type: "field" });
  }
}

/**
 * Scan the town map data for buildings and work sites.
 */
function analyzeTownMap(
  mapData: TownMapTile[][],
  width: number,
  height: number,
): TownSiteAnalysis {
  const analysis: TownSiteAnalysis = {
    residentialSites: [],
    serviceBuildings: [],
    workSites: [],
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const row = mapData[y];
      if (!row) continue;
      const tile = row[x];
      if (!tile) continue;
      categorizeTile(tile, x, y, analysis);
    }
  }

  return analysis;
}

/**
 * Helper to create an NPC and assign location data.
 */
function addNPCToTown(
  npcs: NPC[],
  rng: SeededRNG,
  seed: number | string,
  role: string,
  workplace: SiteInfo,
  home: SiteInfo | null,
  options: GenerateNPCOptions = {},
): NPC {
  const npcSeed =
    Number.parseInt(String(seed), 10) +
    workplace.x * 1000 +
    workplace.y * 100 +
    rng.range(0, 9999);
  const npc = generateNPC({ seed: npcSeed, role, noEvil: true, ...options });

  npc.location = {
    x: workplace.x,
    y: workplace.y,
    buildingName: workplace.name ?? workplace.type,
    buildingType: workplace.type,
    homeCoords: home ? { x: home.x, y: home.y } : null,
  };
  npcs.push(npc);
  return npc;
}

/**
 * Determine the noble family name from the main residence.
 */
function determineNobleFamilyName(
  mainResidence: SiteInfo,
  townName: string,
  rng: SeededRNG,
): string {
  if (
    mainResidence.name &&
    mainResidence.name !== "Manor" &&
    mainResidence.name !== "Keep"
  ) {
    return mainResidence.name.split(" ")[0] ?? mainResidence.name;
  }
  if (rng.random() < 0.4) {
    // 40% chance the noble house takes the name of the town
    return townName.replace(/(?:ton|burg|shire|hold|wick|stead)$/, "");
  }
  return rng.pick(NOBLE_LAST_NAMES) ?? "Blackwood";
}

/**
 * Generate the noble family (head, spouse, children) for a main residence.
 */
function generateNobleFamily(
  npcs: NPC[],
  rng: SeededRNG,
  seed: number | string,
  mainResidence: SiteInfo,
  townName: string,
): void {
  const familyName = determineNobleFamilyName(mainResidence, townName, rng);

  // 1. Head of House
  const head = addNPCToTown(npcs, rng, seed, "Noble", mainResidence, mainResidence, {
    lastName: familyName,
  });
  head.job = `${head.title} of ${townName}`;

  // 2. Spouse
  const spouseGender = head.gender === "Male" ? "Female" : "Male";
  const spouse = addNPCToTown(npcs, rng, seed, "Noble", mainResidence, mainResidence, {
    lastName: familyName,
    gender: spouseGender,
    titleIndex: head.selectedTitleIndex,
  });
  spouse.job = `${spouse.title} of ${townName}`;

  // 3. Children (1-3)
  const childCount = rng.range(1, 3);
  for (let i = 0; i < childCount; i++) {
    const child = addNPCToTown(
      npcs, rng, seed,
      ROLE_NOBLE_CHILD,
      mainResidence,
      mainResidence,
      { lastName: familyName },
    );
    child.job = `${child.title} of the House ${familyName}`;
  }
}

/**
 * Handle town leader generation (noble family or village elder).
 */
function generateTownLeaders(
  npcs: NPC[],
  rng: SeededRNG,
  seed: number | string,
  residentialSites: readonly SiteInfo[],
  townSize: string,
  townName: string,
): void {
  const mainResidence = residentialSites.find(
    (r) => r.type === "keep" || r.type === "manor",
  );

  if (mainResidence) {
    generateNobleFamily(npcs, rng, seed, mainResidence, townName);
  } else if (residentialSites.length > 0) {
    // Village Elder / Headman
    const elderHome = residentialSites[0];
    if (elderHome) {
      const elder = addNPCToTown(npcs, rng, seed, "Villager", elderHome, elderHome, {
        title: townSize === "hamlet" ? "Headman" : "Elder",
      });
      elder.job = `Leader of ${townName}`;
    }
  }
}

/**
 * Populate a tavern/inn building with keeper and spouse.
 */
function populateTavern(
  npcs: NPC[],
  rng: SeededRNG,
  seed: number | string,
  building: SiteInfo,
): void {
  const keeper = addNPCToTown(npcs, rng, seed, ROLE_TAVERN_KEEPER, building, building, { title: "Owner" });
  keeper.job = `Owner of ${building.name ?? "the tavern"}`;
  const spouseGender = keeper.gender === "Male" ? "Female" : "Male";
  const spouse = addNPCToTown(npcs, rng, seed, ROLE_TAVERN_KEEPER, building, building, {
    gender: spouseGender,
    lastName: keeper.lastName,
    titleIndex: keeper.selectedTitleIndex,
  });
  spouse.job = `Co-Owner of ${building.name ?? "the tavern"}`;
}

/**
 * Populate a shop/market building with merchant and spouse.
 */
function populateShop(
  npcs: NPC[],
  rng: SeededRNG,
  seed: number | string,
  building: SiteInfo,
): void {
  // Check for "Name's Goods" pattern in building name
  let forcedOptions: GenerateNPCOptions = {};
  if (building.name?.includes("'s ")) {
    const possibleName = building.name.split("'s ")[0] ?? "";
    if (HUMAN_NAMES_MALE.includes(possibleName)) {
      forcedOptions = { firstName: possibleName, gender: "Male" };
    } else if (HUMAN_NAMES_FEMALE.includes(possibleName)) {
      forcedOptions = { firstName: possibleName, gender: "Female" };
    }
  }

  const merchant = addNPCToTown(npcs, rng, seed, "Merchant", building, building, forcedOptions);
  merchant.job = `Proprietor of ${building.name ?? "the shop"}`;
  const spouseGender = merchant.gender === "Male" ? "Female" : "Male";
  const spouse = addNPCToTown(npcs, rng, seed, "Merchant", building, building, {
    gender: spouseGender,
    lastName: merchant.lastName,
    titleIndex: merchant.selectedTitleIndex,
  });
  spouse.job = `Merchant at ${building.name ?? "the shop"}`;
}

/**
 * Populate a temple building with priest and acolyte.
 */
function populateTemple(
  npcs: NPC[],
  rng: SeededRNG,
  seed: number | string,
  building: SiteInfo,
): void {
  const priest = addNPCToTown(npcs, rng, seed, "Priest", building, building);
  priest.job = `${priest.title} of ${building.name ?? "the temple"}`;
  const spouseGender = priest.gender === "Male" ? "Female" : "Male";
  const acolyte = addNPCToTown(npcs, rng, seed, "Acolyte", building, building, {
    gender: spouseGender,
    lastName: priest.lastName,
    titleIndex: priest.selectedTitleIndex,
  });
  acolyte.job = `${acolyte.title} of ${building.name ?? "the temple"}`;
}

/**
 * Populate a blacksmith building with smith and assistant.
 */
function populateBlacksmith(
  npcs: NPC[],
  rng: SeededRNG,
  seed: number | string,
  building: SiteInfo,
): void {
  const smith = addNPCToTown(npcs, rng, seed, "Blacksmith", building, building);
  smith.job = `Master Smith of ${building.name ?? "the smithy"}`;
  const spouseGender = smith.gender === "Male" ? "Female" : "Male";
  const spouse = addNPCToTown(npcs, rng, seed, "Blacksmith", building, building, {
    gender: spouseGender,
    lastName: smith.lastName,
    titleIndex: smith.selectedTitleIndex,
  });
  spouse.job = `Assistant Smith at ${building.name ?? "the smithy"}`;
}

/**
 * Populate all service buildings in the town.
 */
function populateServiceBuildings(
  npcs: NPC[],
  rng: SeededRNG,
  seed: number | string,
  serviceBuildings: readonly SiteInfo[],
): void {
  for (const b of serviceBuildings) {
    switch (b.type) {
    case "tavern":
    case "inn": {
      populateTavern(npcs, rng, seed, b);
      break;
    }
    case "shop":
    case "market": {
      populateShop(npcs, rng, seed, b);
      break;
    }
    case "temple": {
      populateTemple(npcs, rng, seed, b);
      break;
    }
    case "blacksmith": {
      populateBlacksmith(npcs, rng, seed, b);
      break;
    }
    case "guild": {
      const master = addNPCToTown(npcs, rng, seed, "Guild Master", b, b);
      master.job = `Master of ${b.name ?? "the guild"}`;
      break;
    }
    // No default
    }
  }
}

/**
 * Get the set of home coordinates already occupied by NPCs.
 */
function getOccupiedHomes(npcs: readonly NPC[]): Set<string> {
  return new Set<string>(
    npcs
      .filter((n) => n.location?.homeCoords)
      .map(
        (n) =>
          `${String(n.location?.homeCoords?.x ?? 0)},${String(n.location?.homeCoords?.y ?? 0)}`,
      ),
  );
}

/**
 * Build the vocation slot table for a given town size.
 */
function buildVocationSlots(townSize: string): Record<string, number> {
  const slotsBySize: Record<string, Record<string, number>> = {
    hamlet: { "Cloth Weaver": 1, "Tool Mender": 1 },
    village: {
      "Cloth Weaver": 1,
      "Tool Mender": 1,
      Tanner: 1,
      Tailor: 1,
      Carpenter: 1,
    },
    town: {
      "Cloth Weaver": 2,
      "Tool Mender": 2,
      Tanner: 2,
      Tailor: 2,
      Carpenter: 2,
      "Ale Brewer": 2,
      Baker: 2,
    },
    city: {
      "Cloth Weaver": 5,
      "Tool Mender": 4,
      Tanner: 4,
      Tailor: 5,
      Carpenter: 4,
      "Ale Brewer": 3,
      Baker: 4,
    },
  };
  const slotsTemplate = slotsBySize[townSize] ?? slotsBySize["village"] ?? {};
  return { ...slotsTemplate };
}

const CHILD_ACTIVITIES: readonly string[] = [
  "Playing in the street",
  "Helping parents",
  "Exploring nearby",
  "Playing tag",
];

const DOMESTIC_ACTIVITIES: readonly string[] = [
  "Tending the hearth",
  "Cleaning the house",
  "Resting in the square",
  "Trading at the market",
  "Mending nets",
  "Preparing a meal",
  "Helping neighbors",
  "Running errands",
  "Fetching water",
];

/**
 * Assign a job to an adult NPC using vocation slots or domestic fallback.
 */
function assignAdultJob(
  npc: NPC,
  role: string,
  workSites: readonly SiteInfo[],
  vocationSlots: Record<string, number>,
  rng: SeededRNG,
): void {
  if (role === "Farmer" && workSites.length > 0) {
    const site = workSites[rng.range(0, workSites.length - 1)];
    if (site && npc.location) {
      npc.location.x = site.x;
      npc.location.y = site.y;
      npc.location.buildingType = site.type;
    }
    npc.job =
      site?.type === "field"
        ? "Tilling the fields"
        : "Tending to the barn";
    return;
  }

  // Balanced Vocation System — try to pick an available specialized vocation
  const availableVocations: string[] = Object.keys(vocationSlots).filter(
    (v) => (vocationSlots[v] ?? 0) > 0,
  );
  if (availableVocations.length > 0) {
    const vocation = rng.pick(availableVocations) ?? availableVocations[0] ?? "Laborer";
    npc.job = vocation;
    if (vocationSlots[vocation] !== undefined) {
      vocationSlots[vocation] = (vocationSlots[vocation] ?? 0) - 1;
    }
  } else {
    // Fallback to more common/domestic activities
    npc.job = rng.pick(DOMESTIC_ACTIVITIES) ?? "Resting in the square";
  }
}

/**
 * Generate a single residential family for a home.
 */
function generateResidentialFamily(
  npcs: NPC[],
  rng: SeededRNG,
  seed: number | string,
  home: SiteInfo,
  townSize: string,
  workSites: readonly SiteInfo[],
  vocationSlots: Record<string, number>,
): void {
  const familyName = rng.pick(HUMAN_LAST_NAMES) ?? "Smith";
  const familySize = rng.range(3, 6);

  for (let i = 0; i < familySize; i++) {
    const isChild = i >= 2;
    const canBeFarmer =
      workSites.length > 0 &&
      (townSize === "hamlet" ||
        townSize === "village" ||
        townSize === "town");
    const role = isChild ? "Villager" : canBeFarmer ? "Farmer" : "Villager";
    const npc = addNPCToTown(npcs, rng, seed, role, home, home, {
      lastName: familyName,
      title: isChild
        ? "Child"
        : role === "Farmer"
          ? "Farmer"
          : "Citizen",
    });

    // Assign jobs to adults
    if (isChild) {
      npc.job = rng.pick(CHILD_ACTIVITIES) ?? "Playing in the street";
    } else {
      assignAdultJob(npc, role, workSites, vocationSlots, rng);
    }
  }
}

/**
 * Populate residential homes with families.
 */
function populateResidentialHomes(
  npcs: NPC[],
  rng: SeededRNG,
  seed: number | string,
  residentialSites: readonly SiteInfo[],
  townSize: string,
  workSites: readonly SiteInfo[],
): void {
  let vocationSlots: Record<string, number> | null = null;
  const occupiedHomes = getOccupiedHomes(npcs);

  for (const home of residentialSites) {
    if (occupiedHomes.has(`${String(home.x)},${String(home.y)}`)) continue;

    vocationSlots ??= buildVocationSlots(townSize);

    generateResidentialFamily(npcs, rng, seed, home, townSize, workSites, vocationSlots);
  }
}

// ── Town population entry point ─────────────────────────────────────────────

/**
 * Scanning the town map data and generating NPCs for employment buildings.
 * @param townMapData - Output from generateTownMap
 * @param seed - Seed for deterministic generation
 * @returns List of generated NPCs with location data
 */
export const populateTown = (
  townMapData: PopulateTownMapData,
  seed: number | string,
): NPC[] => {
  const rng = new SeededRNG(typeof seed === "string" ? Number.parseInt(seed, 10) : seed);
  const npcs: NPC[] = [];
  const { mapData, width, height, townSize, townName } = townMapData;

  // 1. ANALYZE MAP FOR BUILDINGS & SITES
  const { residentialSites, serviceBuildings, workSites } = analyzeTownMap(mapData, width, height);

  // 2. TOWN LEADER LOGIC
  generateTownLeaders(npcs, rng, seed, residentialSites, townSize, townName);

  // 3. SERVICE BUILDINGS (Inns, Shops, Temples, Blacksmiths)
  populateServiceBuildings(npcs, rng, seed, serviceBuildings);

  // 4. RESIDENTIAL POPULATION (Families)
  populateResidentialHomes(npcs, rng, seed, residentialSites, townSize, workSites);

  return npcs;
};
