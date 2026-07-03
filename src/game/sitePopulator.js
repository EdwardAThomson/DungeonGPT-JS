// sitePopulator.js
// Phase 3: fill a wilderness site's reserved content slots (the ◆ tiles from
// siteMapGenerator) with combat encounters and loot, deterministically by seed. The
// trigger wiring (firing content when the player reaches a slot) lives in the game loop;
// this module only DECIDES and STORES what each slot holds, so it stays pure + testable.
//
// Each populated slot tile gets `tile.content = { kind, ...payload, consumed: false }`:
//   - kind: 'encounter' -> reuses a cave/ruins encounter template (combat)
//   - kind: 'loot'      -> { gold: number, items: [itemKey, ...] }
// Milestone objectives (kind: 'objective') are a later step (3c).
//
// Besides the reserved slots, populateSite also turns 1-3 of the generator's scattered 💎
// crystal decorations (cave/mountain sites) into harvestable deposits — loot content with
// `display: 'crystal'` so the renderer draws the gem itself — and strips the leftover
// decorative crystals (issue #38: never show a crystal the player can't pick up).

import { CAVE_ENCOUNTERS } from '../data/encounters/caveEncounters';
import { RUINS_ENCOUNTERS } from '../data/encounters/ruinsEncounters';
import { createLogger } from '../utils/logger';

const logger = createLogger('site-populator');

