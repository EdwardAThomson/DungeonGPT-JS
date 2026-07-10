// Audit context: loads every piece of static game data the domain checks need,
// and precomputes the derived collections that are annoying to recompute per
// check. Checks receive this object and stay pure (no imports of their own),
// which keeps them tiny and unit-testable.
//
// Add data here as new domains land. Keep it lazy-free and side-effect-free:
// buildAuditContext() must be safe to call in a Jest test and in a plain esbuild
// bundle alike (see scripts/content-audit.mjs). Only import PURE data modules —
// never anything that pulls in React, the DOM, or network code.

import { storyTemplates } from '../data/storyTemplates';
import { ITEM_CATALOG } from '../utils/inventorySystem';
import { XP_THRESHOLDS } from '../utils/progressionSystem';
import { encounterTemplates } from '../data/encounters';
import { BUILDING_TYPES as ART_BUILDING_TYPES } from '../utils/townTileArt';
import { SHOP_STOCK } from '../data/shopStock';
import {
  encounterTables as BIOME_ENCOUNTER_TABLES,
  caveEncounterTable,
  ruinsEncounterTable,
  groveEncounterTable,
  mountainEncounterTable,
  environmentalEncounterTable
} from '../data/encounterTables';

// ---------------------------------------------------------------------------
// Maintained mirrors of town-generator internals.
//
// A few tables the building checks need live as MODULE-PRIVATE consts inside
// src/utils/townMapGenerator.js (BUILDING_CONFIG, and the assignBuildingName
// if-chain, which is a closure inside placeBuildings). Importing that module
// would work off Babel/esbuild, but the data we need is not exported. Rather
// than widen the generator's public surface just for the audit, we mirror the
// two small lists here with a comment pointing at the source, and pair them
// with a static test (see contentAudit.test.js is the CI gate; the mirrors are
// short and change rarely). This is the "small maintained list" tradeoff the
// audit README calls out: it keeps the esbuild bundle light and JSX-free.
// ---------------------------------------------------------------------------

// Every building type the town GENERATOR actually places on a map. Mirrors
// BUILDING_CONFIG's important/secondary/nobleEstate rosters + the civic hall +
// keep + jail placements + the on-water waterfront types (harbormaster /
// boathouse / dockside warehouse), plus `house`. Source of truth:
// src/utils/townMapGenerator.js (BUILDING_CONFIG ~L34-74, placeBuildings).
export const PLACEABLE_BUILDING_TYPES = Object.freeze([
  'barn', 'shrine', 'mill', 'inn', 'shop', 'blacksmith', 'tavern', 'alchemist',
  'stables', 'temple', 'archives', 'warehouse', 'tailor', 'fletcher',
  'apothecary', 'townhall', 'market', 'bank', 'guild', 'library', 'foundry',
  'magetower', 'keep', 'jail', 'manor', 'harbormaster', 'boathouse', 'house'
]);

// Building types with a dedicated name-generator branch in assignBuildingName
// (src/utils/townMapGenerator.js ~L2437-2509). assignBuildingName is a closure
// inside placeBuildings and is NOT exported, so this mirrors its if-chain.
// Every placeable type now has an explicit branch, and a generic title-case
// safety net (`buildingType && buildingType !== 'house'`) catches anything else,
// so no placeable type can regress to a bare type label. `house` is intentionally
// absent everywhere: houses are anonymous by design.
export const BUILDING_NAME_GENERATOR_TYPES = Object.freeze([
  'tavern', 'inn', 'guild', 'bank', 'shop', 'market', 'blacksmith', 'manor',
  'keep', 'temple', 'archives', 'library', 'alchemist', 'foundry', 'warehouse',
  'apothecary', 'tailor', 'fletcher', 'stables', 'mill', 'shrine', 'barn',
  'magetower', 'townhall', 'jail', 'harbormaster', 'boathouse'
]);

