// Suggested actions (#91, docs/SUGGESTED_ACTIONS_PLAN.md): the engine-derived chips shown
// above the input in the #84 workspace. Pure, no React. Every chip points only at places
// the player has already been told about (an active milestone, a revealed POI, a taken
// side quest), so the chips can never spoil hidden content or suggest something the
// engine would refuse.
//
// Chip shape: { id, label, kind, target }
//   kind 'look'   - run Look around (a narrative hook is waiting)
//   kind 'search' / 'gather' / 'fight' - the milestone action on the world tile the party
//                   stands on (same resolvers as the POI arrival modal)
//   kind 'enterSite' - explore the cave / ruins the party stands on
//   kind 'siteWalk'  - inside a site, walk to target {x, y} (an objective or a gather node)
//   kind 'siteMob'   - inside a site, engage the boss mob `mobId`
// Side-quest chips carry `side: true`; one slot is kept for them when any exist.
//   kind 'enter'  - enter the town the party stands on
//   kind 'leave'  - leave the town or site (the party stands at its exit)
//   kind 'travel' - auto-travel on the world map to target {x, y} (leaving town first)
//   kind 'walk'   - walk inside the current town to the building at target {x, y}, then open it

import { areRequirementsMet, getMilestoneBossForTile, getMilestoneLocationForTile, getMilestoneItemForTile } from './milestoneEngine';
import { getActiveSideQuests, getOfferAt, effectivePartyLevel, ACTIVE_QUEST_CAP, getActiveGatherResources, getRevealedSiteTypes } from './questEngine';
import { ITEM_CATALOG } from '../utils/inventorySystem';

export const MAX_SUGGESTIONS = 3;
export const HURT_FRACTION = 0.5;

const worldDistance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const townDistance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const eachTile = (grid, fn) => {
  (grid || []).forEach((row, y) => (row || []).forEach((tile, x) => { if (tile) fn(tile, x, y); }));
};

const nearestTile = (grid, from, matches, dist = worldDistance) => {
  let best = null;
  eachTile(grid, (tile, x, y) => {
    if (!matches(tile)) return;
    const d = from ? dist(from, { x, y }) : 0;
    if (!best || d < best.d) best = { x, y, tile, d };
  });
  return best;
};

const isTownTile = (tile) => tile?.poi === 'town' && !!tile.townName;
const sameName = (a, b) => !!a && !!b && String(a).toLowerCase() === String(b).toLowerCase();
const activeMilestones = (milestones) => {
  const ms = Array.isArray(milestones) ? milestones : [];
  return ms.filter((m) => m && !m.completed && areRequirementsMet(m, ms));
};

// The settlement a milestone happens in, if it names one (building > spawn > milestone).
const milestoneTownName = (m) => m.building?.location || (m.spawn?.type !== 'poi' ? m.spawn?.location : null) || m.location || null;

// The world tile a milestone sends the party to: its town, or the tile where the engine
// will fire it (a revealed POI, a wilderness boss or item). Null when it is not on the map.
const milestoneWorldTarget = (m, milestones, worldMap, from) => {
  // A POI step completes only on its own tile, even when `location` names a nearby town
  // (Rot-Heart: "the ruins of Ironhold" is the Ironhold Ruins POI, not Ironhold town).
  if (m.spawn?.type === 'poi') {
    const poi = nearestTile(worldMap, from, (t) => t.poi === m.spawn.id);
    if (poi) return { ...poi, name: m.spawn.name || poi.tile.poiName || 'the objective', isTown: false };
  }
  // The tile matchers need the full list (requirements and POI owners are looked up in
  // it), so match against everything and keep only hits that belong to this milestone.
  const findHit = () => nearestTile(worldMap, from, (t) =>
    (m.spawn?.type === 'poi' && t.poi === m.spawn.id) ||
    getMilestoneBossForTile(milestones, t)?.encounter?.milestoneId === m.id ||
    (!!t.milestoneEnemy && t.milestoneEnemy === m.trigger?.enemy) ||
    getMilestoneLocationForTile(milestones, t)?.milestoneId === m.id ||
    getMilestoneItemForTile(milestones, t)?.milestoneId === m.id);
  const fromHit = (hit) => {
    const name = (m.spawn?.type === 'poi' && m.spawn.name) || hit.tile.poiName || hit.tile.townName || hit.tile.mountainName || m.location || 'the objective';
    return { ...hit, name, isTown: isTownTile(hit.tile) };
  };
  // A boss or a wilderness item fires on whichever tile the engine resolves it, which may
  // be a POI rather than the town its `location` names (the Rot-Heart can be fought from
  // the Rot Tunnels as well as Rotfall). Aim for the nearest such tile.
  if (m.type === 'combat' || (m.type === 'item' && !m.building)) {
    const hit = findHit();
    if (hit) return fromHit(hit);
  }
  const town = milestoneTownName(m);
  const townTile = town && nearestTile(worldMap, from, (t) => isTownTile(t) && sameName(t.townName, town));
  if (townTile) return { ...townTile, name: townTile.tile.townName, isTown: true };
  const hit = findHit();
  return hit ? fromHit(hit) : null;
};

