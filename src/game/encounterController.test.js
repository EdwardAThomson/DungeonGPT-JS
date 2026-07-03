import {
  ageNarrativeHook,
  NARRATIVE_HOOK_PERSIST_MOVES,
  planWorldTileEncounterFlow
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
