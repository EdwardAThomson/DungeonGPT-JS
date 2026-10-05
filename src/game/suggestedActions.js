// Suggested actions (#91, docs/SUGGESTED_ACTIONS_PLAN.md): the engine-derived chips shown
// above the input in the #84 workspace. Pure, no React. Every chip points only at places
// the player has already been told about (an active milestone, a revealed POI, a taken
// side quest), so the chips can never spoil hidden content or suggest something the
// engine would refuse.
//
// Chip shape: { id, label, kind, target }
//   kind 'look'   - run Look around (a narrative hook is waiting)
//   kind 'enter'  - enter the town the party stands on
//   kind 'travel' - auto-travel on the world map to target {x, y} (leaving town first)
//   kind 'walk'   - walk inside the current town to the building at target {x, y}, then open it

import { areRequirementsMet, getMilestoneBossForTile, getMilestoneLocationForTile, getMilestoneItemForTile } from './milestoneEngine';
import { getActiveSideQuests } from './questEngine';

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
  const town = milestoneTownName(m);
  const townTile = town && nearestTile(worldMap, from, (t) => isTownTile(t) && sameName(t.townName, town));
  if (townTile) return { ...townTile, name: townTile.tile.townName, isTown: true };
  // The tile matchers need the full list (requirements and POI owners are looked up in
  // it), so match against everything and keep only hits that belong to this milestone.
  const hit = nearestTile(worldMap, from, (t) =>
    (m.spawn?.type === 'poi' && t.poi === m.spawn.id) ||
    getMilestoneBossForTile(milestones, t)?.encounter?.milestoneId === m.id ||
    (!!t.milestoneEnemy && t.milestoneEnemy === m.trigger?.enemy) ||
    getMilestoneLocationForTile(milestones, t)?.milestoneId === m.id ||
    getMilestoneItemForTile(milestones, t)?.milestoneId === m.id);
  if (!hit) return null;
  const name = (m.spawn?.type === 'poi' && m.spawn.name) || hit.tile.poiName || hit.tile.mountainName || m.location || 'the objective';
  return { ...hit, name, isTown: false };
};

const buildingTiles = (townMap) => {
  const out = [];
  eachTile(townMap, (tile, x, y) => { if (tile.type === 'building') out.push({ x, y, tile }); });
  return out;
};

const nearestBuilding = (townMap, from, matches) => {
  let best = null;
  buildingTiles(townMap).forEach((b) => {
    if (!matches(b.tile)) return;
    const d = from ? townDistance(from, b) : 0;
    if (!best || d < best.d) best = { ...b, d };
  });
  return best;
};

const isHurt = (party) => (party || []).some((h) =>
  Number.isFinite(h?.currentHP) && Number.isFinite(h?.maxHP) && h.maxHP > 0 && h.currentHP > 0 && h.currentHP / h.maxHP < HURT_FRACTION);

const SITE_LABEL = { cave: 'the cave', ruins: 'the ruins' };

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
 * @returns {Array<{id,label,kind,target}>}
 */
export const getSuggestedActions = (s = {}) => {
  const { mapLevel = 'world', worldMap, playerPosition, townMap, townName, townPosition, milestones, sideQuests, party, hookWaiting } = s;
  if (mapLevel === 'site' || !Array.isArray(worldMap) || !playerPosition) {
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
  const travelTo = (target, label) => {
    if (!target) return;
    if (target.x === playerPosition.x && target.y === playerPosition.y) return;
    push({ id: `travel:${target.x},${target.y}`, label, kind: 'travel', target: { x: target.x, y: target.y } });
  };
  const walkTo = (b, label) => {
    if (!b) return;
    push({ id: `walk:${b.x},${b.y}`, label, kind: 'walk', target: { x: b.x, y: b.y } });
  };

  if (hookWaiting && !inTown) push({ id: 'look', label: 'Look around', kind: 'look' });
  if (!inTown && isTownTile(here)) push({ id: 'enter', label: `Enter ${here.townName}`, kind: 'enter' });

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
    if (!atTarget) travelTo(target, `Travel to ${target.name}`);
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
        if (t) travelTo(t, `Return to ${t.tile.townName}`);
        return;
      }
      if (inTown) {
        const b = nearestBuilding(townMap, townPosition, (tile) => types.includes(tile.buildingType));
        if (b) walkTo(b, `Hand in at ${b.tile.buildingName || `the ${String(b.tile.buildingType).replace(/_/g, ' ')}`}`);
      }
    });
    if (inTown) return;
    steps.filter((st) => st.site?.type && !st.trigger?.turnIn && ready(st)).forEach((st) => {
      const t = nearestTile(worldMap, playerPosition, (tile) => tile.poi === st.site.type);
      if (t) travelTo(t, `Head for ${SITE_LABEL[st.site.type] || st.site.type}`);
    });
  });

  if (inTown && isHurt(party)) {
    const inn = nearestBuilding(townMap, townPosition, (t) => t.buildingType === 'inn' || t.buildingType === 'tavern');
    if (inn) walkTo(inn, `Rest at ${inn.tile.buildingName || 'the inn'}`);
  }

  return out.slice(0, MAX_SUGGESTIONS);
};
