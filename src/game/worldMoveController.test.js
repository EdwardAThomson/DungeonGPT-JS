import {
  applyWorldMapMove,
  buildMovementSystemMessage,
  buildPendingNarrativeTile,
  buildPoiEncounter,
  getAreaVisitState,
  isAdjacentWorldMove,
  trackAreaVisits
} from './worldMoveController';

describe('worldMoveController', () => {
  it('validates adjacency for orthogonal and diagonal moves', () => {
    const origin = { x: 5, y: 5 };
    expect(isAdjacentWorldMove(origin, 6, 5)).toBe(true);
    expect(isAdjacentWorldMove(origin, 6, 6)).toBe(true);
    expect(isAdjacentWorldMove(origin, 5, 5)).toBe(false);
    expect(isAdjacentWorldMove(origin, 7, 5)).toBe(false);
  });

  it('applies move and reports previous exploration state', () => {
    const map = [
      [{ x: 0, y: 0, isExplored: false, biome: 'plains' }, { x: 1, y: 0, isExplored: true, biome: 'forest' }],
      [{ x: 0, y: 1, isExplored: false, biome: 'hills' }, { x: 1, y: 1, isExplored: false, biome: 'swamp' }]
    ];

    const firstVisit = applyWorldMapMove(map, 0, 1);
    expect(firstVisit.wasExplored).toBe(false);
    expect(firstVisit.targetTile.isExplored).toBe(true);

    const revisit = applyWorldMapMove(firstVisit.newMap, 0, 1);
    expect(revisit.wasExplored).toBe(true);
  });

  it('tracks first-time biome and town visits only', () => {
    const trackBiomeVisit = jest.fn();
    const trackTownVisit = jest.fn();

    trackAreaVisits({
      biomeType: 'plains',
      townName: 'Oakrest',
      isBiomeVisited: false,
      isTownVisited: false,
      trackBiomeVisit,
      trackTownVisit
    });
    expect(trackBiomeVisit).toHaveBeenCalledWith('plains');
    expect(trackTownVisit).toHaveBeenCalledWith('Oakrest');

    trackAreaVisits({
      biomeType: 'plains',
      townName: 'Oakrest',
      isBiomeVisited: true,
      isTownVisited: true,
      trackBiomeVisit,
      trackTownVisit
    });
    expect(trackBiomeVisit).toHaveBeenCalledTimes(1);
    expect(trackTownVisit).toHaveBeenCalledTimes(1);
  });

  it('computes area visit state from visited sets', () => {
    const visitedBiomes = new Set(['forest']);
    const visitedTowns = new Set(['Silverkeep']);

    expect(
      getAreaVisitState({
        biomeType: 'forest',
        townName: 'Silverkeep',
        visitedBiomes,
        visitedTowns
      })
    ).toEqual({ isBiomeVisited: true, isTownVisited: true });
  });

  it('builds POI encounter metadata with canEnter rules', () => {
    expect(buildPoiEncounter({ biome: 'plains' })).toBeNull();

    const townEncounter = buildPoiEncounter({
      poi: 'town',
      poiType: 'town',
      townName: 'Briarwatch',
      descriptionSeed: 'A busy trade hub.'
    });
    expect(townEncounter.canEnter).toBe(true);
    expect(townEncounter.name).toBe('Briarwatch');

    const caveEncounter = buildPoiEncounter({
      poi: 'cave',
      poiType: 'cave'
    });
    expect(caveEncounter.canEnter).toBe(false);
  });

  it('formats movement system messages for towns and biomes', () => {
    const townMessage = buildMovementSystemMessage({
      targetTile: { poi: 'town', townName: 'Riverside', townSize: 'village' },
      biomeType: 'plains',
      clickedX: 2,
      clickedY: 3
    });
    expect(townMessage.content).toContain('Riverside');

    const biomeMessage = buildMovementSystemMessage({
      targetTile: { poi: null },
      biomeType: 'mountains',
      clickedX: 4,
      clickedY: 5
    });
    expect(biomeMessage.content).toBe('You moved to mountains (4, 5).');
  });

  it('marks pending narrative when entering unvisited areas', () => {
    const pending = buildPendingNarrativeTile({
      targetTile: { biome: 'forest' },
      clickedX: 9,
      clickedY: 1,
      biomeType: 'forest',
      townName: null,
      isBiomeVisited: false,
      isTownVisited: true
    });
    expect(pending.needsAiDescription).toBe(true);
    expect(pending.coords).toEqual({ x: 9, y: 1 });
  });
});
