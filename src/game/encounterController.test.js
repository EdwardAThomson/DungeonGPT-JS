import {
  ageNarrativeHook,
  applyEncounterOutcomeToParty,
  applyPartyRewardsToAll,
  applyTeamEncounterOutcomeToParty,
  NARRATIVE_HOOK_PERSIST_MOVES,
  planWorldTileEncounterFlow,
  isFleeOutcome,
  isEncounterVictory,
  getFleeReposition
} from './encounterController';

describe('planWorldTileEncounterFlow', () => {
  const baseTile = { poi: null };
  const narrativeEncounter = {
    name: 'Whispers in the Fog',
    encounterTier: 'narrative',
    narrativeHook: 'A chill follows the party.',
    aiContext: { danger: 'low' }
  };
  const immediateEncounter = {
    name: 'Bandit Ambush',
    encounterTier: 'immediate'
  };

  it('increments moves and does not open encounters when none are rolled', () => {
    const result = planWorldTileEncounterFlow({
      randomEncounter: null,
      targetTile: baseTile,
      aiNarrativeEnabled: true,
      pendingNarrativeTile: { tile: baseTile }
    });

    expect(result.flowType).toBe('none');
    expect(result.shouldIncrementMoves).toBe(true);
    expect(result.shouldResetMoves).toBe(false);
    expect(result.openActionEncounter).toBe(false);
  });

  it('immediate encounters open modal and defer AI narrative', () => {
    const pendingNarrativeTile = { tile: baseTile, needsAiDescription: true };
    const result = planWorldTileEncounterFlow({
      randomEncounter: immediateEncounter,
      targetTile: { poi: 'town' },
      aiNarrativeEnabled: true,
      pendingNarrativeTile
    });

    expect(result.flowType).toBe('immediate');
    expect(result.shouldResetMoves).toBe(true);
    expect(result.openActionEncounter).toBe(true);
    expect(result.pendingNarrativeTile).toEqual(pendingNarrativeTile);
    expect(result.delayMs).toBe(800);
  });

  it('narrative encounters with AI enabled inject context and do not open modal', () => {
    const result = planWorldTileEncounterFlow({
      randomEncounter: narrativeEncounter,
      targetTile: baseTile,
      aiNarrativeEnabled: true,
      pendingNarrativeTile: { tile: baseTile }
    });

    expect(result.flowType).toBe('narrative_context');
    expect(result.shouldResetMoves).toBe(true);
    expect(result.openActionEncounter).toBe(false);
    expect(result.narrativeEncounter).toMatchObject({
      type: 'narrative_encounter',
      encounter: narrativeEncounter
    });
  });

  it('narrative encounters with AI disabled open modal fallback and skip prompt context', () => {
    const result = planWorldTileEncounterFlow({
      randomEncounter: narrativeEncounter,
      targetTile: { poi: 'cave' },
      aiNarrativeEnabled: false,
      pendingNarrativeTile: { tile: baseTile }
    });

    expect(result.flowType).toBe('narrative_fallback_modal');
    expect(result.shouldResetMoves).toBe(true);
    expect(result.openActionEncounter).toBe(true);
    expect(result.delayMs).toBe(800);
    expect(result.narrativeEncounter).toBeUndefined();
  });
});

