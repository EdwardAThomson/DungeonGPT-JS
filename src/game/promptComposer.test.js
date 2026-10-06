import { DM_PROTOCOL } from '../data/prompts';
import {
  formatPartyInfo,
  buildLocationInfo,
  buildRegionThemeInfo,
  composeMovementNarrativePrompt,
  composeSiteLookPrompt,
  nearbySiteFeatures
} from './promptComposer';

describe('promptComposer', () => {
  it('formats party info as comma-separated hero names and classes', () => {
    const result = formatPartyInfo([
      { characterName: 'Aelin', characterClass: 'Ranger' },
      { characterName: 'Bram', characterClass: 'Cleric' }
    ]);

    expect(result).toBe('Aelin (Ranger), Bram (Cleric)');
  });

  it('omits a condition tag for heroes at or near full health', () => {
    const result = formatPartyInfo([
      { characterName: 'Aelin', characterClass: 'Ranger', currentHP: 30, maxHP: 30 },
      { characterName: 'Bram', characterClass: 'Cleric', currentHP: 28, maxHP: 30 }
    ]);

    expect(result).toBe('Aelin (Ranger), Bram (Cleric)');
  });

  it('annotates wounded heroes with a coarse condition band, not raw HP', () => {
    const result = formatPartyInfo([
      { characterName: 'Aelin', characterClass: 'Ranger', currentHP: 20, maxHP: 30 }, // 66% -> injured
      { characterName: 'Bram', characterClass: 'Cleric', currentHP: 12, maxHP: 30 },  // 40% -> badly wounded
      { characterName: 'Nyx', characterClass: 'Rogue', currentHP: 4, maxHP: 30 }      // 13% -> critical
    ]);

    expect(result).toBe(
      'Aelin (Ranger) [injured], ' +
      'Bram (Cleric) [badly wounded], ' +
      'Nyx (Rogue) [critically wounded - near death]'
    );
    expect(result).not.toContain('30');
    expect(result).not.toContain('12');
  });

  it('marks defeated heroes regardless of HP fields', () => {
    const result = formatPartyInfo([
      { characterName: 'Aelin', characterClass: 'Ranger', currentHP: 0, maxHP: 30 },
      { characterName: 'Bram', characterClass: 'Cleric', isDefeated: true, currentHP: 5, maxHP: 30 }
    ]);

    expect(result).toBe(
      'Aelin (Ranger) [DEFEATED - unconscious/incapacitated, cannot act], ' +
      'Bram (Cleric) [DEFEATED - unconscious/incapacitated, cannot act]'
    );
  });

  it('builds location info for towns with revisit guidance', () => {
    const info = buildLocationInfo({
      tile: {
        biome: 'plains',
        poi: 'town',
        townName: 'Stoneford',
        townSize: 'village',
        descriptionSeed: 'A calm market road.'
      },
      coords: { x: 4, y: 7 },
      isNewArea: false
    });

    expect(info).toContain('coordinates (4, 7)');
    expect(info).toContain('Stoneford');
    expect(info).toContain('village');
    expect(info).toContain('Keep the description brief');
  });

  it('composes full movement prompt with DM protocol and recent AI context', () => {
    const { prompt, fullPrompt } = composeMovementNarrativePrompt({
      tile: {
        biome: 'forest',
        poi: null,
        descriptionSeed: 'Ancient trees and drifting fog.'
      },
      coords: { x: 1, y: 2 },
      settings: {
        shortDescription: 'A haunted woodland frontier',
        grimnessLevel: 'Moody',
        campaignGoal: 'Find the moon shrine',
        milestones: ['Reach the shrine', 'Recover the relic']
      },
      selectedHeroes: [{ characterName: 'Nyx', characterClass: 'Rogue' }],
      currentSummary: 'The party crossed a broken bridge.',
      narrativeEncounter: null,
      worldMap: [],
      isNewArea: true,
      conversation: [
        { role: 'ai', content: 'Mists coil between roots.' },
        { role: 'user', content: 'I move north.' },
        { role: 'ai', content: 'A raven watches from an oak.' }
      ],
      includeRecentContext: true
    });

    expect(prompt).toContain('Game Context:');
    expect(prompt).toContain('Campaign Goal: Find the moon shrine');
    expect(prompt).toContain('Active Milestones: Reach the shrine; Recover the relic');
    expect(prompt).toContain('Recent descriptions (DO NOT repeat similar phrases):');
    expect(fullPrompt.startsWith(DM_PROTOCOL)).toBe(true);
  });

  it('surfaces wounded party condition in the composed prompt without leaking raw HP', () => {
    const { prompt } = composeMovementNarrativePrompt({
      tile: { biome: 'forest', poi: null, descriptionSeed: 'Dim woods.' },
      coords: { x: 3, y: 3 },
      settings: { shortDescription: 'A grim march', grimnessLevel: 'Moody', milestones: [] },
      selectedHeroes: [{ characterName: 'Nyx', characterClass: 'Rogue', currentHP: 4, maxHP: 30 }],
      currentSummary: 'They limp onward after the ambush.',
      narrativeEncounter: null,
      worldMap: [],
      isNewArea: true,
      conversation: [],
      includeRecentContext: false
    });

    expect(prompt).toContain('Nyx (Rogue) [critically wounded - near death]');
    expect(prompt).not.toContain('4/30');
  });

  it('can omit recent AI context when disabled', () => {
    const { prompt } = composeMovementNarrativePrompt({
      tile: {
        biome: 'plains',
        poi: null,
        descriptionSeed: 'Open grassland'
      },
      coords: { x: 0, y: 0 },
      settings: {
        shortDescription: 'Open frontier',
        grimnessLevel: 'Neutral',
        milestones: []
      },
      selectedHeroes: [{ characterName: 'Tor', characterClass: 'Fighter' }],
      currentSummary: 'A quiet dawn.',
      narrativeEncounter: null,
      worldMap: [],
      isNewArea: true,
      conversation: [{ role: 'ai', content: 'Should not appear.' }],
      includeRecentContext: false
    });

    expect(prompt).not.toContain('Recent descriptions (DO NOT repeat similar phrases):');
  });

  it('describes a desert region but stays silent for grassland (default)', () => {
    expect(buildRegionThemeInfo('grassland')).toBe('');
    expect(buildRegionThemeInfo(undefined)).toBe('');
    expect(buildRegionThemeInfo('desert')).toContain('desert');
  });

  it('injects the desert region descriptor into the composed prompt', () => {
    const base = {
      tile: { biome: 'desert', poi: null, descriptionSeed: 'Endless dunes' },
      coords: { x: 2, y: 2 },
      selectedHeroes: [{ characterName: 'Tor', characterClass: 'Fighter' }],
      currentSummary: 'The sun beats down.',
      narrativeEncounter: null,
      worldMap: [],
      isNewArea: true,
      conversation: [],
      includeRecentContext: false
    };
    const desert = composeMovementNarrativePrompt({
      ...base,
      settings: { shortDescription: 'A trek across the sands', grimnessLevel: 'Neutral', milestones: [], theme: 'desert' }
    });
    expect(desert.prompt).toContain('arid desert');

    const grassland = composeMovementNarrativePrompt({
      ...base,
      settings: { shortDescription: 'A trek across the sands', grimnessLevel: 'Neutral', milestones: [] }
    });
    expect(grassland.prompt).not.toContain('arid desert');
  });
});

