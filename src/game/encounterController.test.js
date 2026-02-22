import { planWorldTileEncounterFlow } from './encounterController';

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