describe('ageNarrativeHook (#35/#36 hook lifecycle)', () => {
  const parkedHook = {
    type: 'narrative_encounter',
    encounter: { name: 'Hidden Cache', narrativeHook: 'a metallic glint among the bushes' },
    hook: 'a metallic glint among the bushes',
    aiContext: 'Something gleams in the vegetation.'
  };

  it('passes null through untouched', () => {
    expect(ageNarrativeHook(null)).toEqual({ hookState: null, reminderText: null });
    expect(ageNarrativeHook(undefined, { remind: true })).toEqual({ hookState: null, reminderText: null });
  });

  it('increments hookMoves without mutating the input', () => {
    const { hookState } = ageNarrativeHook(parkedHook);
    expect(hookState.hookMoves).toBe(1);
    expect(hookState.encounter).toBe(parkedHook.encounter);
    expect(parkedHook.hookMoves).toBeUndefined(); // pure, no mutation
  });

  it('emits a reminder only on the FIRST move away, and only when asked', () => {
    const first = ageNarrativeHook(parkedHook, { remind: true });
    expect(first.reminderText).toContain('a metallic glint among the bushes');
    expect(first.reminderText).toContain('Look around');

    // Second move: hook survives but stays quiet.
    const second = ageNarrativeHook(first.hookState, { remind: true });
    expect(second.hookState.hookMoves).toBe(2);
    expect(second.reminderText).toBeNull();

    // Chips phase never asks for a reminder.
    const silent = ageNarrativeHook(parkedHook);
    expect(silent.reminderText).toBeNull();
  });

  it('falls back to the encounter narrativeHook for the reminder text', () => {
    const noTopLevelHook = { encounter: { narrativeHook: 'smoke rising in the distance' } };
    const { reminderText } = ageNarrativeHook(noTopLevelHook, { remind: true });
    expect(reminderText).toContain('smoke rising in the distance');
  });

  it('skips the reminder when no hook text exists but still ages the state', () => {
    const { hookState, reminderText } = ageNarrativeHook({ encounter: { name: 'Mystery' } }, { remind: true });
    expect(hookState.hookMoves).toBe(1);
    expect(reminderText).toBeNull();
  });

  it(`persists for exactly ${NARRATIVE_HOOK_PERSIST_MOVES} moves, then expires silently`, () => {
    let state = parkedHook;
    for (let move = 1; move <= NARRATIVE_HOOK_PERSIST_MOVES; move++) {
      const aged = ageNarrativeHook(state, { remind: true });
      expect(aged.hookState).not.toBeNull(); // still actionable
      expect(aged.hookState.hookMoves).toBe(move);
      state = aged.hookState;
    }
    // One move beyond the window: gone, and no reminder/noise on the way out.
    const expired = ageNarrativeHook(state, { remind: true });
    expect(expired).toEqual({ hookState: null, reminderText: null });
  });
});

describe('applyPartyRewardsToAll (#55): milestone/quest rewards are party-wide', () => {
  const hero = (name, xp = 0) => ({
    characterName: name,
    characterClass: 'Fighter',
    level: 1,
    xp,
    gold: 0,
    inventory: [],
    stats: { strength: 10, constitution: 10 }
  });

  it('gives FULL XP to every member (no split), including KO-flagged heroes', () => {
    const party = [hero('Ara'), { ...hero('Bem'), isDefeated: true }, hero('Cyl')];
    const { updatedParty } = applyPartyRewardsToAll({ party, rewards: { xp: 200, gold: 0, items: [] } });
    updatedParty.forEach((h) => expect(h.xp).toBe(200));
  });

  it('routes gold and items through the lead only (shared-pool convention)', () => {
    const party = [hero('Ara'), hero('Bem')];
    const { updatedParty } = applyPartyRewardsToAll({
      party,
      rewards: { xp: 50, gold: 30, items: ['quest_key'] }
    });
    expect(updatedParty[0].gold).toBe(30);
    expect(updatedParty[1].gold).toBe(0);
    expect((updatedParty[0].inventory || []).length).toBeGreaterThan(0);
    expect((updatedParty[1].inventory || []).length).toBe(0);
  });

  it('announces the party XP once and level-ups per hero by name', () => {
    // 250 existing + 100 = 350 XP: crosses the 300 threshold to level 2 for both.
    const party = [hero('Ara', 250), hero('Bem', 250)];
    const { updatedParty, rewardMessages } = applyPartyRewardsToAll({ party, rewards: { xp: 100 } });
    updatedParty.forEach((h) => expect(h.level).toBe(2));
    expect(rewardMessages[0]).toBe('+100 XP to each party member');
    expect(rewardMessages.filter((m) => m.includes('LEVEL UP'))).toHaveLength(2);
    expect(rewardMessages.some((m) => m.startsWith('Ara'))).toBe(true);
    expect(rewardMessages.some((m) => m.startsWith('Bem'))).toBe(true);
  });

  it('uses heroName for the level-up line when characterName is absent (playtest #3)', () => {
    // Heroes created through the hero builder carry heroName, not characterName; the
    // level-up line used to check only characterName and fell back to "Hero N".
    const party = [
      { heroName: 'Kaelin', heroClass: 'Fighter', level: 1, xp: 250, gold: 0, inventory: [], stats: { strength: 10, constitution: 10 } },
    ];
    const { rewardMessages } = applyPartyRewardsToAll({ party, rewards: { xp: 100 } });
    const levelUp = rewardMessages.find((m) => m.includes('LEVEL UP'));
    expect(levelUp).toMatch(/^Kaelin /);
    expect(levelUp).not.toMatch(/Hero 1/);
  });

  it('tolerates an empty party', () => {
    expect(applyPartyRewardsToAll({ party: [], rewards: { xp: 10 } }).updatedParty).toEqual([]);
  });
});

