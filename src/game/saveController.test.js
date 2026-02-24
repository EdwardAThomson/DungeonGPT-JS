import { buildSaveFingerprint, buildSubMapsPayload } from './saveController';

describe('saveController', () => {
  it('produces stable fingerprint for identical inputs', () => {
    const input = {
      conversation: [{ role: 'user', content: 'hello' }],
      playerPosition: { x: 2, y: 4 },
      townPlayerPosition: { x: 1, y: 1 },
      currentMapLevel: 0,
      isInsideTown: false,
      currentSummary: 'Summary text',
      settings: { storyTitle: 'Test Run' },
      selectedHeroes: [{ currentHP: 10, gold: 5, xp: 20, inventory: ['potion'] }]
    };

    const a = buildSaveFingerprint(input);
    const b = buildSaveFingerprint(input);
    expect(a).toBe(b);
  });

  it('changes fingerprint when tracked hero state changes', () => {
    const base = {
      conversation: [{ role: 'user', content: 'hello' }],
      playerPosition: { x: 2, y: 4 },
      townPlayerPosition: { x: 1, y: 1 },
      currentMapLevel: 0,
      isInsideTown: false,
      currentSummary: 'Summary text',
      settings: { storyTitle: 'Test Run' },
      selectedHeroes: [{ currentHP: 10, gold: 5, xp: 20, inventory: [] }]
    };

    const original = buildSaveFingerprint(base);
    const changed = buildSaveFingerprint({
      ...base,
      selectedHeroes: [{ currentHP: 6, gold: 5, xp: 20, inventory: [] }]
    });
    expect(changed).not.toBe(original);
  });

  it('serializes visited sets and preserves map payload fields', () => {
    const payload = buildSubMapsPayload({
      currentTownMap: [[{ x: 0, y: 0 }]],
      townPlayerPosition: { x: 3, y: 2 },
      currentTownTile: { x: 9, y: 1 },
      isInsideTown: true,
      currentMapLevel: 2,
      townMapsCache: { Oakrest: { seed: 123 } },
      visitedBiomes: new Set(['forest', 'hills']),
      visitedTowns: new Set(['Oakrest']),
      movesSinceEncounter: 4
    });

    expect(payload).toMatchObject({
      isInsideTown: true,
      currentMapLevel: 2,
      movesSinceEncounter: 4,
      townPlayerPosition: { x: 3, y: 2 }
    });
    expect(payload.visitedBiomes).toEqual(['forest', 'hills']);
    expect(payload.visitedTowns).toEqual(['Oakrest']);
  });
});