// Building types that open a shop UI in-game. Mirrors SHOP_BUILDING_TYPES in
// src/components/BuildingModal.js (a JSX component we must not pull into the
// bundle). A shop type absent from SHOP_STOCK renders an empty store, so BLD-05
// cross-checks this list against shopStock.js.
export const SHOP_BUILDING_TYPES = Object.freeze([
  'shop', 'market', 'blacksmith', 'alchemist', 'apothecary'
]);

// ---------------------------------------------------------------------------
// Maintained mirrors of map / world-render internals (map + display domains).
//
// The world capability tables the map checks need live either as MODULE-PRIVATE
// consts (getEncounterBiome's if-chain in encounterGenerator.js), as a
// FUNCTION-LOCAL const (POI_IMAGES / NICE_NAMES inside buildPoiEncounter in
// worldMoveController.js), or as big if-chains inside exported RENDER FUNCTIONS
// (biomeBackground / poiSprite in worldTileArt.js) whose branch keys we cannot
// read by importing the function. Rather than widen those modules' public
// surface just for the audit, we mirror the small key lists here with a comment
// pointing at each source — the same tradeoff context.js already makes for the
// building tables. Keep them in sync when those tables change.
// ---------------------------------------------------------------------------

// tile.biome values the PRODUCTION generator (generateMapData, fixed 10x10) can
// stamp on a tile: the theme land base (plains / desert / snow) plus the coast
// (water / beach) it always carves. `woodland` is a latent land biome (in
// applyEdgeConstraints' LAND_BIOMES set) but NO generator sets landBiome to it
// today, and edge constraints are debug-only (worldAssembler, /debug/large-world),
// so it is not currently producible. Source: src/utils/mapGenerator.js
// (landBiome ~L67, placeCoast / lakes).
export const PRODUCIBLE_BIOMES = Object.freeze([
  'plains', 'desert', 'snow', 'water', 'beach'
]);

// tile.biome values getEncounterBiome resolves to an encounter-table key. Any
// producible biome NOT here silently collapses to the 'plains' default (the
// historical snow-collapses-to-plains class of bug; snow/desert were added to
// close it). Source: src/utils/encounterGenerator.js getEncounterBiome (the
// tile.biome branch).
export const ENCOUNTER_BIOME_CASES = Object.freeze([
  'water', 'beach', 'forest', 'mountain', 'plains', 'snow', 'desert'
]);

// tile.biome values biomeBackground draws a dedicated sprite for; anything else
// falls through to the plains sprite. Source: src/utils/worldTileArt.js
// biomeBackground (the if-chain; `plains` is the else fallback).
export const BIOME_ART_CASES = Object.freeze([
  'water', 'beach', 'desert', 'swamp', 'snow', 'woodland', 'plains', 'lake'
]);

// tile.poi values poiSprite draws a DISTINCTIVE world-map sprite for. A milestone
// POI whose tile.poi is not one of these (tile.poi is stamped with the spawn id,
// e.g. 'shadow_fortress') falls through to the generic red milestone flag. The
// generic tile kinds (town/forest/mountain/hills/cave_entrance/ruins) plus the 17
// authored milestone spawn ids, each with its own poiSprite builder (mirrors
// MILESTONE_POI_SPRITES). Source: src/utils/worldTileArt.js poiSprite.
export const POI_SPRITE_TYPES = Object.freeze([
  'town', 'forest', 'mountain', 'hills', 'cave_entrance', 'ruins',
  'goblin_hideout', 'shadow_fortress', 'sandstorm_hideout', 'sunken_spire',
  'glacier_hollow', 'silent_steading', 'famine_barrow', 'abandoned_well',
  'grimstead_cellar', 'ironhold_ruins', 'rot_tunnels', 'gear_end_sewers',
  'coghill_foundry', 'desecrated_shrine', 'cult_meeting_place',
  'corrupted_lighthouse', 'mourn_peak_summit'
]);

