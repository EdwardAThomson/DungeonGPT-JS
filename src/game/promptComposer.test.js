import { DM_PROTOCOL } from '../data/prompts';
import {
  formatPartyInfo,
  buildLocationInfo,
  composeMovementNarrativePrompt
} from './promptComposer';

describe('promptComposer', () => {
  it('formats party info as comma-separated hero names and classes', () => {
    const result = formatPartyInfo([
      { characterName: 'Aelin', characterClass: 'Ranger' },
      { characterName: 'Bram', characterClass: 'Cleric' }
    ]);

    expect(result).toBe('Aelin (Ranger), Bram (Cleric)');
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
    expect(prompt).toContain('Key Milestones to achieve: Reach the shrine, Recover the relic');
    expect(prompt).toContain('Recent descriptions (DO NOT repeat similar phrases):');
    expect(fullPrompt.startsWith(DM_PROTOCOL)).toBe(true);
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
});
