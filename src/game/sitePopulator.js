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
// Besides the reserved slots, populateSite also turns some of the generator's scattered
// decorations into harvestable resource nodes (HARVEST_NODES below): loot content with
// a `display` key so the renderer draws the resource itself. Leftover decorations of any
// harvestable kind are stripped (issue #38: never show a crystal, mushroom or urn the
// player can't pick up).

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

// Difficulty tiers a NON-QUEST random wilderness combat may use, by party level
// (#combat-tuning). Low parties meet easy/medium foes, mid parties medium/hard;
// `deadly` is reserved for authored quest/milestone bosses and is NEVER randomly
// selected. When level is unknown (legacy callers / tests) the filter is skipped and
// the full immediate pool is used, so sites cached before this feature are unaffected
// and old behavior is preserved. This only decides SELECTION; authored/quest
// difficulty (makeBossEncounter's forced hard, milestone bosses) is untouched.
export const difficultyBandForLevel = (level) => {
  if (!Number.isFinite(level)) return null;
  const L = Math.max(1, Math.floor(level));
  if (L <= 2) return ['easy', 'medium'];
  if (L <= 4) return ['medium', 'hard'];
  return ['hard'];
};

// Pick one random combat encounter matched to the party level. Consumes exactly one
// rng() draw (as the old uniform pick did), so the downstream deterministic stream
// (harvest nodes) is unshifted for a given seed. Falls back to the full pool if the
// band yields nothing (or level is unknown).
const pickCombatEncounter = (pool, rng, partyLevel) => {
  const band = difficultyBandForLevel(partyLevel);
  const eligible = band ? pool.filter((e) => band.includes(e.difficulty)) : pool;
  const from = eligible.length > 0 ? eligible : pool;
  return from[Math.floor(rng() * from.length)];
};

// Themed loot item keys (catalog keys from inventorySystem). Kept modest; the hoard slot
// adds a chance at something rarer. Exported for questHints' derived "where do I find
// this item?" text (read-only consumer).
export const LOOT = {
  cave: ['cave_mushrooms', 'raw_gems', 'glowing_fungi', 'exposed_minerals', 'healing_potion', 'spider_silk'],
  ruins: ['ancient_scroll', 'salvaged_goods', 'history_tome', 'ritual_dagger', 'pearl', 'enchanted_trinket'],
  forest: ['healing_herbs', 'rare_flower', 'rare_herb', 'beast_hide', 'wolf_pelt', 'fairy_dust', 'pine_resin'],
  hills: ['mountain_herbs', 'exposed_minerals', 'wolf_fang', 'beast_hide', 'rare_ore', 'healing_herbs'],
  mountain: ['mountain_crystal', 'exposed_minerals', 'rare_ore', 'storm_crystal', 'bear_pelt'],
};
// NOTE (#44/#49): site loot is granted UNGATED (Game.js grantSiteLoot skips
// filterDropsByTier), so hoard pools must stay at rarity <= rare. very_rare items
// (runic_greatsword, stormbound_ring) are placed via encounter drop tables instead,
// which DO pass the rarity-per-tier gate.
export const HOARD_BONUS = {
  cave: ['greater_healing_potion', 'magic_weapon', 'raw_gems'],
  // ring_protection (rare accessory): its ONLY acquisition path — a deep-vault prize
  // fits ruins (ancient enchanted wares) and hoards are one slot per site, so it stays
  // suitably scarce. Rare is within the Tier 1 rarity cap, so no tier gate needed.
  // artifact_trinket (#44): previously catalog-only (lint finding); an ancient trinket
  // belongs in ruin vaults.
  ruins: ['dark_tome', 'magic_item', 'ancient_scroll', 'ring_protection', 'artifact_trinket'],
  // Beast country: Hide Armor is a wilderness-only sidegrade to shop-bought Studded
  // Leather; the Hunter's Longbow (#44) is the ranger-flavored weapon prize.
  forest: ['hide_armor', 'nature_charm', 'fey_charm', 'hunters_longbow'],
  hills: ['hide_armor', 'silver_dagger', 'mountain_crystal'],
  // wardstone_pendant (#44): rare +1 charm cut from mountain stone — deep-hoard prize.
  mountain: ['storm_crystal', 'mountain_crystal', 'silver_dagger', 'wardstone_pendant'],
};