// Keys of the POI_IMAGES map that supplies the ARRIVAL art shown in the POI
// arrival modal (image = POI_IMAGES[poiType], poiType = tile.poiType || tile.poi).
// Milestone POIs stamp tile.poi with the spawn id, so a spawn id absent here
// arrives with no art. The generic-kind keys (cave_entrance/cave/ruins/mountain/
// forest/hills) plus goblin_hideout cover procedural + legacy POIs; the remaining
// 16 are the authored milestone spawn ids, each with its own arrival .webp. Source:
// src/game/worldMoveController.js buildPoiEncounter (function-local POI_IMAGES const).
export const POI_ARRIVAL_IMAGE_KEYS = Object.freeze([
  'cave_entrance', 'cave', 'ruins', 'goblin_hideout', 'mountain', 'forest', 'hills',
  'shadow_fortress', 'sandstorm_hideout', 'sunken_spire', 'glacier_hollow',
  'silent_steading', 'famine_barrow', 'abandoned_well', 'grimstead_cellar',
  'ironhold_ruins', 'rot_tunnels', 'gear_end_sewers', 'coghill_foundry',
  'desecrated_shrine', 'cult_meeting_place', 'corrupted_lighthouse',
  'mourn_peak_summit'
]);

/**
 * Strip a drop-chance suffix from a reward item entry.
 * Reward item lists mix plain ids ('rations') with chance-tagged ids
 * ('healing_potion:20%'); the id before the colon is the catalog key.
 * @param {string} entry
 * @returns {string} bare catalog id
 */
export function stripDropChance(entry) {
  if (typeof entry !== 'string') return String(entry);
  return entry.split(':')[0].trim();
}

/** Milestones of a template, or [] for card-face/comingSoon/teaser stubs. */
function milestonesOf(template) {
  return (template && template.settings && Array.isArray(template.settings.milestones))
    ? template.settings.milestones
    : [];
}

/**
 * The town names a campaign will actually generate: its authored `customNames.towns`
 * (entries may be plain strings or size-tagged `{ name, size }` objects) plus every
 * milestone `location` (which also covers wilderness ranges). Returned lowercased so
 * building/NPC venue lookups are case-insensitive.
 * @param {object} template
 * @returns {Set<string>}
 */
function townNamesOf(template) {
  const names = new Set();
  const towns = template && template.customNames && template.customNames.towns;
  if (Array.isArray(towns)) {
    for (const entry of towns) {
      const name = (entry && typeof entry === 'object') ? entry.name : entry;
      if (name) names.add(String(name).toLowerCase());
    }
  }
  for (const m of milestonesOf(template)) {
    if (m && m.location) names.add(String(m.location).toLowerCase());
  }
  return names;
}

/**
 * Build the shared audit context.
 * @returns {object} context consumed by every domain module's checks
 */
