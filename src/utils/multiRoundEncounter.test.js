// multiRoundEncounter tests — #43 combat depth: flat enemy damage, HP-scaled
// round caps, and the Phase 5 Lead + Support party machinery (support bonus,
// damage distribution, lead KO auto-swap, wipe defeat, reward-round cap).

import {
  ENEMY_DAMAGE_BY_OUTCOME,
  REWARD_PAYING_ROUNDS_CAP,
  computeMaxRounds,
  computeAdvantageDefeatThreshold,
  heroSupportContribution,
  getSupportBonus,
  createMultiRoundEncounter,
  computeStartingAdvantage,
  resolveRound,
  generateEncounterSummary,
  getRoundActions
} from './multiRoundEncounter';

// Numeric damage profile => rollProfileDamage returns the exact number, keeping
// incoming damage deterministic under a constant Math.random mock.
const makeBoss = (overrides = {}) => ({
  name: 'Test Brute',
  difficulty: 'medium', // DC 15
  encounterTier: 'boss',
  multiRound: true,
  enemyHP: 50,
  dealsDamage: true,
  damage: { criticalFailure: 10, failure: 5, success: 1 },
  suggestedActions: [
    { label: 'Fight', skill: 'Athletics', description: 'Attack' }
  ],
  consequences: {
    criticalSuccess: 'cs', success: 's', failure: 'f', criticalFailure: 'cf'
  },
  rewards: { xp: 100 },
  ...overrides
});

const makeHero = (over = {}) => ({
  heroId: over.heroId || 'h1',
  heroName: over.heroName || 'Lead',
  stats: { Strength: 10, ...(over.stats || {}) },
  maxHP: over.maxHP ?? 30,
  currentHP: over.currentHP ?? over.maxHP ?? 30,
  level: 1,
  gold: 50,
  inventory: [],
  ...over
});

// d20 = floor(r * 20) + 1 (rolled twice per check; a constant mock is stable):
// 0.5 -> 11 (failure vs DC 15 with +0), 0.7 -> 15 (success), 0.99 -> 20 (crit
// success), 0.0 -> 1 (crit failure).
const mockRoll = (value) => jest.spyOn(Math, 'random').mockReturnValue(value);

afterEach(() => jest.restoreAllMocks());

describe('tuning constants and scaling formulas', () => {
  test('flat enemy damage per outcome tier', () => {
    expect(ENEMY_DAMAGE_BY_OUTCOME).toEqual({
      criticalSuccess: 50, success: 25, failure: 2, criticalFailure: 0
    });
  });

  test('maxRounds scales with the enemy HP pool, floored at the classic 3', () => {
    expect(computeMaxRounds(15)).toBe(3); // small mobs keep the classic cap
    expect(computeMaxRounds(30)).toBe(4); // t1 boss
    expect(computeMaxRounds(150)).toBe(12); // t2 boss
    expect(computeMaxRounds(300)).toBe(24); // biggest t2 boss
    expect(computeMaxRounds(undefined)).toBe(3);
  });

  test('advantage defeat floor loosens with fight length', () => {
    expect(computeAdvantageDefeatThreshold(3)).toBe(-3); // classic
    expect(computeAdvantageDefeatThreshold(12)).toBe(-5);
    expect(computeAdvantageDefeatThreshold(24)).toBe(-8);
  });
});

describe('Phase 5 support bonus', () => {
  test('max(1, floor(bestStatMod / 2)) per living supporter', () => {
    expect(heroSupportContribution(makeHero({ stats: { Strength: 10 } }))).toBe(1); // floor(0/2) -> min 1
    expect(heroSupportContribution(makeHero({ stats: { Strength: 14 } }))).toBe(1);
    expect(heroSupportContribution(makeHero({ stats: { Wisdom: 18 } }))).toBe(2); // +4 mod
    const party = [
      makeHero({ heroId: 'a' }),
      makeHero({ heroId: 'b', stats: { Strength: 18 } }), // +2
      makeHero({ heroId: 'c' }) // +1
    ];
    expect(getSupportBonus(party, 0)).toBe(3);
    expect(getSupportBonus(party, 1)).toBe(2); // lead excluded
    expect(getSupportBonus([party[0]], 0)).toBe(0); // solo
  });

  test('KO\'d heroes cannot support', () => {
    const party = [
      makeHero({ heroId: 'a' }),
      makeHero({ heroId: 'b', currentHP: 0 }),
      makeHero({ heroId: 'c' })
    ];
    expect(getSupportBonus(party, 0)).toBe(1);
  });
});

