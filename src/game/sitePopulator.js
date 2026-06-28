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
// adds a chance at something rarer.
const LOOT = {
  cave: ['cave_mushrooms', 'raw_gems', 'glowing_fungi', 'exposed_minerals', 'healing_potion', 'spider_silk'],
  ruins: ['ancient_scroll', 'salvaged_goods', 'history_tome', 'ritual_dagger', 'pearl', 'enchanted_trinket'],
};
const HOARD_BONUS = {
  cave: ['greater_healing_potion', 'magic_weapon', 'raw_gems'],
  ruins: ['dark_tome', 'magic_item', 'ancient_scroll'],
};

const clone = (obj) => JSON.parse(JSON.stringify(obj));

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
  if (!site || site.populated || !Array.isArray(site.contentSlots) || site.contentSlots.length === 0) {
    if (site && !site.populated) site.populated = true;
    return site;
  }
  const type = site.type === 'ruins' ? 'ruins' : 'cave';
  const rng = seededRandom((Number.isFinite(seed) ? seed : 1) + 777);
  const pool = combatPool(type);
  const entry = site.entryPoint || { x: 0, y: 0 };
  const dist = (p) => Math.abs(p.x - entry.x) + Math.abs(p.y - entry.y);

  // The deepest slot (farthest from the entrance) is the reward hoard.
  let deepestIdx = 0;
  site.contentSlots.forEach((p, i) => { if (dist(p) > dist(site.contentSlots[deepestIdx])) deepestIdx = i; });

  const kinds = site.contentSlots.map((_, i) => (i === deepestIdx ? 'loot' : (rng() < 0.6 ? 'encounter' : 'loot')));
  // Guarantee at least one encounter (mobs) when there's room for it.
  if (site.contentSlots.length > 1 && !kinds.includes('encounter')) {
    kinds[(deepestIdx + 1) % kinds.length] = 'encounter';
  }

  site.contentSlots.forEach((slot, i) => {
    const tile = site.mapData[slot.y] && site.mapData[slot.y][slot.x];
    if (!tile) return;
    if (kinds[i] === 'encounter' && pool.length > 0) {
      const enc = clone(pool[Math.floor(rng() * pool.length)]);
      tile.content = { kind: 'encounter', encounter: enc, consumed: false };
    } else {
      tile.content = { kind: 'loot', loot: rollLoot(type, rng, i === deepestIdx), consumed: false };
    }
  });

  site.populated = true;
  logger.info(`[SITE] Populated ${type} "${site.name}" with ${site.contentSlots.length} content slots`);
  return site;
}

export default populateSite;
