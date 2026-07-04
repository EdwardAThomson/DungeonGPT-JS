import { buildSaveFingerprint, buildSubMapsPayload, buildSaveName, parseSaveRoot, DEFAULT_SAVE_ROOT } from './saveController';

describe('buildSaveName', () => {
  const date = new Date('2026-07-02T14:30:00');

  it('formats "<root> - <date> <time>"', () => {
    const name = buildSaveName('Goblin Campaign', date);
    expect(name.startsWith('Goblin Campaign - ')).toBe(true);
    expect(name).toContain(date.toLocaleDateString());
    expect(name).toContain(date.toLocaleTimeString());
  });

  it('falls back to the default root when empty or blank', () => {
    expect(buildSaveName('', date).startsWith(`${DEFAULT_SAVE_ROOT} - `)).toBe(true);
    expect(buildSaveName('   ', date).startsWith(`${DEFAULT_SAVE_ROOT} - `)).toBe(true);
    expect(buildSaveName(undefined, date).startsWith(`${DEFAULT_SAVE_ROOT} - `)).toBe(true);
  });

  it('trims the root', () => {
    expect(buildSaveName('  My Saga  ', date).startsWith('My Saga - ')).toBe(true);
  });
});

describe('parseSaveRoot', () => {
  it('recovers the root from a full save name (round-trips buildSaveName)', () => {
    const date = new Date('2026-07-02T14:30:00');
    expect(parseSaveRoot(buildSaveName('Goblin Campaign', date))).toBe('Goblin Campaign');
    expect(parseSaveRoot(buildSaveName('Adventure', date))).toBe('Adventure');
  });

  it('returns the default for empty input', () => {
    expect(parseSaveRoot('')).toBe(DEFAULT_SAVE_ROOT);
    expect(parseSaveRoot(null)).toBe(DEFAULT_SAVE_ROOT);
  });

  it('returns the whole string when there is no timestamp suffix', () => {
    expect(parseSaveRoot('Just A Name')).toBe('Just A Name');
  });
});

describe('buildSaveFingerprint — quest progress must change the fingerprint', () => {
  const base = {
    conversation: [{ role: 'user', content: 'hello' }],
    playerPosition: { x: 2, y: 4 },
    currentMapLevel: 'world',
    isInsideTown: false,
    currentSummary: 'Summary',
    selectedHeroes: [{ currentHP: 10, gold: 5, xp: 20, inventory: [] }],
    settings: {
      storyTitle: 'Run',
      milestones: [{ id: 1, text: 'Find the map', completed: false }, { id: 2, text: 'Meet the captain', completed: false }],
      sideQuests: [{ id: 'sq1', status: 'available' }]
    }
  };

  it('changes when a milestone completes (regression: was skipped as "no change")', () => {
    const before = buildSaveFingerprint(base);
    const after = buildSaveFingerprint({
      ...base,
      settings: { ...base.settings, milestones: base.settings.milestones.map(m => (m.id === 1 ? { ...m, completed: true } : m)) }
    });
    expect(after).not.toBe(before);
  });

  it('changes when a side quest changes state', () => {
    const before = buildSaveFingerprint(base);
    const after = buildSaveFingerprint({
      ...base,
      settings: { ...base.settings, sideQuests: [{ id: 'sq1', status: 'active' }] }
    });
    expect(after).not.toBe(before);
  });

  it('changes when the campaign completes', () => {
    const before = buildSaveFingerprint(base);
    const after = buildSaveFingerprint({ ...base, settings: { ...base.settings, campaignComplete: true } });
    expect(after).not.toBe(before);
  });

  it('tolerates missing quest fields (old saves)', () => {
    const noQuests = buildSaveFingerprint({ ...base, settings: { storyTitle: 'Run' } });
    expect(typeof noQuests).toBe('string');
  });
});

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

describe('fingerprint covers gear (playtest 2026-07-04: equip-only changes were skipped as "no change")', () => {
  const base = () => ({
    conversation: [{ role: 'user', content: 'hi' }],
    playerPosition: { x: 1, y: 1 },
    currentMapLevel: 'world',
    isInsideTown: false,
    settings: { storyTitle: 'T', milestones: [], sideQuests: [] },
    selectedHeroes: [{
      currentHP: 10, gold: 5, xp: 100,
      inventory: ['iron_sword', 'healing_potion'],
      equipment: { weapon: null, armor: null, accessory: null }
    }]
  });

  it('changes when a hero EQUIPS an item (inventory count unchanged)', () => {
    const a = buildSaveFingerprint(base());
    const equipped = base();
    equipped.selectedHeroes[0].equipment = { weapon: 'iron_sword', armor: null, accessory: null };
    expect(buildSaveFingerprint(equipped)).not.toBe(a);
  });

  it('changes on an equal-count inventory swap', () => {
    const a = buildSaveFingerprint(base());
    const swapped = base();
    swapped.selectedHeroes[0].inventory = ['steel_sword', 'healing_potion'];
    expect(buildSaveFingerprint(swapped)).not.toBe(a);
  });

  it('is stable when nothing changed', () => {
    expect(buildSaveFingerprint(base())).toBe(buildSaveFingerprint(base()));
  });
});