describe('createMultiRoundEncounter', () => {
  test('solo signature (no party) is unchanged and non-team', () => {
    const hero = makeHero();
    const state = createMultiRoundEncounter(makeBoss(), hero, {});
    expect(state.isTeamEncounter).toBe(false);
    expect(state.party).toHaveLength(1);
    expect(state.supportBonus).toBe(0);
    expect(state.maxRounds).toBe(4); // 50 HP
    expect(state.enemyCurrentHP).toBe(50);
    // Heroes are copied: mutating fight state never touches the caller's hero
    expect(state.party[0]).not.toBe(hero);
    expect(state.character).toBe(state.party[0]);
  });

  test('party signature marks a team encounter and finds the lead', () => {
    const a = makeHero({ heroId: 'a' });
    const b = makeHero({ heroId: 'b', heroName: 'Second' });
    const state = createMultiRoundEncounter(makeBoss(), b, {}, {}, [a, b]);
    expect(state.isTeamEncounter).toBe(true);
    expect(state.leadIndex).toBe(1);
    expect(state.supportBonus).toBe(1);
  });

  test('starting advantage is a computed, varying lean (not a forced constant)', () => {
    const capable = makeHero({ stats: { Strength: 14 } }); // best-stat +2, no gear
    const medium = computeStartingAdvantage(makeBoss({ difficulty: 'medium' }), capable, 0);
    const easy = computeStartingAdvantage(makeBoss({ difficulty: 'easy' }), capable, 0);
    const hard = computeStartingAdvantage(makeBoss({ difficulty: 'hard' }), capable, 0);
    // The lean VARIES with the match and is modest near a medium fight.
    expect(medium).toBeGreaterThanOrEqual(-1);
    expect(medium).toBeLessThanOrEqual(1);
    // Easier fights lean the player's way; harder fights lean against.
    expect(easy).toBeGreaterThan(medium);
    expect(hard).toBeLessThan(medium);
    // Clamped to a lean, never a decided outcome.
    expect(computeStartingAdvantage(makeBoss({ difficulty: 'deadly' }), capable, 0)).toBeGreaterThanOrEqual(-2);
    expect(computeStartingAdvantage({ ...makeBoss(), dc: 1 }, capable, 8)).toBeLessThanOrEqual(2);
    // A party bonus (size) improves the lead's starting lean.
    expect(computeStartingAdvantage(makeBoss({ difficulty: 'medium' }), capable, 6)).toBeGreaterThan(medium);
    // It is wired into the created state.
    const state = createMultiRoundEncounter(makeBoss({ difficulty: 'medium' }), capable, {});
    expect(state.playerAdvantage).toBe(medium);
  });
});

