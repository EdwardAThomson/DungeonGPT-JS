import { tileEncounterChance, journeyEncounterStats } from './travelOdds';
import { PASS_THROUGH_ENCOUNTER_MULTIPLIER, ROAD_ENCOUNTER_MULTIPLIER } from '../utils/encounterGenerator';

describe('travelOdds', () => {
  it('a one-tile move is just the tile chance', () => {
    const tile = tileEncounterChance({ biome: 'plains', firstVisit: true, moves: 0 });
    const j = journeyEncounterStats({ tiles: 1, biome: 'plains' });
    expect(j.expected).toBeCloseTo(tile, 10);
    expect(j.pClear).toBeCloseTo(1 - tile, 10);
  });

  it('revisited ground and a lower multiplier both mean fewer encounters', () => {
    const fresh = journeyEncounterStats({ tiles: 6 });
    const revisit = journeyEncounterStats({ tiles: 6, firstVisit: false });
    const halved = journeyEncounterStats({ tiles: 6, multiplier: 0.5 });
    expect(revisit.expected).toBeLessThan(fresh.expected);
    expect(halved.expected).toBeLessThan(fresh.expected);
    expect(halved.pClear).toBeGreaterThan(fresh.pClear);
  });

  it('a maxed quiet-moves counter raises the odds (what the leave-town reset avoids)', () => {
    const reset = journeyEncounterStats({ tiles: 3, startMoves: 0 });
    const maxed = journeyEncounterStats({ tiles: 3, startMoves: 5 });
    expect(maxed.expected).toBeGreaterThan(reset.expected);
  });

  it('the shipped multiplier makes a typical journey usually interrupted at most once', () => {
    // 6 new plains tiles, counter reset on leaving town.
    const j = journeyEncounterStats({ tiles: 6, multiplier: PASS_THROUGH_ENCOUNTER_MULTIPLIER });
    expect(j.expected).toBeLessThan(1.5);
  });
});

describe('road odds', () => {
  it('a road journey is markedly safer than the same journey cross-country', () => {
    const open = journeyEncounterStats({ tiles: 6, multiplier: PASS_THROUGH_ENCOUNTER_MULTIPLIER });
    const road = journeyEncounterStats({ tiles: 6, multiplier: PASS_THROUGH_ENCOUNTER_MULTIPLIER * ROAD_ENCOUNTER_MULTIPLIER });
    expect(road.expected).toBeLessThan(open.expected * 0.75);
    expect(road.pClear).toBeGreaterThan(open.pClear);
  });
});