describe('grant-ledger events (SAVE_SYNC_PLAN 9.2): additive ledgerEvents return field', () => {
  const hero = (id, name, overrides = {}) => ({
    heroId: id,
    characterName: name,
    characterClass: 'Fighter',
    level: 1,
    xp: 0,
    gold: 50,
    inventory: [],
    stats: { strength: 10, constitution: 10 },
    ...overrides
  });

  it('applyEncounterOutcomeToParty reports xp/gold/item grants and penalty spends', () => {
    const party = [hero('h1', 'Ara')];
    const { updatedParty, ledgerEvents } = applyEncounterOutcomeToParty({
      party,
      result: {
        heroIndex: 0,
        rewards: { xp: 40, gold: 15, items: ['Old Rope'] },
        penalties: { goldLoss: 5 }
      }
    });
    expect(updatedParty[0].xp).toBe(40);
    expect(ledgerEvents).toEqual([
      { heroId: 'h1', kind: 'xp', amount: 40 },
      { heroId: 'h1', kind: 'gold', amount: 15 },
      { heroId: 'h1', kind: 'item', key: 'old_rope' },
      { heroId: 'h1', kind: 'gold', amount: -5 }
    ]);
  });

  it('records a level event when a reward crosses a threshold', () => {
    const party = [hero('h1', 'Ara', { xp: 280 })];
    const { ledgerEvents } = applyEncounterOutcomeToParty({
      party,
      result: { heroIndex: 0, rewards: { xp: 50 } }
    });
    expect(ledgerEvents).toContainEqual({ heroId: 'h1', kind: 'level', amount: 2 });
  });

  it('applyPartyRewardsToAll ledgers full XP per hero, gold/items on the lead', () => {
    const party = [hero('h1', 'Ara'), hero('h2', 'Bem')];
    const { ledgerEvents } = applyPartyRewardsToAll({
      party,
      rewards: { xp: 100, gold: 30, items: ['quest_key'] }
    });
    expect(ledgerEvents).toContainEqual({ heroId: 'h1', kind: 'xp', amount: 100 });
    expect(ledgerEvents).toContainEqual({ heroId: 'h2', kind: 'xp', amount: 100 });
    expect(ledgerEvents).toContainEqual({ heroId: 'h1', kind: 'gold', amount: 30 });
    expect(ledgerEvents).toContainEqual({ heroId: 'h1', kind: 'item', key: 'quest_key' });
    expect(ledgerEvents.filter((e) => e.kind === 'gold')).toHaveLength(1);
  });

  it('applyTeamEncounterOutcomeToParty ledgers the split XP shares per hero', () => {
    const party = [hero('h1', 'Ara'), hero('h2', 'Bem')];
    const { updatedParty, ledgerEvents } = applyTeamEncounterOutcomeToParty({
      party,
      result: {
        isTeamEncounter: true,
        heroIndex: 0,
        supporterCount: 1,
        rewards: { xp: 100 } // pot = 110, share 55 each
      }
    });
    expect(ledgerEvents).toContainEqual({ heroId: 'h1', kind: 'xp', amount: 55 });
    expect(ledgerEvents).toContainEqual({ heroId: 'h2', kind: 'xp', amount: 55 });
    const ledgeredXp = ledgerEvents.filter((e) => e.kind === 'xp').reduce((s, e) => s + e.amount, 0);
    expect(ledgeredXp).toBe(updatedParty.reduce((s, h) => s + h.xp, 0)); // ledger matches paid XP
  });

  it('skips events for heroes without a stable id (nothing to attribute)', () => {
    const anon = { characterName: 'Ghost', level: 1, xp: 0, gold: 0, inventory: [] };
    const { ledgerEvents, updatedParty } = applyEncounterOutcomeToParty({
      party: [anon],
      result: { heroIndex: 0, rewards: { xp: 10, gold: 5 } }
    });
    expect(updatedParty[0].xp).toBe(10); // grants still land
    expect(ledgerEvents).toEqual([]);
  });

  it('existing callers that ignore ledgerEvents see identical reward behaviour', () => {
    const party = [hero('h1', 'Ara')];
    const { updatedParty, rewardMessages, penaltyMessages } = applyEncounterOutcomeToParty({
      party,
      result: { heroIndex: 0, rewards: { xp: 25, gold: 10, items: [] } }
    });
    expect(updatedParty[0].xp).toBe(25);
    expect(updatedParty[0].gold).toBe(60);
    expect(rewardMessages).toEqual(['+25 XP', '+10 gold']);
    expect(penaltyMessages).toEqual([]);
  });
});

