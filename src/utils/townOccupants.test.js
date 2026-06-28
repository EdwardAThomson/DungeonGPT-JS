import { generateTownMap } from './townMapGenerator';
import { populateTown } from './npcGenerator';

// Every service building (anything that isn't a house) should have at least one occupant
// with a job, so no shop/mill/tower/etc. is left empty. Houses are filled by the separate
// family step and aren't required to all be occupied here.
const SERVICE_TYPES = new Set([
  'inn', 'tavern', 'shop', 'market', 'temple', 'shrine', 'blacksmith', 'guild', 'archives',
  'library', 'alchemist', 'apothecary', 'foundry', 'warehouse', 'bank', 'mill', 'tailor',
  'fletcher', 'stables', 'harbormaster', 'magetower', 'jail', 'townhall',
]);

const occupy = (size, seed, water = null) => {
  const town = generateTownMap(size, `${size}-${seed}`, 'south', seed, false, 'NORTH_SOUTH', 'grassland', water);
  const npcs = populateTown(town, seed);
  // map "x,y" -> count of NPCs working there
  const byWorkplace = new Map();
  npcs.forEach((n) => {
    const k = `${n.location.x},${n.location.y}`;
    byWorkplace.set(k, (byWorkplace.get(k) || 0) + 1);
  });
  return { town, npcs, byWorkplace };
};

describe('town occupants for service buildings', () => {
  test('every service building has at least one occupant with a job', () => {
    ['village', 'town', 'city'].forEach((size) => {
      for (let seed = 1; seed <= 12; seed++) {
        const { town, byWorkplace } = occupy(size, seed);
        town.mapData.flat().forEach((tile) => {
          if (tile.type === 'building' && SERVICE_TYPES.has(tile.buildingType)) {
            expect(byWorkplace.get(`${tile.x},${tile.y}`) || 0).toBeGreaterThan(0);
          }
        });
      }
    });
  });

  test('the new building types get sensibly-titled occupants', () => {
    // aggregate across all sizes (+ a coast for harbormaster) so every new type appears
    const water = { kind: 'coast', edges: { N: false, E: false, S: true, W: false } };
    const seen = {};
    ['hamlet', 'village', 'town', 'city'].forEach((size) => {
      for (let seed = 1; seed <= 30; seed++) {
        const { town, npcs } = occupy(size, seed, water);
        const typeAt = (x, y) => town.mapData[y][x].buildingType;
        npcs.forEach((n) => {
          const bt = typeAt(n.location.x, n.location.y);
          if (bt) (seen[bt] = seen[bt] || []).push(n.title);
        });
      }
    });
    // each new building type should have produced at least one occupant somewhere
    ['mill', 'tailor', 'fletcher', 'apothecary', 'stables', 'harbormaster', 'magetower', 'jail', 'townhall', 'shrine']
      .forEach((bt) => expect(seen[bt] && seen[bt].length).toBeGreaterThan(0));
    // titles are real strings, not the generic fallback
    expect(seen.magetower.some((t) => /Mage|Wizard|Sorcer|Enchant|Archmage|Witch/.test(t))).toBe(true);
    expect(seen.townhall.some((t) => /Mayor|Magistrate|Burgomaster|Reeve|Alder|Clerk/.test(t))).toBe(true);
    expect(seen.harbormaster.some((t) => /Harbor|Dock|Port|Quay/.test(t))).toBe(true);
  });

  test('the town hall houses a constable (no separate sheriff/courthouse building)', () => {
    let constables = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { town, npcs } = occupy('town', seed);
      const hasTownhall = town.mapData.flat().some((t) => t.type === 'building' && t.buildingType === 'townhall');
      const constable = npcs.find((n) => /Constable|Reeve|Bailiff/.test(n.title));
      if (hasTownhall && constable) constables++;
      // no sheriff's office / courthouse buildings exist
      expect(town.mapData.flat().some((t) => ['sheriff', 'courthouse'].includes(t.buildingType))).toBe(false);
    }
    expect(constables).toBeGreaterThan(0);
  });
});