// Same LCG the map generators use, so population is reproducible per (site, seed).
function seededRandom(seed) {
  let state = Number.isFinite(seed) ? seed : 42;
  return function () {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}

// Combat (immediate-tier) encounters available for each site type.
const combatPool = (type) => {
  const table = type === 'ruins' ? RUINS_ENCOUNTERS : CAVE_ENCOUNTERS;
  return Object.values(table).filter((e) => e.encounterTier === 'immediate');
};

// Themed loot item keys (catalog keys from inventorySystem). Kept modest; the hoard slot
// adds a chance at something rarer. Exported for questHints' derived "where do I find
// this item?" text (read-only consumer).
export const LOOT = {
  cave: ['cave_mushrooms', 'raw_gems', 'glowing_fungi', 'exposed_minerals', 'healing_potion', 'spider_silk'],
  ruins: ['ancient_scroll', 'salvaged_goods', 'history_tome', 'ritual_dagger', 'pearl', 'enchanted_trinket'],
  forest: ['healing_herbs', 'rare_flower', 'rare_herb', 'beast_hide', 'wolf_pelt', 'fairy_dust'],
  hills: ['mountain_herbs', 'exposed_minerals', 'wolf_fang', 'beast_hide', 'rare_ore', 'healing_herbs'],
  mountain: ['mountain_crystal', 'exposed_minerals', 'rare_ore', 'storm_crystal', 'bear_pelt'],
};
export const HOARD_BONUS = {
  cave: ['greater_healing_potion', 'magic_weapon', 'raw_gems'],
  // ring_protection (rare accessory): its ONLY acquisition path — a deep-vault prize
  // fits ruins (ancient enchanted wares) and hoards are one slot per site, so it stays
  // suitably scarce. Rare is within the Tier 1 rarity cap, so no tier gate needed.
  ruins: ['dark_tome', 'magic_item', 'ancient_scroll', 'ring_protection'],
  // Beast country: Hide Armor is a wilderness-only sidegrade to shop-bought Studded Leather.
  forest: ['hide_armor', 'nature_charm', 'fey_charm'],
  hills: ['hide_armor', 'silver_dagger', 'mountain_crystal'],
  mountain: ['storm_crystal', 'mountain_crystal', 'silver_dagger'],
};

// Harvestable crystal deposits (issue #38): the 💎 tiles the generator scatters are no
// longer mere decoration — a few become loot nodes the party can walk onto and harvest.
// Type-appropriate, tier-safe items (uncommon/rare, no very_rare): caves yield raw gems;
// mountains yield mountain crystal, with a rarer chance of a storm crystal. Weighted by
// repetition in the pool.
const CRYSTAL_LOOT = {
  cave: ['raw_gems'],
  mountain: ['mountain_crystal', 'mountain_crystal', 'mountain_crystal', 'storm_crystal'],
};

const clone = (obj) => JSON.parse(JSON.stringify(obj));

// Turn 1-3 of a site's scattered crystal decorations into harvestable deposits:
// tile.content = { kind:'loot', display:'crystal', ... } so the existing walk-onto-loot
// flow grants the items, while `display` tells the renderer to draw the 💎 instead of 💰.
// Every OTHER decorative crystal is demoted to plain floor, so on newly populated sites a
// crystal you can SEE is always a crystal you can HARVEST (no more unpickable teasers).
// Cave/mountain sites only; runs once per site under the same `populated` guard.
function placeCrystalDeposits(site, rng) {
  const lootPool = CRYSTAL_LOOT[site.type];
  if (!lootPool || !Array.isArray(site.mapData)) return 0;

  // Row-major sweep keeps candidate order (and thus placement) deterministic per seed.
  const crystalTiles = [];
  const plainFloors = [];
  site.mapData.forEach((row) => Array.isArray(row) && row.forEach((tile) => {
    if (!tile || !tile.walkable || tile.type === 'entrance' || tile.contentSlot || tile.content) return;
    if (tile.poi === 'crystal') crystalTiles.push(tile);
    else if (!tile.poi && tile.type === 'floor') plainFloors.push(tile);
  }));

  const target = 1 + Math.floor(rng() * 3); // 1-3 deposits per site
  const takeFrom = (pool) => pool.splice(Math.floor(rng() * pool.length), 1)[0];
  const deposits = [];
  // Prefer tiles where the generator already put crystals (organic placement); pad from
  // plain floor if the scatter pass happened to produce too few.
  while (deposits.length < target && crystalTiles.length > 0) deposits.push(takeFrom(crystalTiles));
  while (deposits.length < target && plainFloors.length > 0) deposits.push(takeFrom(plainFloors));

  deposits.forEach((tile) => {
    tile.poi = null; // the content overlay renders the 💎 (and dims it once harvested)
    const item = lootPool[Math.floor(rng() * lootPool.length)];
    tile.content = { kind: 'loot', display: 'crystal', loot: { gold: 0, items: [item] }, consumed: false };
  });
  // Leftover decorative crystals would tease the player — demote them to bare floor.
  crystalTiles.forEach((tile) => { tile.poi = null; });
  return deposits.length;
}

const rollLoot = (type, rng, hoard) => {
  const pool = LOOT[type] || LOOT.cave;
  const pick = () => pool[Math.floor(rng() * pool.length)];
  const items = [pick()];
  if (rng() < 0.5) items.push(pick());
  let gold = 8 + Math.floor(rng() * 24); // 8-31
  if (hoard) {
    gold = 40 + Math.floor(rng() * 60); // 40-99
    const bonus = (HOARD_BONUS[type] || HOARD_BONUS.cave);
    items.push(bonus[Math.floor(rng() * bonus.length)]);
  }
  return { gold, items: Array.from(new Set(items)) };
};

/**
 * Populate a site's content slots in place (idempotent — no-op if already populated).
 * @param {Object} site - the object from generateSiteMap (has mapData + contentSlots).
 * @param {number} seed - reproducible seed (pair with the site's generation seed).
 * @returns {Object} the same site, with tile.content set on each slot + site.populated.
 */
export function populateSite(site, seed) {
  if (!site || site.populated) return site;
  // Two SEPARATE pool keys (issue #49). Loot is themed per site type — forest/hills/
  // mountain have their own LOOT/HOARD_BONUS tables — but authored combat encounters
  // only exist for cave/ruins, so other site types legitimately borrow the cave mobs.
  // These used to be one coerced value ("everything non-ruins is a cave"), which
  // silently sent forest/hills/mountain sites to the CAVE loot tables: their own pools
  // never rolled, making pool-exclusive items (e.g. hide_armor) unobtainable and the
  // journal's derived source hints wrong. Going-forward-only fix: sites populated
  // before this change are cached with `populated: true` and keep their cave-themed
  // loot; never retro-mutate a cached site.
  const lootType = LOOT[site.type] ? site.type : 'cave';
  const combatType = site.type === 'ruins' ? 'ruins' : 'cave';
  const rng = seededRandom((Number.isFinite(seed) ? seed : 1) + 777);
  const slots = Array.isArray(site.contentSlots) ? site.contentSlots : [];

  if (slots.length > 0) {
    const pool = combatPool(combatType);
    const entry = site.entryPoint || { x: 0, y: 0 };
    const dist = (p) => Math.abs(p.x - entry.x) + Math.abs(p.y - entry.y);

    // The deepest slot (farthest from the entrance) is the reward hoard.
    let deepestIdx = 0;
    slots.forEach((p, i) => { if (dist(p) > dist(slots[deepestIdx])) deepestIdx = i; });

    const kinds = slots.map((_, i) => (i === deepestIdx ? 'loot' : (rng() < 0.6 ? 'encounter' : 'loot')));
    // Guarantee at least one encounter (mobs) when there's room for it.
    if (slots.length > 1 && !kinds.includes('encounter')) {
      kinds[(deepestIdx + 1) % kinds.length] = 'encounter';
    }

    slots.forEach((slot, i) => {
      const tile = site.mapData[slot.y] && site.mapData[slot.y][slot.x];
      if (!tile) return;
      if (kinds[i] === 'encounter' && pool.length > 0) {
        const enc = clone(pool[Math.floor(rng() * pool.length)]);
        tile.content = { kind: 'encounter', encounter: enc, consumed: false };
      } else {
        tile.content = { kind: 'loot', loot: rollLoot(lootType, rng, i === deepestIdx), consumed: false };
      }
    });
  }

  // After the slots, convert some scattered 💎 decorations into harvestable deposits
  // (cave/mountain sites only; no-op elsewhere). Runs AFTER the slot rolls so the slot
  // content for a given seed is unchanged from before this feature existed.
  const depositCount = placeCrystalDeposits(site, rng);

  site.populated = true;
  logger.info(`[SITE] Populated ${site.type} "${site.name}" (loot: ${lootType}, mobs: ${combatType}) with ${slots.length} content slots` +
    (depositCount ? ` + ${depositCount} crystal deposits` : ''));
  return site;
}

// Build a milestone-boss encounter for a site objective, based on the type's combat pool
// (so the encounter shape is valid) but flagged so completion fires on defeat.
function makeBossEncounter(objective, type) {
  const pool = combatPool(type);
  const base = pool.length ? clone(pool[Math.floor(pool.length / 2)]) : {
    icon: '👹',
    image: '/assets/encounters/cave_entrance.webp',
    suggestedActions: [{ label: 'Attack', skill: 'Athletics', description: 'Strike the foe down' }],
    consequences: { criticalSuccess: '', success: '', failure: '', criticalFailure: '' },
  };
  return {
    ...base,
    name: objective.name,
    enemyId: objective.id,           // -> enemy_defeated event on victory completes the milestone
    isMilestoneBoss: true,
    encounterTier: 'immediate',
    poiType: type,
    difficulty: 'hard',
    multiRound: true,
    description: objective.description || `${objective.name} stands between you and your goal.`,
    rewards: { xp: 150, gold: '4d12', items: (base.rewards && base.rewards.items) || [] },
  };
}

/**
 * Place a campaign milestone objective into a site, on the deepest room (the climax),
 * overriding whatever populateSite put there. Mirrors injectQuestBuildings for towns.
 * @param {Object} site - a generated (ideally populated) site.
 * @param {Object} objective - { objectiveType:'item'|'combat'|'location', id, name,
 *   milestoneId, description? }. `id` is the milestone trigger id (itemId/enemyId/locationId).
 * @returns {Object} the same site with the objective tile set + site.objective recorded.
 */
export function injectSiteObjective(site, objective) {
  if (!site || !objective || !Array.isArray(site.contentSlots) || site.contentSlots.length === 0) return site;
  const type = site.type === 'ruins' ? 'ruins' : 'cave';
  const entry = site.entryPoint || { x: 0, y: 0 };
  const dist = (p) => Math.abs(p.x - entry.x) + Math.abs(p.y - entry.y);
  const slot = site.contentSlots.reduce((a, b) => (dist(b) > dist(a) ? b : a));
  const tile = site.mapData[slot.y] && site.mapData[slot.y][slot.x];
  if (!tile) return site;

  const objectiveType = objective.objectiveType;
  const common = { kind: 'objective', objectiveType, milestoneId: objective.milestoneId, consumed: false };
  if (objectiveType === 'combat') {
    tile.content = { ...common, encounter: makeBossEncounter(objective, type) };
  } else if (objectiveType === 'item') {
    tile.content = { ...common, item: { id: objective.id, name: objective.name } };
  } else { // 'location' — reaching this room completes the milestone
    tile.content = { ...common, locationId: objective.id, name: objective.name };
  }
  site.objective = { x: slot.x, y: slot.y, ...objective };
  logger.info(`[SITE] Injected ${objectiveType} objective "${objective.name}" into "${site.name}"`);
  return site;
}

export default populateSite;
