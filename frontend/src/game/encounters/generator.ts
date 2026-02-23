/**
 * Encounter generator — determines when and what encounters occur.
 * Ported from src/utils/encounterGenerator.js — zero behavioral changes.
 */

import {
  biomeEncounterChance,
  encounterTables,
  environmentalEncounterChance,
  environmentalEncounterTable,
  poiEncounterChance,
  poiEncounterTables,
  revisitEncounterMultiplier,
} from "./data/encounter-tables.js";
import { encounterTemplates } from "./data/encounter-templates.js";

import type {
  EncounterTableEntry,
} from "./data/encounter-tables.js";
import type { EncounterTemplate } from "./data/encounter-templates.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** Minimal tile shape needed by the encounter generator. */
export interface EncounterTile {
  readonly biome?: string;
  readonly poi?: string;
}

/** Settings shape needed by the encounter generator. */
export interface EncounterSettings {
  readonly grimnessLevel?: string;
}

/** A rolled encounter result, combining template with context. */
export interface RolledEncounter extends EncounterTemplate {
  readonly templateKey: string;
  readonly isHostile: boolean;
  readonly encounterTier: string;
  readonly sourceBiome?: string;
  readonly sourcePoiType?: string | null;
  readonly isEnvironmental?: boolean;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Determines the effective biome for encounter purposes.
 * Maps tile properties to encounter table keys.
 */
const getEncounterBiome = (tile: EncounterTile | null | undefined): string => {
  if (!tile) return "plains";

  // Towns get their own encounter table
  if (
    tile.poi === "town" ||
    tile.poi === "city" ||
    tile.poi === "village" ||
    tile.poi === "hamlet"
  ) {
    return "town";
  }

  // Map poi types to biomes for encounter purposes
  if (tile.poi === "forest") return "forest";
  if (tile.poi === "mountain") return "mountain";

  // Check tile biome property
  if (tile.biome === "water") return "water";
  if (tile.biome === "beach") return "beach";
  if (tile.biome === "forest") return "forest";
  if (tile.biome === "mountain") return "mountain";
  if (tile.biome === "plains") return "plains";

  // Default fallback
  return "plains";
};

/**
 * Weighted random selection from an encounter table.
 * Returns the selected entry.
 */
const weightedRandom = (
  table: readonly EncounterTableEntry[],
): EncounterTableEntry => {
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  let random = Math.random() * totalWeight;

  for (const entry of table) {
    random -= entry.weight;
    if (random <= 0) return entry;
  }

  // Fallback to last entry (should not normally reach here)
  const fallback = table.at(-1);
  if (!fallback) {
    throw new Error("weightedRandom called with empty table");
  }
  return fallback;
};

/**
 * Get the POI type for a tile if applicable.
 * Returns null if the tile doesn't have a POI with special encounters.
 */
const getPoiType = (tile: EncounterTile | null | undefined): string | null => {
  if (!tile?.poi) return null;

  const poiTypes = ["cave", "ruins", "grove", "forest", "mountain", "peak"];
  return poiTypes.includes(tile.poi) ? tile.poi : null;
};

// ── Grimness modifier tables ─────────────────────────────────────────────────

const grimnessModifierDefault: Record<string, number> = {
  Noble: 0.8,
  Gritty: 1,
  Dark: 1.2,
  Grimdark: 1.4,
};

const grimnessModifierEnvironmental: Record<string, number> = {
  Noble: 0.7,
  Gritty: 1,
  Dark: 1.3,
  Grimdark: 1.5,
};

const grimnessModifierPoi: Record<string, number> = {
  Noble: 0.8,
  Gritty: 1,
  Dark: 1.15,
  Grimdark: 1.3,
};

// ── Exported functions ───────────────────────────────────────────────────────

/**
 * Check if an encounter should happen on this tile.
 *
 * @param tile - The map tile the player moved to
 * @param isFirstVisit - Whether this is the first time visiting this tile
 * @param settings - Game settings (for grimness modifier)
 * @param movesSinceLastEncounter - Moves since last encounter occurred
 * @returns Whether an encounter should trigger
 */
export const shouldTriggerEncounter = (
  tile: EncounterTile | null | undefined,
  isFirstVisit: boolean,
  settings: EncounterSettings | null | undefined,
  movesSinceLastEncounter = 0,
): boolean => {
  const biome = getEncounterBiome(tile);

  // No encounters on water
  if (biome === "water") return false;

  // Get base chance for this biome
  let chance = biomeEncounterChance[biome] ?? 0.25;
  const baseChance = chance;

  // Reduce chance on revisited tiles
  if (!isFirstVisit) {
    const multiplier = revisitEncounterMultiplier[biome] ?? 0.3;
    chance *= multiplier;
  }

  // Grimness modifier: darker campaigns have more encounters
  chance *= grimnessModifierDefault[settings?.grimnessLevel ?? ""] ?? 1;

  // Increase chance slightly if it's been a while since last encounter
  // (prevents long stretches of nothing happening)
  if (movesSinceLastEncounter >= 3) {
    chance += 0.1;
  }
  if (movesSinceLastEncounter >= 5) {
    chance += 0.15;
  }

  // Cap at 70% — always some chance of peaceful travel
  chance = Math.min(chance, 0.7);

  const roll = Math.random();
   
  console.log("[ENCOUNTER DEBUG] shouldTriggerEncounter calc:", {
    baseChance,
    isFirstVisit,
    revisitMultiplier: isFirstVisit
      ? 1
      : (revisitEncounterMultiplier[biome] ?? 0.3),
    grimness: settings?.grimnessLevel,
    moveBonus:
      movesSinceLastEncounter >= 5
        ? 0.25
        : movesSinceLastEncounter >= 3
          ? 0.1
          : 0,
    finalChance: chance,
    roll,
    triggered: roll < chance,
  });

  return roll < chance;
};

/**
 * Roll a random encounter for a given tile.
 * Returns an encounter template or null if 'none' is rolled.
 *
 * @param tile - The map tile
 * @param _settings - Game settings (unused in original, preserved for API compat)
 * @returns The encounter object or null
 */
export const rollRandomEncounter = (
  tile: EncounterTile | null | undefined,
  _settings?: EncounterSettings | null  ,
): RolledEncounter | null => {
  void _settings; // Preserved for API compat — original code accepted but never used settings
  const biome = getEncounterBiome(tile);
  const poiType = getPoiType(tile);

  // Use POI-specific table if available, otherwise biome table
  const table: readonly EncounterTableEntry[] =
    poiType && poiEncounterTables[poiType]
      ? poiEncounterTables[poiType]
      : (encounterTables[biome] ?? encounterTables["plains"] ?? []);

  const roll = weightedRandom(table);

  if (roll.template === "none") return null;

  const template = encounterTemplates[roll.template];
  if (!template) {
     
    console.warn(`[ENCOUNTER] Template not found: ${roll.template}`);
    return null;
  }

  return {
    ...template,
    templateKey: roll.template,
    isHostile: roll.hostile !== false,
    encounterTier: roll.hostile === false ? "narrative" : "immediate",
    sourceBiome: biome,
    sourcePoiType: poiType,
  };
};

/**
 * Roll for an environmental encounter.
 * These can occur in any biome based on weather/hazard conditions.
 *
 * @param tile - The map tile
 * @param settings - Game settings
 * @returns The environmental encounter or null
 */
export const rollEnvironmentalEncounter = (
  tile: EncounterTile | null | undefined,
  settings: EncounterSettings | null | undefined,
): RolledEncounter | null => {
  const biome = getEncounterBiome(tile);
  const chance = environmentalEncounterChance[biome] ?? 0.1;

  // Apply grimness modifier
  const adjustedChance =
    chance *
    (grimnessModifierEnvironmental[settings?.grimnessLevel ?? ""] ?? 1);

  if (Math.random() > adjustedChance) return null;

  const roll = weightedRandom(environmentalEncounterTable);

  if (roll.template === "none") return null;

  const template = encounterTemplates[roll.template];
  if (!template) {
     
    console.warn(
      `[ENCOUNTER] Environmental template not found: ${roll.template}`,
    );
    return null;
  }

  return {
    ...template,
    templateKey: roll.template,
    isHostile: false,
    isEnvironmental: true,
    encounterTier: "immediate", // Environmental encounters show modal immediately
    sourceBiome: biome,
  };
};

/**
 * Check specifically for POI encounters.
 * Higher chance than regular encounters when at a POI.
 *
 * @param tile - The map tile
 * @param isFirstVisit - First time visiting
 * @param settings - Game settings
 * @returns The POI encounter or null
 */
export const checkForPoiEncounter = (
  tile: EncounterTile | null | undefined,
  isFirstVisit: boolean,
  settings: EncounterSettings | null | undefined,
): RolledEncounter | null => {
  const poiType = getPoiType(tile);
  if (!poiType) return null;

  let chance = poiEncounterChance[poiType] ?? 0.35;

  // Lower chance on revisits
  if (!isFirstVisit) {
    chance *= 0.4;
  }

  // Grimness modifier
  chance *= grimnessModifierPoi[settings?.grimnessLevel ?? ""] ?? 1;

  if (Math.random() > chance) return null;

  const table = poiEncounterTables[poiType];
  if (!table) return null;
  const roll = weightedRandom(table);

  if (roll.template === "none") return null;

  const template = encounterTemplates[roll.template];
  if (!template) {
     
    console.warn(`[ENCOUNTER] POI template not found: ${roll.template}`);
    return null;
  }

  return {
    ...template,
    templateKey: roll.template,
    isHostile: roll.hostile !== false,
    encounterTier: roll.hostile === false ? "narrative" : "immediate",
    sourcePoiType: poiType,
  };
};

/**
 * Convenience function: check + roll in one call.
 * Now includes POI and environmental encounter checks.
 * Priority: POI encounters > Environmental > Regular biome encounters
 *
 * @param tile - The map tile
 * @param isFirstVisit - First time visiting this tile
 * @param settings - Game settings
 * @param movesSinceLastEncounter - Moves since last encounter
 * @returns The encounter or null
 */
export const checkForEncounter = (
  tile: EncounterTile | null | undefined,
  isFirstVisit: boolean,
  settings: EncounterSettings | null | undefined,
  movesSinceLastEncounter = 0,
): RolledEncounter | null => {
  const biome = getEncounterBiome(tile);
   
  console.log("[ENCOUNTER DEBUG] checkForEncounter called:", {
    tile: { biome: (tile as EncounterTile | undefined)?.biome, poi: (tile as EncounterTile | undefined)?.poi },
    effectiveBiome: biome,
    isFirstVisit,
    movesSinceLastEncounter,
    baseChance: biomeEncounterChance[biome],
  });

  // First check for POI-specific encounters (higher priority)
  const poiEncounter = checkForPoiEncounter(tile, isFirstVisit, settings);
  if (poiEncounter) {
     
    console.log("[ENCOUNTER] POI encounter triggered:", poiEncounter.name);
    return poiEncounter;
  }

  // Then check for environmental encounters
  const envEncounter = rollEnvironmentalEncounter(tile, settings);
  if (envEncounter) {
     
    console.log(
      "[ENCOUNTER] Environmental encounter triggered:",
      envEncounter.name,
    );
    return envEncounter;
  }

  // Fall back to regular biome encounters
  const willTrigger = shouldTriggerEncounter(
    tile,
    isFirstVisit,
    settings,
    movesSinceLastEncounter,
  );
   
  console.log("[ENCOUNTER DEBUG] shouldTriggerEncounter result:", willTrigger);

  if (!willTrigger) {
    return null;
  }

  const encounter = rollRandomEncounter(tile, settings);
  if (encounter) {
     
    console.log("[ENCOUNTER] Biome encounter triggered:", encounter.name);
  } else {
     
    console.log(
      '[ENCOUNTER DEBUG] rollRandomEncounter returned null (rolled "none")',
    );
  }
  return encounter;
};