// Harvestable resource nodes (issue #38 + playtest 2026-07-04): decorations the generator
// scatters become loot nodes the party can walk onto and harvest. Each spec converts up to
// count[] tiles whose poi matches `fromPoi` (padding from plain floor when the scatter pass
// produced too few) into tile.content = { kind:'loot', display, ... }: the existing
// walk-onto-loot flow grants the item while `display` (a SITE_POI key) tells the renderer
// to draw the resource instead of 💰. Items are type-appropriate, tier-safe keys that also
// appear in the LOOT tables, so questHints' derived source text stays accurate. Counts for
// cave mushrooms/fungi/gems/ore are >= 3 so a single cave can complete a gather-3 quest.
// Ruins get searchable urns + relic caches under the overgrowth so they are no longer
// pickup-free. Forests grow tappable resin trees (water towns Phase 6: the boatwright's
// gather-3 pine_resin quest completes in a single forest, same guarantee as the cave
// counts); scattered lone trees not converted are demoted like any harvestable kind,
// while the forest's tree THICKETS are structural (wall tiles) and untouched. Hills
// keep decorative-only flora for now (no gather quest needs them).
export const HARVEST_NODES = {
  cave: [
    { fromPoi: 'crystal', display: 'crystal', pool: ['raw_gems'], count: [3, 4] },
    { fromPoi: 'mushroom', display: 'mushroom', pool: ['cave_mushrooms'], count: [3, 4] },
    { fromPoi: 'mushroom', display: 'mushroom', pool: ['glowing_fungi'], count: [3, 4] },
    { fromPoi: 'ore', display: 'ore', pool: ['exposed_minerals'], count: [3, 4] },
  ],
  mountain: [
    { fromPoi: 'crystal', display: 'crystal', pool: ['mountain_crystal', 'mountain_crystal', 'storm_crystal'], count: [3, 4] },
    { fromPoi: 'ore', display: 'ore', pool: ['exposed_minerals', 'rare_ore'], count: [2, 3] },
  ],
  ruins: [
    { fromPoi: 'urn', display: 'urn', pool: ['pearl', 'salvaged_goods', 'salvaged_goods', 'ancient_scroll'], count: [2, 3] },
    { fromPoi: 'overgrowth', display: 'overgrowth', pool: ['history_tome', 'enchanted_trinket', 'salvaged_goods'], count: [2, 3] },
  ],
  forest: [
    { fromPoi: 'tree', display: 'tree', pool: ['pine_resin'], count: [3, 4] },
  ],
};

const clone = (obj) => JSON.parse(JSON.stringify(obj));

// Convert scattered decorations into harvestable nodes per HARVEST_NODES. Every leftover
// decoration of a harvestable kind is demoted to bare floor, so on newly populated sites a
// resource you can SEE is always a resource you can HARVEST (no unpickable teasers).
// Runs once per site under the same `populated` guard; sites cached before a node kind
// existed keep their decorative-only tiles (never retro-mutated).
function placeHarvestNodes(site, rng) {
  const specs = HARVEST_NODES[site.type];
  if (!specs || !Array.isArray(site.mapData)) return 0;

  // Row-major sweep keeps candidate order (and thus placement) deterministic per seed.
  const byPoi = {};
  const plainFloors = [];
  const plainGrounds = []; // open-air padding reserve (forest 'ground'), drawn only after floors
  site.mapData.forEach((row) => Array.isArray(row) && row.forEach((tile) => {
    if (!tile || !tile.walkable || tile.type === 'entrance' || tile.contentSlot || tile.content) return;
    if (tile.poi) (byPoi[tile.poi] = byPoi[tile.poi] || []).push(tile);
    else if (tile.type === 'floor') plainFloors.push(tile);
    else if (tile.type === 'ground') plainGrounds.push(tile);
  }));

  const takeFrom = (pool) => pool.splice(Math.floor(rng() * pool.length), 1)[0];
  let placed = 0;
  specs.forEach((spec) => {
    const candidates = byPoi[spec.fromPoi] || [];
    const target = spec.count[0] + Math.floor(rng() * (spec.count[1] - spec.count[0] + 1));
    const nodes = [];
    // Prefer tiles where the generator already put the matching decoration (organic
    // placement); pad from plain floor if the scatter pass happened to produce too few,
    // then from open ground (forest sites are open-air: scattered lone trees can run
    // short and their padding reserve IS the ground). Floors-first keeps cave/mountain/
    // ruins placement identical to before the ground reserve existed.
    while (nodes.length < target && candidates.length > 0) nodes.push(takeFrom(candidates));
    while (nodes.length < target && plainFloors.length > 0) nodes.push(takeFrom(plainFloors));
    while (nodes.length < target && plainGrounds.length > 0) nodes.push(takeFrom(plainGrounds));

    nodes.forEach((tile) => {
      tile.poi = null; // the content overlay renders the node (and dims it once harvested)
      const item = spec.pool[Math.floor(rng() * spec.pool.length)];
      tile.content = { kind: 'loot', display: spec.display, loot: { gold: 0, items: [item] }, consumed: false };
    });
    placed += nodes.length;
  });
  // Leftover decorations of a harvestable kind would tease the player: demote to floor.
  specs.forEach((spec) => (byPoi[spec.fromPoi] || []).forEach((tile) => { tile.poi = null; }));
  return placed;
}

