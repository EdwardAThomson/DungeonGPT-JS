// Noble houses within a town: every manor/keep bears a distinct noble surname, the family
// living there carries that surname, the keep always seats nobility (never a commoner
// household renamed "The X House"), and commoners never take a noble surname.
import { generateTownMap } from './townMapGenerator';
import { populateTown } from './npcGenerator';
import { NOBLE_LAST_NAMES } from './nameData';

const surname = (name) => name.split(' ').slice(-1)[0];

describe.each(['city', 'town', 'village'])('noble houses (%s)', (size) => {
  test.each([1, 2, 4, 17, 99])('seed %i', (seed) => {
    const town = generateTownMap(size, 'Fixture', 'south', seed);
    const npcs = populateTown(town, seed);
    const seats = town.mapData.flat().filter((c) => c.buildingType === 'manor' || c.buildingType === 'keep');

    const seatSurnames = seats.map((c) => c.buildingName.split(' ')[0]);
    expect(new Set(seatSurnames).size).toBe(seatSurnames.length);
    seats.forEach((c) => expect(c.buildingName.startsWith('The ')).toBe(false));

    npcs.forEach((n) => {
      const h = n.location?.homeCoords;
      if (!h) return;
      const home = town.mapData[h.y][h.x];
      if (home.buildingType === 'manor' || home.buildingType === 'keep') {
        expect(surname(n.name)).toBe(home.buildingName.split(' ')[0]);
      } else if (home.buildingType === 'house') {
        expect(NOBLE_LAST_NAMES).not.toContain(surname(n.name));
      }
    });
  });
});