describe('resolveRound: flat enemy damage and incoming party damage', () => {
  test('success deals flat damage regardless of enemy size, and support turns a miss into a hit', async () => {
    mockRoll(0.6); // d20 = 13: failure solo (+0 vs DC 15), success with +2 support
    const solo = createMultiRoundEncounter(makeBoss(), makeHero(), {});
    const { roundResult: soloRound } = await resolveRound(solo, 'Fight');
    expect(soloRound.outcomeTier).toBe('failure');
    expect(soloRound.enemyDamage).toBe(2);

    const party = [
      makeHero({ heroId: 'a' }),
      makeHero({ heroId: 'b', stats: { Wisdom: 14 } }),
      makeHero({ heroId: 'c', stats: { Charisma: 14 } })
    ];
    const team = createMultiRoundEncounter(makeBoss({ enemyHP: 300 }), party[0], {}, {}, party);
    expect(team.supportBonus).toBe(2);
    const { roundResult, updatedState } = await resolveRound(team, 'Fight');
    expect(roundResult.supportBonus).toBe(2);
    expect(roundResult.outcomeTier).toBe('success');
    expect(roundResult.enemyDamage).toBe(25); // flat: same 25 vs a 300 HP boss
    expect(updatedState.enemyCurrentHP).toBe(275);
  });

  test('failure: the lead takes the profile damage, supporters are untouched', async () => {
    mockRoll(0.5); // d20 = 11 -> failure
    const party = [makeHero({ heroId: 'a' }), makeHero({ heroId: 'b' })];
    const state = createMultiRoundEncounter(makeBoss(), party[0], {}, {}, party);
    const { roundResult, updatedState } = await resolveRound(state, 'Fight');
    expect(roundResult.outcomeTier).toBe('failure');
    expect(roundResult.hpDamage).toBe(5);
    expect(updatedState.party[0].currentHP).toBe(25);
    expect(updatedState.party[1].currentHP).toBe(30);
    expect(roundResult.partyDamage).toEqual([{ heroIndex: 0, amount: 5, role: 'lead' }]);
  });

  test('critical failure splashes 25% into each living supporter', async () => {
    mockRoll(0.0); // d20 = 1 -> critical failure, profile damage 10
    const party = [
      makeHero({ heroId: 'a' }),
      makeHero({ heroId: 'b' }),
      makeHero({ heroId: 'c', currentHP: 0 }) // already down: no splash
    ];
    const state = createMultiRoundEncounter(makeBoss(), party[0], {}, {}, party);
    const { roundResult, updatedState } = await resolveRound(state, 'Fight');
    expect(roundResult.outcomeTier).toBe('criticalFailure');
    expect(updatedState.party[0].currentHP).toBe(20); // 30 - 10
    expect(updatedState.party[1].currentHP).toBe(28); // 30 - floor(10 * 0.25)
    expect(updatedState.party[2].currentHP).toBe(0);
    expect(roundResult.partyDamage).toContainEqual({ heroIndex: 1, amount: 2, role: 'support' });
  });

  test('lead KO auto-swaps to the highest-HP living hero and recomputes support', async () => {
    mockRoll(0.5); // failure, 5 damage
    const party = [
      makeHero({ heroId: 'a', heroName: 'Frail', maxHP: 4 }),
      makeHero({ heroId: 'b', heroName: 'Backup', maxHP: 20 }),
      makeHero({ heroId: 'c', heroName: 'Third', maxHP: 12 })
    ];
    const state = createMultiRoundEncounter(makeBoss(), party[0], {}, {}, party);
    state.playerAdvantage = 0; // isolate the lead-swap mechanic from the rout floor
    const { roundResult, updatedState } = await resolveRound(state, 'Fight');
    expect(updatedState.party[0].currentHP).toBe(0);
    expect(updatedState.party[0].isDefeated).toBe(true);
    expect(roundResult.leadSwap).toMatchObject({ fromIndex: 0, toIndex: 1, newLead: 'Backup' });
    expect(updatedState.leadIndex).toBe(1);
    expect(updatedState.character.heroName).toBe('Backup');
    expect(updatedState.isResolved).toBe(false); // fight continues
    expect(updatedState.supportBonus).toBe(1); // only 'Third' still supports
  });

  test('solo lead KO is a defeat (party wipe)', async () => {
    mockRoll(0.5); // failure, 5 damage
    const state = createMultiRoundEncounter(makeBoss(), makeHero({ maxHP: 4 }), {});
    const { roundResult, updatedState } = await resolveRound(state, 'Fight');
    expect(roundResult.partyWiped).toBe(true);
    expect(updatedState.isResolved).toBe(true);
    expect(updatedState.outcome).toBe('defeat');
  });

  test('victory when the flat damage depletes the pool', async () => {
    mockRoll(0.99); // d20 = 20 -> critical success, 50 flat damage
    const state = createMultiRoundEncounter(makeBoss({ enemyHP: 50 }), makeHero(), {});
    const { updatedState } = await resolveRound(state, 'Fight');
    expect(updatedState.enemyCurrentHP).toBe(0);
    expect(updatedState.outcome).toBe('victory');
  });

  test('timeout is a stalemate unless the enemy is bloodied (<= 25% HP) with momentum', async () => {
    mockRoll(0.7); // d20 = 15 -> success (25 damage), advantage +1
    // Not bloodied: 300 HP pool, final round hit leaves 275
    const big = createMultiRoundEncounter(makeBoss({ enemyHP: 300 }), makeHero(), {});
    big.currentRound = big.maxRounds; // jump to the last round
    big.playerAdvantage = 0; // isolate the timeout branch from the computed starting lean
    const { updatedState: stale } = await resolveRound(big, 'Fight');
    expect(stale.outcome).toBe('stalemate');

    // Bloodied + advantage > 0: same roll, enemy nearly dead
    const small = createMultiRoundEncounter(makeBoss({ enemyHP: 300 }), makeHero(), {});
    small.currentRound = small.maxRounds;
    small.playerAdvantage = 0; // isolate the timeout branch; the success below lifts it to +1
    small.enemyCurrentHP = 60; // 25 dmg -> 35 left, <= 75 (25% of 300)
    const { updatedState: won } = await resolveRound(small, 'Fight');
    expect(won.outcome).toBe('victory');
  });
});