const buildingTiles = (townMap) => {
  const out = [];
  eachTile(townMap, (tile, x, y) => { if (tile.type === 'building') out.push({ x, y, tile }); });
  return out;
};

const nearestBuilding = (townMap, from, matches) => {
  let best = null;
  buildingTiles(townMap).forEach((b) => {
    if (!matches(b.tile, b)) return; // b carries the tile's x, y
    const d = from ? townDistance(from, b) : 0;
    if (!best || d < best.d) best = { ...b, d };
  });
  return best;
};

const isHurt = (party) => (party || []).some((h) =>
  Number.isFinite(h?.currentHP) && Number.isFinite(h?.maxHP) && h.maxHP > 0 && h.currentHP > 0 && h.currentHP / h.maxHP < HURT_FRACTION);

const SITE_LABEL = { cave: 'the cave', ruins: 'the ruins', forest: 'the forest', hills: 'the hills', mountain: 'the mountains' };
// Quest site types vs the world tile `poi` that draws them.
const SITE_POI = { cave: 'cave_entrance', ruins: 'ruins' };
const OPEN_SITES = new Set(['forest', 'hills', 'mountain']);
const siteTypeOfTile = (tile) => (tile?.poi === 'cave_entrance' ? 'cave' : tile?.poi === 'ruins' ? 'ruins'
  : OPEN_SITES.has(tile?.poi) ? tile.poi : null);

// Inside a site: the objectives still to do (quest bosses, item / room objectives) and the
// harvest nodes an active gather quest still needs, nearest first.
const siteChips = ({ siteMap, sitePosition, sideQuests }) => {
  const grid = siteMap?.mapData;
  if (!Array.isArray(grid) || !sitePosition) return [];
  const dist = (p) => townDistance(sitePosition, p);
  const chips = [];
  (siteMap.mobs || []).forEach((m) => {
    if (!m || !m.isBoss || m.defeated) return;
    chips.push({ id: `face:${m.id}`, label: `Face ${m.encounter?.name || 'the guardian'}`, kind: 'siteMob', mobId: m.id, target: { x: m.x, y: m.y }, d: dist(m) });
  });
  const needed = new Set(((getActiveGatherResources(sideQuests) || {})[siteMap.type] || [])
    .filter((r) => r.needed > 0).map((r) => r.itemId));
  const gatherBest = {};
  eachTile(grid, (tile, x, y) => {
    const c = tile.content;
    if (!c || c.consumed || (x === sitePosition.x && y === sitePosition.y)) return;
    if (c.kind === 'objective' && c.objectiveType !== 'combat') {
      const label = c.objectiveType === 'item' ? `Find ${c.item?.name || 'the objective'}` : `Reach ${c.name || 'the objective'}`;
      chips.push({ id: `obj:${x},${y}`, label, kind: 'siteWalk', target: { x, y }, d: dist({ x, y }) });
      return;
    }
    if (c.kind === 'loot') {
      (c.loot?.items || []).filter((id) => needed.has(id)).forEach((id) => {
        const d = dist({ x, y });
        if (!gatherBest[id] || d < gatherBest[id].d) {
          gatherBest[id] = { id: `gather:${id}`, label: `Gather ${ITEM_CATALOG[id]?.name || id.replace(/_/g, ' ')}`, kind: 'siteWalk', target: { x, y }, d, side: true };
        }
      });
    }
  });
  return [...chips, ...Object.values(gatherBest)]
    .sort((a, b) => a.d - b.d)
    .map(({ d, ...chip }) => chip);
};