describe('composeSiteLookPrompt', () => {
  const grid = (w, h) => Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => ({ x, y, type: 'floor', poi: null })));
  const cave = () => {
    const mapData = grid(10, 10);
    mapData[5][6].poi = 'mushroom';
    mapData[5][7].poi = 'mushroom';
    mapData[1][1].poi = 'crystal'; // too far
    return { name: 'Echo Hollow', type: 'cave', mapData, entryPoint: { x: 5, y: 9 } };
  };
  const settings = { shortDescription: 'A dark land', grimnessLevel: 'Grim' };

  it('describes the site by name, not the world tile', () => {
    const { prompt, fullPrompt } = composeSiteLookPrompt({ siteMap: cave(), sitePosition: { x: 5, y: 5 }, biome: 'plains', settings, currentSummary: 'x' });
    expect(fullPrompt.startsWith(DM_PROTOCOL)).toBe(true);
    expect(prompt).toContain('"Echo Hollow"');
    expect(prompt).toContain('inside a cave');
    expect(prompt).toContain('no sky');
    expect(prompt).not.toContain('plains');
    expect(prompt).not.toMatch(/Encounter Hook/);
    expect(prompt).toContain('pale mushrooms');
    expect(prompt).not.toContain('crystals');
    expect(prompt).toContain('Tone examples');
  });

  it('gives open-air sites their surrounding biome', () => {
    const ruins = { ...cave(), name: 'Old Keep', type: 'ruins' };
    const { prompt } = composeSiteLookPrompt({ siteMap: ruins, sitePosition: { x: 5, y: 8 }, biome: 'desert', settings });
    expect(prompt).toContain('among old ruins');
    expect(prompt).toContain('surrounding land is desert');
    expect(prompt).toContain('near the way they came in');
    expect(prompt).not.toContain('no sky');
  });

  it('lists each nearby feature once, nearest first', () => {
    expect(nearbySiteFeatures(cave().mapData, { x: 5, y: 5 })).toEqual(['pale mushrooms']);
    expect(nearbySiteFeatures(null, { x: 0, y: 0 })).toEqual([]);
  });
});

