import { heroUid, replaceHeroInParty, normalizeParty } from './partyUtils';

const hero = (heroId, name, hp) => ({ heroId, heroName: name, currentHP: hp, maxHP: 10 });

describe('heroUid', () => {
  test('prefers heroId, falls back to characterId, else null', () => {
    expect(heroUid({ heroId: 'a' })).toBe('a');
    expect(heroUid({ characterId: 'b' })).toBe('b');
    expect(heroUid({ heroId: 'a', characterId: 'b' })).toBe('a');
    expect(heroUid({})).toBeNull();
    expect(heroUid(null)).toBeNull();
  });
});

describe('replaceHeroInParty', () => {
  test('replaces only the matching hero, leaves the rest untouched', () => {
    const party = [hero('h1', 'Vanya', 9), hero('h2', 'Other', 6)];
    const updated = { ...party[0], currentHP: 4 };
    const result = replaceHeroInParty(party, updated);
    expect(result).toHaveLength(2);
    expect(result[0].currentHP).toBe(4);
    expect(result[1]).toBe(party[1]); // other hero object unchanged
    expect(result.filter((h) => h.heroName === 'Vanya')).toHaveLength(1); // no duplicate
  });

  test('REGRESSION: heroes with no characterId are NOT all overwritten (the duplicate-hero bug)', () => {
    // Real heroes carry heroId but no characterId. The old code matched on characterId, so
    // `undefined === undefined` overwrote every hero with the one active combatant.
    const party = [hero('h1', 'Vanya', 9), hero('h2', 'Other', 6)];
    expect(party.every((h) => h.characterId === undefined)).toBe(true);
    const damagedVanya = { ...party[0], currentHP: 5 };
    const result = replaceHeroInParty(party, damagedVanya);
    expect(result.map((h) => h.heroName)).toEqual(['Vanya', 'Other']); // NOT ['Vanya','Vanya']
    expect(result[1].heroName).toBe('Other');
  });

  test('an updated hero with no stable id leaves the party unchanged (no overwrite-all)', () => {
    const party = [hero('h1', 'A', 9), hero('h2', 'B', 6)];
    const result = replaceHeroInParty(party, { heroName: 'Ghost', currentHP: 1 });
    expect(result).toBe(party);
  });

  test('also works for characterId-keyed heroes (debug/legacy)', () => {
    const party = [{ characterId: 'c1', currentHP: 9 }, { characterId: 'c2', currentHP: 9 }];
    const result = replaceHeroInParty(party, { characterId: 'c2', currentHP: 2 });
    expect(result[0].currentHP).toBe(9);
    expect(result[1].currentHP).toBe(2);
  });
});

describe('normalizeParty', () => {
  test('collapses heroes that share an id (repairs the corrupted save)', () => {
    const party = [hero('h1', 'Vanya', 9), hero('h1', 'Vanya', 9)]; // duplicate from the bug
    const result = normalizeParty(party);
    expect(result).toHaveLength(1);
    expect(result[0].heroName).toBe('Vanya');
  });

  test('migrates legacy characterId onto heroId and drops the field', () => {
    const result = normalizeParty([{ characterId: 'c1', heroName: 'Old' }]);
    expect(result[0].heroId).toBe('c1');
    expect(result[0].characterId).toBeUndefined();
  });

  test('stamps a stable heroId on a hero that has none', () => {
    const result = normalizeParty([{ heroName: 'Nameless' }]);
    expect(result[0].heroId).toBeTruthy();
  });

  test('keeps distinct heroes intact and leaves heroId-only heroes untouched', () => {
    const party = [hero('h1', 'A', 9), hero('h2', 'B', 6)];
    const result = normalizeParty(party);
    expect(result.map((h) => h.heroId)).toEqual(['h1', 'h2']);
    expect(result.every((h) => h.characterId === undefined)).toBe(true);
  });
});