describe('generateEncounterSummary', () => {
  const rewardRound = (round) => ({
    round,
    action: 'Fight',
    result: { narration: 'hit', rewards: { xp: 100, gold: 10, items: [] }, penalties: null }
  });

  test(`caps reward payouts at ${REWARD_PAYING_ROUNDS_CAP} paying rounds (pre-#43 envelope)`, async () => {
    const state = {
      roundHistory: [1, 2, 3, 4, 5].map(rewardRound),
      outcome: 'victory',
      character: { gold: 100 },
      isTeamEncounter: false,
      leadIndex: 0
    };
    const summary = await generateEncounterSummary(state);
    // 3 paying rounds x 100 XP x 1.2 victory bonus; gold capped the same way
    expect(summary.rewards.xp).toBe(360);
    expect(summary.rewards.gold).toBe(30);
  });

  test('carries the Phase 5 team fields for the reward distributor', async () => {
    const state = {
      roundHistory: [rewardRound(1)],
      outcome: 'victory',
      character: { gold: 0 },
      isTeamEncounter: true,
      leadIndex: 2,
      party: [{}, {}, {}]
    };
    const summary = await generateEncounterSummary(state);
    expect(summary.isTeamEncounter).toBe(true);
    expect(summary.leadIndex).toBe(2);
    expect(summary.supporterCount).toBe(2);
  });
});

// Flee / contextual-action regression: getRoundActions must not inject a separate
// 'Tactical Retreat' action (fleeing is the dedicated button now, one affordance), and
// resolveRound must never throw on a contextual label reaching it directly.
describe('flee + contextual actions', () => {
  const baseState = (over = {}) => ({
    encounter: makeBoss(),
    currentRound: 2,
    playerAdvantage: 3,   // unlocks 'Finish Them'
    enemyMorale: 40,      // unlocks 'Demand Surrender'
    ...over
  });

  test('getRoundActions no longer injects a Tactical Retreat action', () => {
    const actions = getRoundActions(baseState());
    const labels = actions.map((a) => a.label);
    expect(labels).not.toContain('Tactical Retreat');
    // The other contextual actions are still offered when their conditions are met.
    expect(labels).toContain('Finish Them');
    expect(labels).toContain('Demand Surrender');
  });

  test('resolveRound does not throw on any contextual label', async () => {
    mockRoll(0.7); // stable success roll
    for (const label of ['Tactical Retreat', 'Finish Them', 'Demand Surrender']) {
      const state = createMultiRoundEncounter(
        makeBoss(), makeHero(), {}, {}, [makeHero()]
      );
      state.currentRound = 2;
      // eslint-disable-next-line no-await-in-loop
      const { roundResult } = await resolveRound(state, label);
      expect(roundResult).toBeTruthy();
      expect(roundResult.narration).not.toMatch(/an error occurred/i);
    }
  });
});