// The level a main-quest step expects: its own minLevel, else (for a boss fight) the top
// of the campaign's level range. Advice only: the main quest is never blocked by it.
export const recommendedLevel = (m, levelRange) =>
  m.minLevel || (m.type === 'combat' && m.encounter && Array.isArray(levelRange) ? levelRange[1] : null) || null;

// Wild ground with full encounter odds: unexplored forest, hills or mountains.
const HUNT_POIS = { forest: 'the forest', hills: 'the hills', mountain: 'the mountains' };
const huntTarget = (worldMap, from) => nearestTile(worldMap, from, (t) =>
  !t.isExplored && !t.milestonePoi && t.biome !== 'water' && !!HUNT_POIS[t.poi]);

/**
 * @param {Object} s
 * @param {'world'|'town'|'site'} s.mapLevel
 * @param {Array} s.worldMap        world grid [y][x]
 * @param {{x,y}} s.playerPosition  world position
 * @param {Object} [s.townMap]      current town's mapData grid (inside a town)
 * @param {string} [s.townName]     current town (inside a town)
 * @param {{x,y}} [s.townPosition]  party position inside the town
 * @param {Array} s.milestones
 * @param {Array} s.sideQuests
 * @param {Array} s.party
 * @param {boolean} s.hookWaiting   a narrative hook is parked for Look around
 * @param {number[]} [s.levelRange] the campaign's [min, max] level (boss recommendations)
 * @param {boolean} [s.atTownExit] inside a town, standing on its exit (gate) tile
 * @param {Object} [s.townMapsCache] visited towns' maps by name (finds a hand-in building)
 * @param {string} [s.siteName]    current site (inside a cave / ruin / forest)
 * @param {boolean} [s.atSiteExit] inside a site, at its entrance (where leaving works)
 * @param {Object} [s.siteMap]     the current site (inside one)
 * @param {{x,y}} [s.sitePosition] party position inside the site
 * @returns {Array<{id,label,kind,target}>}
 */
