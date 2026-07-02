import { resolveEncounter } from './encounterResolver';

// A hostile encounter (name contains 'goblin') with a Strength/Athletics action,
// so it counts as a combat action and deals HP damage.
const makeEncounter = () => ({
  name: 'Goblin Ambush',
  difficulty: 'medium',
  suggestedActions: [
    { label: 'Fight', description: 'attack the goblins', skill: 'Athletics' }
  ],
  consequences: {
    criticalSuccess: 'You rout them.',
    success: 'You drive them off.',
    failure: 'They wound you.',
    criticalFailure: 'They overwhelm you.'
  }
});

const makeCharacter = (equipment) => ({
  characterId: 'h1',
  stats: { Strength: 10 }, // modifier 0
  maxHP: 100,
  inventory: [
    { key: 'magic_weapon' },                                                  // weapon, '+1'
    { key: 'magic_plate', type: 'armor', bonus: '+2 defense', name: 'Plate' } // armour, soak 2
  ],
  ...(equipment ? { equipment } : {})
});

describe('resolveEncounter with equipment', () => {
  beforeEach(() => {
    // Deterministic rolls: d20 -> 11, damage variance -> 0.
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('an equipped weapon raises the roll total on a combat action', async () => {
    const base = await resolveEncounter(makeEncounter(), 'Fight', makeCharacter(), {});
    const armed = await resolveEncounter(
      makeEncounter(),
      'Fight',
      makeCharacter({ weapon: 'magic_weapon' }),
      {}
    );

    expect(armed.rollResult.total).toBe(base.rollResult.total + 1);
    expect(armed.rollResult.total).toBeGreaterThan(base.rollResult.total);
  });

  it('equipped armour soaks incoming HP damage', async () => {
    const base = await resolveEncounter(makeEncounter(), 'Fight', makeCharacter(), {});
    const armored = await resolveEncounter(
      makeEncounter(),
      'Fight',
      makeCharacter({ armor: 'magic_plate' }),
      {}
    );

    expect(base.hpDamage).toBeGreaterThan(0);
    expect(armored.hpDamage).toBe(base.hpDamage - 2);
    expect(armored.hpDamage).toBeLessThan(base.hpDamage);
  });

  it('behaves identically to today for a hero with no equipment', async () => {
    const noEquip = await resolveEncounter(makeEncounter(), 'Fight', makeCharacter(), {});
    const emptyEquip = await resolveEncounter(
      makeEncounter(),
      'Fight',
      makeCharacter({ weapon: null, armor: null, accessory: null }),
      {}
    );

    expect(emptyEquip.rollResult.total).toBe(noEquip.rollResult.total);
    expect(emptyEquip.hpDamage).toBe(noEquip.hpDamage);
  });
});

describe('resolveEncounter loot rarity gating by tier', () => {
  // Non-hostile skill encounter with guaranteed-drop loot: one rare-and-below item and
  // one very_rare item, both at 100% chance so only the rarity gate can remove them.
  const makeLootEncounter = () => ({
    name: 'Hidden Cache',
    difficulty: 'easy',
    suggestedActions: [
      { label: 'Search', description: 'search the cache', skill: 'Perception' }
    ],
    consequences: {
      criticalSuccess: 'You find treasure.',
      success: 'You find treasure.',
      failure: 'Nothing here.',
      criticalFailure: 'A trap!'
    },
    rewards: {
      xp: 10,
      gold: '0',
      items: ['healing_potion:100%', 'legendary_artifact:100%'] // rare-safe + very_rare
    }
  });

  const looter = () => ({ characterId: 'h1', stats: { Wisdom: 10 }, maxHP: 100, inventory: [] });

  beforeEach(() => {
    // 0.99 -> d20 lands high (success), and every 100% item-chance roll passes.
    jest.spyOn(Math, 'random').mockReturnValue(0.99);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Tier 1 drops the rare-safe item but never the very_rare one', async () => {
    const result = await resolveEncounter(makeLootEncounter(), 'Search', looter(), { tier: 1 });
    expect(result.rewards.items).toContain('healing_potion');
    expect(result.rewards.items).not.toContain('legendary_artifact');
  });

  it('Tier 2 allows the very_rare drop through', async () => {
    const result = await resolveEncounter(makeLootEncounter(), 'Search', looter(), { tier: 2 });
    expect(result.rewards.items).toContain('healing_potion');
    expect(result.rewards.items).toContain('legendary_artifact');
  });

  it('falls back to party level when settings.tier is absent (old saves)', async () => {
    // Level 2 -> Tier 1, so very_rare is still gated even with no settings.tier.
    const lowLevel = { ...looter(), level: 2 };
    const result = await resolveEncounter(makeLootEncounter(), 'Search', lowLevel, {});
    expect(result.rewards.items).not.toContain('legendary_artifact');
  });
});
