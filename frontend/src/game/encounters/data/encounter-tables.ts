/**
 * Encounter tables — biome-specific weighted tables.
 * Ported from src/data/encounterTables.js — zero behavioral changes.
 */

// ── Types ────────────────────────────────────────────────────────────────────

/** A single entry in an encounter table. */
export interface EncounterTableEntry {
  readonly template: string;
  readonly weight: number;
  readonly hostile?: boolean;
}

// ── Biome encounter tables ───────────────────────────────────────────────────

export const encounterTables: Record<string, readonly EncounterTableEntry[]> = {
  plains: [
    { template: "goblin_ambush", weight: 12, hostile: true },
    { template: "wolf_pack", weight: 10, hostile: true },
    { template: "bandit_roadblock", weight: 10, hostile: true },
    { template: "traveling_merchant", weight: 12, hostile: false },
    { template: "wandering_minstrel", weight: 8, hostile: false },
    { template: "lost_child", weight: 7, hostile: false },
    { template: "herb_gathering", weight: 7, hostile: false },
    { template: "abandoned_campsite", weight: 8, hostile: false },
    { template: "mysterious_stranger", weight: 8, hostile: false },
    { template: "wounded_traveler", weight: 7, hostile: false },
    { template: "distant_smoke", weight: 6, hostile: false },
    { template: "none", weight: 5 },
  ],

  forest: [
    { template: "giant_spiders", weight: 15, hostile: true },
    { template: "bear_encounter", weight: 10, hostile: true },
    { template: "wolf_pack", weight: 8, hostile: true },
    { template: "elf_patrol", weight: 10, hostile: false },
    { template: "mysterious_shrine", weight: 7, hostile: false },
    { template: "herb_gathering", weight: 10, hostile: false },
    { template: "abandoned_campsite", weight: 7, hostile: false },
    { template: "hidden_treasure", weight: 6, hostile: false },
    { template: "distant_smoke", weight: 5, hostile: false },
    { template: "none", weight: 22 },
  ],

  mountain: [
    { template: "rockslide", weight: 15, hostile: true },
    { template: "bandit_roadblock", weight: 12, hostile: true },
    { template: "bear_encounter", weight: 8, hostile: true },
    { template: "mountain_hermit", weight: 12, hostile: false },
    { template: "mysterious_shrine", weight: 8, hostile: false },
    { template: "abandoned_campsite", weight: 7, hostile: false },
    { template: "hidden_treasure", weight: 7, hostile: false },
    { template: "distant_smoke", weight: 6, hostile: false },
    { template: "none", weight: 25 },
  ],

  town: [
    { template: "tavern_brawl", weight: 8, hostile: false },
    { template: "town_market", weight: 20, hostile: false },
    { template: "town_quest_board", weight: 18, hostile: false },
    { template: "town_healer", weight: 15, hostile: false },
    { template: "suspicious_stranger", weight: 12, hostile: false },
    { template: "wandering_minstrel", weight: 8, hostile: false },
    { template: "mysterious_stranger", weight: 10, hostile: false },
    { template: "none", weight: 9 },
  ],

  beach: [
    { template: "bandit_roadblock", weight: 8, hostile: true },
    { template: "traveling_merchant", weight: 12, hostile: false },
    { template: "abandoned_campsite", weight: 12, hostile: false },
    { template: "lost_child", weight: 8, hostile: false },
    { template: "hidden_treasure", weight: 10, hostile: false },
    { template: "none", weight: 50 },
  ],
};

// ── Encounter chance tables ──────────────────────────────────────────────────

export const biomeEncounterChance: Record<string, number> = {
  plains: 0.3,
  forest: 0.35,
  mountain: 0.3,
  town: 0.4,
  beach: 0.15,
  water: 0,
};

export const revisitEncounterMultiplier: Record<string, number> = {
  plains: 0.3,
  forest: 0.4,
  mountain: 0.35,
  town: 0.5,
  beach: 0.2,
  water: 0,
};

// ── POI encounter tables ─────────────────────────────────────────────────────

const caveEncounterTable: readonly EncounterTableEntry[] = [
  { template: "cave_bats", weight: 15, hostile: false },
  { template: "cave_spider_nest", weight: 12, hostile: true },
  { template: "cave_treasure_guardian", weight: 5, hostile: true },
  { template: "cave_entrance", weight: 20, hostile: false },
  { template: "cave_underground_lake", weight: 15, hostile: false },
  { template: "none", weight: 33 },
];

const ruinsEncounterTable: readonly EncounterTableEntry[] = [
  { template: "ruin_ghost", weight: 12, hostile: true },
  { template: "ruin_cultists", weight: 8, hostile: true },
  { template: "ruin_entrance", weight: 20, hostile: false },
  { template: "ruin_treasure_vault", weight: 12, hostile: false },
  { template: "ruin_ancient_library", weight: 15, hostile: false },
  { template: "none", weight: 33 },
];

const groveEncounterTable: readonly EncounterTableEntry[] = [
  { template: "forest_beast", weight: 10, hostile: true },
  { template: "sacred_grove", weight: 20, hostile: false },
  { template: "dryad_encounter", weight: 15, hostile: false },
  { template: "fairy_ring", weight: 12, hostile: false },
  { template: "none", weight: 43 },
];

const mountainEncounterTable: readonly EncounterTableEntry[] = [
  { template: "mountain_dragon", weight: 5, hostile: true },
  { template: "mountain_pass", weight: 20, hostile: false },
  { template: "mountain_hermit", weight: 18, hostile: false },
  { template: "mountain_eagle_nest", weight: 15, hostile: false },
  { template: "none", weight: 42 },
];

export const poiEncounterTables: Record<
  string,
  readonly EncounterTableEntry[]
> = {
  cave: caveEncounterTable,
  ruins: ruinsEncounterTable,
  grove: groveEncounterTable,
  forest: groveEncounterTable,
  mountain: mountainEncounterTable,
  peak: mountainEncounterTable,
};

// ── Environmental encounter tables ───────────────────────────────────────────

export const environmentalEncounterTable: readonly EncounterTableEntry[] = [
  { template: "sudden_storm", weight: 15, hostile: false },
  { template: "earthquake", weight: 5, hostile: false },
  { template: "thick_fog", weight: 20, hostile: false },
  { template: "heat_wave", weight: 12, hostile: false },
  { template: "strange_lights", weight: 15, hostile: false },
  { template: "none", weight: 33 },
];

export const environmentalEncounterChance: Record<string, number> = {
  plains: 0.15,
  forest: 0.1,
  mountain: 0.2,
  beach: 0.12,
  desert: 0.25,
  swamp: 0.18,
  town: 0.05,
};

export const poiEncounterChance: Record<string, number> = {
  cave: 0.5,
  ruins: 0.45,
  grove: 0.35,
  mountain: 0.4,
  peak: 0.35,
};