export const getSuggestedActions = (s = {}) => {
  const { mapLevel = 'world', worldMap, playerPosition, townMap, townName, townPosition, milestones, sideQuests, party, hookWaiting, levelRange, atTownExit, siteName, atSiteExit, townMapsCache, siteMap, sitePosition } = s;
  const partyLevel = effectivePartyLevel(party);
  if (mapLevel === 'site') {
    const chips = [];
    if (atSiteExit) chips.push({ id: 'leave', label: `Leave ${siteName || 'this place'}`, kind: 'leave' });
    chips.push(...siteChips({ siteMap, sitePosition, sideQuests }));
    if (hookWaiting) chips.push({ id: 'look', label: 'Look around', kind: 'look' });
    return chips.slice(0, MAX_SUGGESTIONS);
  }
  if (!Array.isArray(worldMap) || !playerPosition) {
    return hookWaiting ? [{ id: 'look', label: 'Look around', kind: 'look' }] : [];
  }
  const inTown = mapLevel === 'town' && !!townName;
  const here = worldMap[playerPosition.y]?.[playerPosition.x];
  const out = [];
  const seen = new Set();
  const push = (chip) => {
    if (!chip || seen.has(chip.id)) return;
    seen.add(chip.id);
    out.push(chip);
  };
  const travelTo = (target, label, extra) => {
    if (!target) return;
    if (target.x === playerPosition.x && target.y === playerPosition.y) return;
    push({ id: `travel:${target.x},${target.y}`, label, kind: 'travel', target: { x: target.x, y: target.y }, ...extra });
  };
  const walkTo = (b, label, extra) => {
    if (!b) return;
    push({ id: `walk:${b.x},${b.y}`, label, kind: 'walk', target: { x: b.x, y: b.y }, ...extra });
  };
  const SIDE = { side: true };

  // On the exit tile, leaving is the obvious next step: offer it first.
  if (inTown && atTownExit) push({ id: 'leave', label: `Leave ${townName}`, kind: 'leave' });
  if (hookWaiting && !inTown) push({ id: 'look', label: 'Look around', kind: 'look' });
  // Standing on a milestone objective: offer its action first. Same priority as the POI
  // modal: a Search outranks a co-located boss (the boss may be gated behind it).
  if (!inTown && here) {
    const search = getMilestoneLocationForTile(milestones, here);
    const boss = search ? null : getMilestoneBossForTile(milestones, here);
    const gather = getMilestoneItemForTile(milestones, here);
    if (search) push({ id: 'search', label: `Search ${search.name}`, kind: 'search' });
    if (boss) push({ id: 'fight', label: `Confront ${boss.name}`, kind: 'fight' });
    if (gather) push({ id: 'gather', label: `Gather ${gather.name}`, kind: 'gather' });
  }
  if (!inTown && isTownTile(here)) push({ id: 'enter', label: `Enter ${here.townName}`, kind: 'enter' });
  // Standing on a revealed cave / ruins: explore it. A side quest needing it marks it side.
  const hereSite = !inTown && siteTypeOfTile(here);
  const sitesShown = sideQuests?.length ? getRevealedSiteTypes(sideQuests) : null; // null: no gating
  if (hereSite && (!sitesShown || sitesShown[hereSite])) {
    const wanted = getActiveSideQuests(sideQuests).some((q) => (q.milestones || []).some((st) =>
      !st.completed && (st.site?.type === hereSite || (st.sites || []).includes(hereSite))));
    // Open-air sites are everywhere, so only suggest entering one a quest needs.
    if (wanted || !OPEN_SITES.has(hereSite)) {
      push({ id: 'enterSite', label: `Explore ${SITE_LABEL[hereSite]}`, kind: 'enterSite', ...(wanted ? SIDE : {}) });
    }
  }

  // Campaign milestones first, nearest destination first.
  const active = activeMilestones(milestones);
  const plans = active
    .map((m) => ({ m, target: milestoneWorldTarget(m, milestones, worldMap, playerPosition) }))
    .filter((p) => p.target)
    .sort((a, b) => a.target.d - b.target.d);
  plans.forEach(({ m, target }) => {
    const atTarget = target.x === playerPosition.x && target.y === playerPosition.y;
    if (atTarget && inTown && target.isTown && m.building?.name) {
      const b = nearestBuilding(townMap, townPosition, (t) => sameName(t.buildingName, m.building.name));
      const label = m.spawn?.type === 'npc' && m.spawn.name ? `Talk to ${m.spawn.name}` : `Go to ${m.building.name}`;
      walkTo(b, label);
      return;
    }
    if (atTarget) return;
    // Under-levelled for this step: say so, and offer a way to catch up (#91 nudges).
    const rec = recommendedLevel(m, levelRange);
    const under = !!rec && partyLevel < rec;
    travelTo(target, under ? `Travel to ${target.name} (level ${rec} recommended)` : `Travel to ${target.name}`);
    if (under && !seen.has('hunt')) {
      const wild = huntTarget(worldMap, playerPosition);
      if (wild) {
        seen.add('hunt');
        out.push({ id: 'hunt', label: `Hunt in ${wild.tile.mountainName || HUNT_POIS[wild.tile.poi]}`, kind: 'travel', target: { x: wild.x, y: wild.y } });
      }
    }
  });

  // Side quests: hand-ins, then revealed sites.
  getActiveSideQuests(sideQuests).forEach((q) => {
    const steps = q.milestones || [];
    const ready = (st) => !st.completed && (st.requires || []).every((id) => steps.find((x) => x.id === id)?.completed);
    steps.filter((st) => st.trigger?.turnIn && ready(st)).forEach((st) => {
      const { building, location } = st.trigger.turnIn;
      const types = Array.isArray(building) ? building : [building];
      if (location && !(inTown && sameName(location, townName))) {
        const t = nearestTile(worldMap, playerPosition, (tile) => isTownTile(tile) && sameName(tile.townName, location));
        if (t) travelTo(t, `Return to ${t.tile.townName}`, SIDE);
        return;
      }
      if (inTown) {
        const b = nearestBuilding(townMap, townPosition, (tile) => types.includes(tile.buildingType));
        if (b) { walkTo(b, `Hand in at ${b.tile.buildingName || `the ${String(b.tile.buildingType).replace(/_/g, ' ')}`}`, SIDE); return; }
      }
      // Not anchored to a town (older saves): any town with the building takes it. Point at
      // the nearest visited town known to have one.
      if (!location) {
        const hasBuilding = (name) => {
          let found = false;
          eachTile(townMapsCache?.[name]?.mapData, (tile) => { if (types.includes(tile.buildingType)) found = true; });
          return found;
        };
        const t = nearestTile(worldMap, playerPosition, (tile) =>
          isTownTile(tile) && !(inTown && sameName(tile.townName, townName)) && hasBuilding(tile.townName));
        if (t) travelTo(t, `Return to ${t.tile.townName}`, SIDE);
      }
    });
    // Site objectives and gather steps sourced from sites: head for the nearest one.
    // Offered from inside town too, where quests are picked up.
    // (Cave tiles are drawn as poi 'cave_entrance', not 'cave'.)
    steps.filter((st) => !st.trigger?.turnIn && ready(st)).forEach((st) => {
      const types = st.site?.type ? [st.site.type] : (st.sites || []);
      types.forEach((type) => {
        const t = nearestTile(worldMap, playerPosition, (tile) => tile.poi === (SITE_POI[type] || type));
        if (t) travelTo(t, `Head for ${SITE_LABEL[type] || type}`, SIDE);
      });
    });
  });

  // Work on offer in this town: one building with a side quest the party can take, while
  // under the active-quest cap. Sends players into buildings they'd otherwise skip.
  if (inTown && getActiveSideQuests(sideQuests).length < ACTIVE_QUEST_CAP) {
    const offers = (t) => !!t.buildingType && getOfferAt(sideQuests, { buildingType: t.buildingType, townName, level: partyLevel }).length > 0;
    // Prefer a building no other chip already walks to: when the work is in the main
    // quest's building, that chip gets you there anyway and a second one would collapse.
    const offer = nearestBuilding(townMap, townPosition, (t, at) => offers(t) && !seen.has(`walk:${at.x},${at.y}`))
      || nearestBuilding(townMap, townPosition, offers);
    if (offer && !seen.has(`walk:${offer.x},${offer.y}`)) {
      walkTo(offer, `Ask for work at ${offer.tile.buildingName || `the ${String(offer.tile.buildingType).replace(/_/g, ' ')}`}`, SIDE);
    } else if (offer) {
      // Same building as an existing chip: say so on that chip instead.
      const chip = out.find((c) => c.id === `walk:${offer.x},${offer.y}`);
      if (chip && !/work on offer/.test(chip.label)) chip.label = `${chip.label} (work on offer)`;
    }
  }

  if (inTown && isHurt(party)) {
    const inn = nearestBuilding(townMap, townPosition, (t) => t.buildingType === 'inn' || t.buildingType === 'tavern');
    if (inn) walkTo(inn, `Rest at ${inn.tile.buildingName || 'the inn'}`);
  }

  // Keep one slot for side quests: campaign steps come first and would otherwise always
  // crowd them out of the three.
  const top = out.slice(0, MAX_SUGGESTIONS);
  const firstSide = out.find((c) => c.side);
  if (firstSide && !top.some((c) => c.side)) top[Math.min(top.length, MAX_SUGGESTIONS - 1)] = firstSide;
  return top;
};