// Collect walkable tiles free for content placement, in row-major order (deterministic).
// Mirrors placeHarvestNodes' plain-tile filter EXACTLY: walkable, not the entrance, no
// reserved contentSlot, no existing content, and no leftover decoration poi (so we never
// overwrite a decorative tile). Floors are preferred; open ground (forest sites) is the
// padding reserve, drawn only after floors.
function collectFreeTiles(site) {
  const floors = [];
  const grounds = [];
  (site.mapData || []).forEach((row) => Array.isArray(row) && row.forEach((tile) => {
    if (!tile || !tile.walkable || tile.type === 'entrance' || tile.contentSlot || tile.content || tile.poi) return;
    if (tile.type === 'floor') floors.push(tile);
    else if (tile.type === 'ground') grounds.push(tile);
  }));
  return { floors, grounds };
}

// Map a gather item id to an existing HARVEST_NODES `display` key so the renderer needs no
// new art (each key already draws a resource node). spider_silk (from alchemist_reagents) is
// not a HARVEST_NODES item, so it borrows the 'mushroom' node (a cave-floor organic node
// reads fine for silk); any other unmapped gather id falls back to 'ore', a plain floor node
// that always renders.
const RESOURCE_DISPLAY = {
  exposed_minerals: 'ore',
  rare_ore: 'ore',
  raw_gems: 'crystal',
  cave_mushrooms: 'mushroom',
  glowing_fungi: 'mushroom',
  pine_resin: 'tree',
  storm_crystal: 'crystal',
  mountain_crystal: 'crystal',
  spider_silk: 'mushroom',
};
export const resourceDisplayFor = (itemId) => RESOURCE_DISPLAY[itemId] || 'ore';

/**
 * Re-supply a gather quest's harvest resource onto an already-generated (cached) site,
 * ADDITIVELY and IDEMPOTENTLY. Gather steps source their item from the ORIGINAL harvest
 * nodes placeHarvestNodes placed once; those are consumed on pickup and never regenerate, so
 * a player who looted the site BEFORE taking the quest would find it stranded. For each
 * { itemId, needed } this counts the site's un-consumed loot nodes already carrying itemId
 * and tops up only the SHORTFALL (remaining = needed - have), converting that many free floor
 * tiles (same selection placeHarvestNodes uses) into fresh harvest nodes. It NEVER regenerates
 * the site, never touches consumed flags or the `populated` guard, and never removes anything.
 *
 * Idempotent across entries: the topped-up nodes are un-consumed and carry itemId, so they
 * count against `remaining` next time and re-running injects nothing more. Fresh sites inject
 * nothing (their original nodes already cover `needed`, so remaining <= 0). It reads the LIVE
 * shortfall passed in, so once the quest is satisfied at one site, another site of the same
 * type injects fewer/none. Callable like injectSiteObjective.
 *
 * @param {Object} site - a generated site (ideally populated); its cached grid is mutated in place.
 * @param {Array<{ itemId: string, needed: number }>|Object} resources - per getActiveGatherResources.
 * @returns {Object} the same site.
 */
