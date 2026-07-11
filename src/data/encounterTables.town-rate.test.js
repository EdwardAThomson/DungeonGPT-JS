import {
  biomeEncounterChance,
  environmentalEncounterChance,
  revisitEncounterMultiplier
} from './encounterTables';

// Regression guard for the town random-encounter rate.
//
// Town movement is tile-by-tile, so every step entered rolls for an encounter
// independently. A high base biome chance therefore compounds fast: a ~6-tile
// cross-town walk with a per-step chance p is 1 - (1 - p)^6 to trigger at least
// one encounter. These constants were tuned down (biome 0.40 -> 0.12,
// environmental 0.05 -> 0.02) so a cross-town walk is roughly 50/50 rather than
// near-certain. This test fails if either constant is bumped back up carelessly.
describe('town encounter rate tuning', () => {
  it('keeps the town biome encounter chance at the tuned low value', () => {
    expect(biomeEncounterChance.town).toBe(0.12);
  });

  it('keeps the town environmental encounter chance at the tuned low value', () => {
    expect(environmentalEncounterChance.town).toBe(0.02);
  });

  it('keeps the effective per-step town chance under a sane ceiling', () => {
    // Approximate per-step probability using the same inputs the generator uses:
    // the base biome chance reduced by the revisit multiplier, plus the small
    // environmental contribution. This is a rough ceiling, not an exact model of
    // the roll-by-roll logic; it exists to catch a careless bump of the tuned
    // constants, not to pin the internals.
    const effectivePerStep =
      biomeEncounterChance.town * revisitEncounterMultiplier.town +
      environmentalEncounterChance.town;

    expect(effectivePerStep).toBeLessThanOrEqual(0.12);
  });
});
