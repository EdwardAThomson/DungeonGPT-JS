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