describe('composeMovementNarrativePrompt look mode', () => {
  const caveTile = { biome: 'plains', poi: 'cave_entrance', x: 4, y: 2 };
  const worldMap = Array.from({ length: 5 }, (_, y) => Array.from({ length: 6 }, (_, x) => ({ x, y, biome: 'plains' })));
  const settings = { shortDescription: 'A land', grimnessLevel: 'Gritty' };

  it('frames a look at a cave tile as standing at the named cave, not arriving', () => {
    const { prompt } = composeMovementNarrativePrompt({ tile: caveTile, coords: { x: 4, y: 2 }, settings, worldMap, look: true, placeName: 'Echo Hollow' });
    expect(prompt).toContain('looks around where they stand');
    expect(prompt).toContain('the dark mouth of a cave, known as "Echo Hollow"');
    expect(prompt).toContain('Do not describe the party travelling');
    expect(prompt).not.toContain('moves to a new location');
    expect(prompt).toContain('Tone examples');
  });

  it('places a hook rolled on another tile a short way back, in its direction', () => {
    const hook = { aiContext: 'A narrow pass.', origin: { x: 3, y: 1 } };
    const { prompt } = composeMovementNarrativePrompt({ tile: caveTile, coords: { x: 4, y: 2 }, settings, worldMap, narrativeEncounter: hook, look: true });
    expect(prompt).toContain('a short way back to the north-west');
    const here = composeMovementNarrativePrompt({ tile: caveTile, coords: { x: 4, y: 2 }, settings, worldMap, narrativeEncounter: { ...hook, origin: { x: 4, y: 2 } }, look: true });
    expect(here.prompt).not.toContain('short way back');
  });

  it('leaves the arrival prompt unchanged by default', () => {
    const { prompt } = composeMovementNarrativePrompt({ tile: caveTile, coords: { x: 4, y: 2 }, settings, worldMap });
    expect(prompt).toContain('moves to a new location');
    expect(prompt).not.toContain('Right here is');
    expect(prompt).not.toContain('Tone examples');
  });
});