export function injectHarvestResource(site, resources) {
  const list = (Array.isArray(resources) ? resources : [resources]).filter(Boolean);
  if (!site || list.length === 0 || !Array.isArray(site.mapData)) return site;

  // Free tiles shared across every item so we never place two nodes on one tile; floors
  // first, then open ground, row-major (deterministic; no rng needed for a top-up).
  const free = collectFreeTiles(site);
  const takeFree = () => free.floors.shift() || free.grounds.shift() || null;

  list.forEach(({ itemId, needed }) => {
    if (!itemId || !(needed > 0)) return;
    // Count existing UN-consumed loot nodes already supplying this item (idempotence key).
    let have = 0;
    site.mapData.forEach((row) => Array.isArray(row) && row.forEach((tile) => {
      const c = tile && tile.content;
      if (c && c.kind === 'loot' && !c.consumed && Array.isArray(c.loot && c.loot.items) && c.loot.items.includes(itemId)) have += 1;
    }));
    let remaining = needed - have;
    if (remaining <= 0) return;
    const display = resourceDisplayFor(itemId);
    let placed = 0;
    while (remaining > 0) {
      const tile = takeFree();
      if (!tile) {
        logger.warn(`[SITE] No free tile in "${site.name}" to inject gather resource "${itemId}" (${remaining} still short); a later visit tries again`);
        break;
      }
      tile.poi = null; // the content overlay renders the node
      tile.content = { kind: 'loot', display, loot: { gold: 0, items: [itemId] }, consumed: false };
      remaining -= 1;
      placed += 1;
    }
    if (placed > 0) logger.info(`[SITE] Injected ${placed} "${itemId}" harvest node(s) into "${site.name}" for a gather quest`);
  });
  return site;
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
 * @param {number} [partyLevel] - the party's effective level at first entry, used to
 *   level-match the NON-QUEST random combat slots (#combat-tuning). Baked into the
 *   cached site once (never re-derived), so it stays backwards-compatible with the
 *   map-persistence rules. Omit (legacy callers / tests) to keep the old full-pool pick.
 * @returns {Object} the same site, with tile.content set on each slot + site.populated.
 */
export function populateSite(site, seed, partyLevel) {
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
        const enc = clone(pickCombatEncounter(pool, rng, partyLevel));
        tile.content = { kind: 'encounter', encounter: enc, consumed: false };
      } else {
        tile.content = { kind: 'loot', loot: rollLoot(lootType, rng, i === deepestIdx), consumed: false };
      }
    });
  }

  // After the slots, convert some scattered decorations into harvestable nodes
  // (cave/mountain/ruins; no-op elsewhere). Runs AFTER the slot rolls so the slot
  // content for a given seed is unchanged from before this feature existed.
  const nodeCount = placeHarvestNodes(site, rng);

  site.populated = true;
  logger.info(`[SITE] Populated ${site.type} "${site.name}" (loot: ${lootType}, mobs: ${combatType}) with ${slots.length} content slots` +
    (nodeCount ? ` + ${nodeCount} harvest nodes` : ''));
  return site;
}

// Build a milestone-boss encounter for a site objective, based on the type's combat pool
// (so the encounter shape is valid) but flagged so completion fires on defeat.
function makeBossEncounter(objective, type) {
  const pool = combatPool(type);
  // Borrow the SHAPE of a HARD-tier encounter (the classic boss shell). Filtering to
  // 'hard' keeps this base identical to before the level-matched easy/medium fillers
  // were added, so those never become a quest-boss base. Any `dc` override on the
  // borrowed encounter is stripped so the forced difficulty:'hard' (DC 20) is what
  // resolves, so quest-boss difficulty is unchanged (#combat-tuning).
  const hardPool = pool.filter((e) => e.difficulty === 'hard');
  const basePool = hardPool.length ? hardPool : pool;
  const base = basePool.length ? clone(basePool[Math.floor(basePool.length / 2)]) : {
    icon: '👹',
    image: '/assets/encounters/cave_entrance.webp',
    suggestedActions: [{ label: 'Attack', skill: 'Athletics', description: 'Strike the foe down' }],
    consequences: { criticalSuccess: '', success: '', failure: '', criticalFailure: '' },
  };
  delete base.dc; // never inherit a random-pool dc override; the forced hard label sets DC 20
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
 * Place quest objectives into a site, deepest rooms first (the climax), overriding
 * whatever populateSite put there. Mirrors injectQuestBuildings for towns. Accepts one
 * objective or a list (playtest 2026-07-04: several active quests can target the same
 * site type, so each gets its OWN slot instead of first-quest-wins).
 *
 * Idempotent per milestoneId: an objective already present on any tile is skipped, so
 * re-running on every site entry (fresh or cached) is safe and fixes "accepted the quest
 * after first visiting the site". When the claimed slot held unconsumed loot (e.g. the
 * hoard on the deepest slot), that loot is CARRIED on the objective content (`loot`)
 * and still pays out on arrival for item/location objectives (Game.js grants it).
 *
 * @param {Object} site - a generated (ideally populated) site.
 * @param {Object|Array} objectiveOrList - { objectiveType:'item'|'combat'|'location', id,
 *   name, milestoneId, description? } or an array of them. `id` is the milestone trigger
 *   id (itemId/enemyId/locationId).
 * @returns {Object} the same site with objective tiles set + site.objectives recorded.
 */