export function buildAuditContext() {
  const templates = Array.isArray(storyTemplates) ? storyTemplates : [];

  // --- Playable templates only (skip comingSoon / teaser / shop-window stubs) ---
  // Stubs carry no settings.milestones, so they contribute nothing to the item
  // graph; keeping the raw `templates` too lets other domains inspect stubs.
  const playableTemplates = templates.filter((t) => milestonesOf(t).length > 0);

  // --- Item references from templates ---------------------------------------
  // Every catalog id a template points at, tagged with a human-readable location
  // so violation messages can name the exact template + milestone + field.
  const templateItemRefs = []; // { id, location }
  const questItems = [];       // { id, template, milestoneId, milestoneText, location }

  for (const t of playableTemplates) {
    const where = t.id || t.name || 'unknown-template';
    for (const m of milestonesOf(t)) {
      const mLoc = `${where} / milestone ${m.id}`;

      // spawn (type item)
      if (m.spawn && m.spawn.type === 'item' && m.spawn.id) {
        templateItemRefs.push({ id: m.spawn.id, location: `${mLoc} spawn.id` });
      }

      // trigger.item — the quest-item id
      if (m.trigger && m.trigger.item) {
        templateItemRefs.push({ id: m.trigger.item, location: `${mLoc} trigger.item` });
        questItems.push({
          id: m.trigger.item,
          template: where,
          milestoneId: m.id,
          milestoneText: m.text || '',
          location: `${mLoc} trigger.item`
        });
      }

      // milestone rewards
      if (m.rewards && Array.isArray(m.rewards.items)) {
        for (const raw of m.rewards.items) {
          templateItemRefs.push({ id: stripDropChance(raw), location: `${mLoc} rewards.items` });
        }
      }

      // boss/encounter rewards attached to the milestone
      if (m.encounter && m.encounter.rewards && Array.isArray(m.encounter.rewards.items)) {
        for (const raw of m.encounter.rewards.items) {
          templateItemRefs.push({ id: stripDropChance(raw), location: `${mLoc} encounter.rewards.items` });
        }
      }
    }
  }

  // --- Encounter loot references --------------------------------------------
  // Every catalog id an encounter template can drop. This is BOTH an existence
  // source (ITEM-01) and the surface a quest item must never appear on (ITEM-03).
  const encounterLootRefs = []; // { id, location, raw, encounterId }
  for (const [encId, enc] of Object.entries(encounterTemplates || {})) {
    if (enc && enc.rewards && Array.isArray(enc.rewards.items)) {
      for (const raw of enc.rewards.items) {
        encounterLootRefs.push({
          id: stripDropChance(raw),
          raw,
          encounterId: encId,
          location: `encounter '${encId}' rewards.items`
        });
      }
    }
  }

  // --- Encounter-table references (encounters domain) -----------------------
  // Every `template` key across every weighted encounter table, tagged with the
  // table it came from. 'none' is the special no-encounter marker (not a template
  // id), kept in the list so a check can decide how to treat it. Source of the
  // tables: src/data/encounterTables.js.
  const encounterTableRefs = []; // { template, tableName, location }
  const namedTables = [];
  for (const [name, table] of Object.entries(BIOME_ENCOUNTER_TABLES || {})) {
    namedTables.push([`biome:${name}`, table]);
  }
  namedTables.push(
    ['cave', caveEncounterTable],
    ['ruins', ruinsEncounterTable],
    ['grove', groveEncounterTable],
    ['mountain', mountainEncounterTable],
    ['environmental', environmentalEncounterTable]
  );
  for (const [tableName, table] of namedTables) {
    if (!Array.isArray(table)) continue;
    for (const entry of table) {
      if (!entry || entry.template == null) continue;
      encounterTableRefs.push({
        template: entry.template,
        tableName,
        location: `encounterTables '${tableName}' -> '${entry.template}'`
      });
    }
  }

  // --- Milestone POI spawns (map / display domains) -------------------------
  // Every milestone `spawn` of type 'poi'. The generator stamps tile.poi with the
  // spawn id (milestoneSpawner.js), so the id is the key both the arrival-image
  // lookup (POI_IMAGES) and the world sprite (poiSprite) are checked against.
  const milestonePois = []; // { id, name, location, template, loc }
  for (const t of playableTemplates) {
    const where = t.id || t.name || 'unknown-template';
    for (const m of milestonesOf(t)) {
      if (m && m.spawn && m.spawn.type === 'poi') {
        milestonePois.push({
          id: m.spawn.id || null,
          name: m.spawn.name || null,
          location: m.spawn.location || null,
          template: where,
          loc: `${where} / milestone ${m.id} spawn(poi)`
        });
      }
    }
  }

  // --- Campaign view (buildings / npcs / milestones domains) ----------------
  // One entry per playable template: its resolved town-name set plus the raw
  // milestone array. The three campaign domains iterate this instead of walking
  // storyTemplates themselves, so a template that carries no milestones (stub)
  // never reaches them.
  const campaigns = playableTemplates.map((t) => ({
    template: t.id || t.name || 'unknown-template',
    townNames: townNamesOf(t),
    milestones: milestonesOf(t),
    // Entry level band [floor, ceil]. The milestones domain uses the floor to decide
    // whether a campaign is a fresh start (party provably at 0 XP) versus a
    // continuation that carries unbounded prior XP. See MS-07.
    levelRange: Array.isArray(t.levelRange) ? t.levelRange : null
  }));

  // Every milestone `building` block, tagged with its campaign's town set so a
  // check can validate the venue location without re-deriving it.
  const milestoneBuildings = []; // { template, milestoneId, type, name, location, townNames, loc }
  // Every milestone `spawn` of type 'npc', flattened with the fields
  // getMilestoneNpcsForTown reads (name, role, personality, venue town).
  const npcSpawns = []; // { template, milestoneId, id, name, role, gender, personality, venueTown, hasBuilding, townNames, loc }

  for (const c of campaigns) {
    for (const m of c.milestones) {
      if (m && m.building && (m.building.type || m.building.name || m.building.location)) {
        milestoneBuildings.push({
          template: c.template,
          milestoneId: m.id,
          type: m.building.type || null,
          name: m.building.name || null,
          location: m.building.location || null,
          townNames: c.townNames,
          loc: `${c.template} / milestone ${m.id} building`
        });
      }
      if (m && m.spawn && m.spawn.type === 'npc') {
        npcSpawns.push({
          template: c.template,
          milestoneId: m.id,
          id: m.spawn.id || null,
          name: m.spawn.name || null,
          role: m.spawn.role || null,
          gender: m.spawn.gender || null,
          personality: m.spawn.personality || null,
          // getMilestoneNpcsForTown resolves the venue town as spawn.location || building.location.
          venueTown: m.spawn.location || (m.building && m.building.location) || null,
          hasBuilding: !!m.building,
          townNames: c.townNames,
          loc: `${c.template} / milestone ${m.id} spawn(npc)`
        });
      }
    }
  }

  return {
    // Raw data (all domains)
    templates,            // every template incl. stubs
    playableTemplates,    // templates that have milestones
    itemCatalog: ITEM_CATALOG,
    encounterTemplates,

    // Helpers
    stripDropChance,
    milestonesOf,
    townNamesOf,

    // Progression thresholds (milestones domain, MS-07 level-gate reachability).
    // XP_THRESHOLDS[level-1] is the cumulative XP a character needs to BE that level.
    xpThresholds: XP_THRESHOLDS,

    // Campaign view (buildings / npcs / milestones domains)
    campaigns,            // [{ template, townNames:Set, milestones:[], levelRange }]
    milestoneBuildings,   // [{ template, milestoneId, type, name, location, townNames, loc }]
    npcSpawns,            // [{ template, milestoneId, id, name, role, personality, venueTown, ... }]

    // Building capability tables (maintained mirrors + pure imports)
    placeableBuildingTypes: PLACEABLE_BUILDING_TYPES,   // generator rosters
    artBuildingTypes: ART_BUILDING_TYPES,               // townTileArt BUILDING_TYPES
    buildingNameGeneratorTypes: BUILDING_NAME_GENERATOR_TYPES, // assignBuildingName branches
    shopBuildingTypes: SHOP_BUILDING_TYPES,             // BuildingModal shop UI types
    shopStock: SHOP_STOCK,                              // shopStock.js SHOP_STOCK

    // Derived collections (items domain)
    templateItemRefs,     // [{ id, location }]  authored item references
    questItems,           // [{ id, template, milestoneId, milestoneText, location }]
    encounterLootRefs,    // [{ id, raw, encounterId, location }]

    // Encounters domain
    encounterTableRefs,   // [{ template, tableName, location }] weighted-table entries

    // Map / display domains
    milestonePois,        // [{ id, name, location, template, loc }] type:'poi' spawns
    producibleBiomes: PRODUCIBLE_BIOMES,          // generator-stampable tile.biome values
    encounterBiomeCases: ENCOUNTER_BIOME_CASES,   // getEncounterBiome tile.biome branch
    biomeArtCases: BIOME_ART_CASES,               // biomeBackground drawn biomes
    poiSpriteTypes: POI_SPRITE_TYPES,             // poiSprite distinctive tile.poi branches
    poiArrivalImageKeys: POI_ARRIVAL_IMAGE_KEYS   // POI_IMAGES arrival-art keys
  };
}

export default buildAuditContext;