// Flee/disengage helpers used by Game.js handleEncounterResolve. These drive the
// reposition-on-flee behavior and gate the enemy/mob-defeat path, so they are unit-tested
// here (a full Game.js render is too heavy for this decision logic).
describe('flee outcome helpers', () => {
  const world = { level: 'world', x: 2, y: 3 };

  test('isFleeOutcome recognizes fled and escaped, not victory/success/failure', () => {
    expect(isFleeOutcome({ outcome: 'fled' })).toBe(true);
    expect(isFleeOutcome({ outcome: 'escaped' })).toBe(true);
    expect(isFleeOutcome({ outcome: 'victory' })).toBe(false);
    expect(isFleeOutcome({ outcome: 'success' })).toBe(false);
    // A caught (failed) flee has outcomeTier 'failure' and NO outcome:'fled'.
    expect(isFleeOutcome({ outcomeTier: 'failure' })).toBe(false);
    expect(isFleeOutcome(null)).toBe(false);
  });

  test('isEncounterVictory is win-only and excludes a flee', () => {
    expect(isEncounterVictory({ outcome: 'victory' })).toBe(true);
    expect(isEncounterVictory({ outcome: 'success' })).toBe(true);
    // A fled foe is NOT a victory, so enemy/mob-defeat never fires on a flee.
    expect(isEncounterVictory({ outcome: 'fled', outcomeTier: 'success' })).toBe(false);
    expect(isEncounterVictory({ outcome: 'escaped' })).toBe(false);
  });

  test('getFleeReposition returns the pre-encounter tile only on a real flee', () => {
    // A successful flee with a captured pre-encounter tile repositions there.
    expect(getFleeReposition({ outcome: 'fled' }, world)).toEqual(world);
    expect(getFleeReposition({ outcome: 'escaped' }, world)).toEqual(world);
    // A win never repositions.
    expect(getFleeReposition({ outcome: 'victory' }, world)).toBeNull();
    // A flee with no captured tile (stationary/legacy encounter) does not move.
    expect(getFleeReposition({ outcome: 'fled' }, null)).toBeNull();
    // A caught (failed) flee stays put.
    expect(getFleeReposition({ outcomeTier: 'failure' }, world)).toBeNull();
  });
});
