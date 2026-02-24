import { buildMovementPrompt, messageContainsEngagement } from './promptBuilder';

describe('promptBuilder', () => {
  it('includes surrounding terrain context when world map is provided', () => {
    const worldMap = [
      [
        { x: 0, y: 0, biome: 'plains' },
        { x: 1, y: 0, biome: 'forest' },
        { x: 2, y: 0, biome: 'mountain', mountainName: 'Iron Peaks' }
      ],
      [
        { x: 0, y: 1, biome: 'town', townName: 'Oakridge' },
        { x: 1, y: 1, biome: 'plains' },
        { x: 2, y: 1, biome: 'water' }
      ],
      [
        { x: 0, y: 2, biome: 'beach' },
        { x: 1, y: 2, biome: 'forest' },
        { x: 2, y: 2, biome: 'plains' }
      ]
    ];

    const prompt = buildMovementPrompt(
      { x: 1, y: 1, biome: 'plains' },
      { grimnessLevel: 'Gritty' },
      null,
      worldMap
    );

    expect(prompt).toContain('Surrounding Terrain');
    expect(prompt).toContain('North: forest');
    expect(prompt).toContain('West: Oakridge (town)');
    expect(prompt).toContain('East: water');
    expect(prompt).toContain('South: forest');
  });

  it('injects narrative encounter hook context when provided', () => {
    const prompt = buildMovementPrompt(
      { x: 3, y: 4, biome: 'forest' },
      { grimnessLevel: 'Dark' },
      { aiContext: 'A ruined shrine emits a low hum.' },
      null
    );

    expect(prompt).toContain('IMPORTANT - Encounter Hook');
    expect(prompt).toContain('A ruined shrine emits a low hum.');
  });

  it('detects user engagement attempts for narrative encounter hooks', () => {
    const encounter = { hook: 'merchant caravan' };

    expect(messageContainsEngagement('I approach the merchant caravan carefully.', encounter)).toBe(true);
    expect(messageContainsEngagement('I wait and look around.', encounter)).toBe(false);
  });
});