export function injectSiteObjective(site, objectiveOrList) {
  const objectives = (Array.isArray(objectiveOrList) ? objectiveOrList : [objectiveOrList]).filter(Boolean);
  if (!site || objectives.length === 0 || !Array.isArray(site.contentSlots) || site.contentSlots.length === 0) return site;
  const type = site.type === 'ruins' ? 'ruins' : 'cave';
  const entry = site.entryPoint || { x: 0, y: 0 };
  const dist = (p) => Math.abs(p.x - entry.x) + Math.abs(p.y - entry.y);
  const tileAt = (p) => site.mapData[p.y] && site.mapData[p.y][p.x];

  // Idempotence reads the TILES, not bookkeeping fields, so sites cached before
  // site.objectives existed (old saves carry only site.objective) are handled too.
  const placedIds = new Set();
  site.mapData.forEach((row) => Array.isArray(row) && row.forEach((t) => {
    if (t && t.content && t.content.kind === 'objective' && t.content.milestoneId != null) {
      placedIds.add(t.content.milestoneId);
    }
  }));

  // Deepest open slots first; slots already claimed by an objective stay claimed.
  const openSlots = site.contentSlots
    .slice()
    .sort((a, b) => dist(b) - dist(a))
    .filter((p) => { const t = tileAt(p); return t && !(t.content && t.content.kind === 'objective'); });

  // When slots run short, hard dependencies win: an item/combat objective can only ever
  // complete on its slot, while a location objective is the softest to drop.
  const PRIORITY = { item: 0, combat: 1, location: 2 };
  const pending = objectives
    .filter((o) => o && o.milestoneId != null && !placedIds.has(o.milestoneId))
    .sort((a, b) => (PRIORITY[a.objectiveType] ?? 3) - (PRIORITY[b.objectiveType] ?? 3));

  pending.forEach((objective) => {
    const slot = openSlots.shift();
    if (!slot) {
      logger.warn(`[SITE] No free content slot in "${site.name}" for objective "${objective.name}" (${objective.milestoneId}); it will inject on a later visit once a slot frees up`);
      return;
    }
    const tile = tileAt(slot);
    // Carry unclaimed loot under the objective so the hoard isn't deleted (R1).
    const carriedLoot = tile.content && tile.content.kind === 'loot' && !tile.content.consumed
      ? tile.content.loot : null;
    const objectiveType = objective.objectiveType;
    const common = {
      kind: 'objective', objectiveType, milestoneId: objective.milestoneId, consumed: false,
      ...(carriedLoot ? { loot: carriedLoot } : {}),
    };
    if (objectiveType === 'combat') {
      tile.content = { ...common, encounter: makeBossEncounter(objective, type) };
    } else if (objectiveType === 'item') {
      tile.content = { ...common, item: { id: objective.id, name: objective.name } };
    } else { // 'location': reaching this room completes the milestone
      tile.content = { ...common, locationId: objective.id, name: objective.name };
    }
    const record = { x: slot.x, y: slot.y, ...objective };
    site.objectives = [...(site.objectives || []), record];
    site.objective = site.objective || record; // legacy single-objective field (older readers)
    logger.info(`[SITE] Injected ${objectiveType} objective "${objective.name}" into "${site.name}" at (${slot.x},${slot.y})`);
  });
  return site;
}

export default populateSite;
