// Quest chaining Phase 1: the linked "Chapter 2" save. Store access is mocked so
// these tests exercise the pure builders + orchestration without IndexedDB/network.

jest.mock('../services/conversationsApi', () => ({
  conversationsApi: {
    save: jest.fn(async (payload) => payload),
    getById: jest.fn(async () => null),
  },
}));

import {
  isEligibleForChaining,
  chainRootName,
  resolveCompletedTemplateId,
  getPartyLevel,
  getNextCampaignOptions,
  buildChainedSaveRow,
  startChainedCampaign,
} from './campaignChain';
import { storyTemplates } from '../data/storyTemplates';
import { conversationsApi } from '../services/conversationsApi';

const t1 = () => storyTemplates.find((t) => t.id === 'heroic-fantasy-t1');
const t2 = () => storyTemplates.find((t) => t.id === 'heroic-fantasy-t2');

const completedParent = (overrides = {}) => ({
  sessionId: 'game-111-parent',
  settings: {
    templateId: 'heroic-fantasy-t1',
    templateName: 'Heroic Fantasy — The Goblin Threat',
    campaignGoal: 'End the goblin threat',
    campaignComplete: true,
    saveName: 'Adventure',
    milestones: [{ id: 1, text: 'done', completed: true }],
    worldSeed: 111,
    ...overrides.settings,
  },
  heroes: overrides.heroes || [
    { heroId: 'h1', heroName: 'Vanya', characterClass: 'Warrior', level: 3, xp: 350, gold: 77, maxHP: 24, currentHP: 5, inventory: [{ key: 'sword', quantity: 1 }] },
  ],
  summary: overrides.summary !== undefined ? overrides.summary : 'They slew the Goblin Chieftain and saved Willowdale.',
  conversationName: overrides.conversationName || 'Adventure - 1/1/2026 10:00:00 AM',
});

beforeEach(() => {
  conversationsApi.save.mockClear();
  conversationsApi.getById.mockClear();
  conversationsApi.getById.mockResolvedValue(null);
});

describe('retroactive CTA visibility (isEligibleForChaining)', () => {
  it('is true exactly when the campaign is complete', () => {
    expect(isEligibleForChaining({ campaignComplete: true })).toBe(true);
    expect(isEligibleForChaining({ campaignComplete: false })).toBe(false);
    expect(isEligibleForChaining({})).toBe(false);
  });

  it('tolerates old/absent settings', () => {
    expect(isEligibleForChaining(null)).toBe(false);
    expect(isEligibleForChaining(undefined)).toBe(false);
  });

  it('rescues saves completed before chaining existed (no chain/templateId fields)', () => {
    expect(isEligibleForChaining({ campaignComplete: true, templateName: 'Heroic Fantasy — The Goblin Threat' })).toBe(true);
  });
});

describe('chainRootName', () => {
  it('uses the player-editable saveName root', () => {
    expect(chainRootName({ saveName: 'My Legend' })).toBe('My Legend');
  });

  it('strips an existing chapter suffix so chapters do not stack', () => {
    expect(chainRootName({ saveName: 'My Legend — Chapter 2' })).toBe('My Legend');
    expect(chainRootName({ saveName: 'My Legend - Chapter 3' })).toBe('My Legend');
  });

  it('falls back to parsing the display name, then the default', () => {
    expect(chainRootName({}, 'Old Save - 1/1/2026 10:00:00 AM')).toBe('Old Save');
    expect(chainRootName({}, null)).toBe('Adventure');
  });
});

describe('resolveCompletedTemplateId', () => {
  it('prefers the additive settings.templateId', () => {
    expect(resolveCompletedTemplateId({ templateId: 'heroic-fantasy-t1' })).toBe('heroic-fantasy-t1');
  });

  it('matches old saves by their templateName label', () => {
    expect(resolveCompletedTemplateId({ templateName: 'Heroic Fantasy — The Goblin Threat' })).toBe('heroic-fantasy-t1');
  });

  it('keeps unknown labels as the record (custom tales)', () => {
    expect(resolveCompletedTemplateId({ templateName: 'Custom Tale' })).toBe('Custom Tale');
    expect(resolveCompletedTemplateId({})).toBeNull();
  });
});

describe('getNextCampaignOptions (the picker catalog)', () => {
  const party = [{ heroId: 'h1', level: 3 }];

  it('puts the same-genre next tier first, flagged recommended', () => {
    const options = getNextCampaignOptions({ settings: completedParent().settings, party });
    expect(options.length).toBeGreaterThan(0);
    expect(options[0].template.id).toBe('heroic-fantasy-t2');
    expect(options[0].recommended).toBe(true);
  });

  it('excludes the completed campaign, prior chain chapters and comingSoon stubs', () => {
    const settings = { ...completedParent().settings, completedCampaigns: ['grimdark-survival-t1'] };
    const ids = getNextCampaignOptions({ settings, party }).map((o) => o.template.id);
    expect(ids).not.toContain('heroic-fantasy-t1'); // just completed
    expect(ids).not.toContain('grimdark-survival-t1'); // completed earlier in the chain
    expect(ids).not.toContain('heroic-fantasy-t3'); // comingSoon stub
  });

  it('flags premium templates as locked for free users (listed, not hidden)', () => {
    const options = getNextCampaignOptions({ settings: completedParent().settings, party });
    const desert = options.find((o) => o.template.id === 'desert-expedition-t1');
    expect(desert).toBeTruthy();
    expect(desert.premiumLocked).toBe(true);
  });

  it('warns (never blocks) on under-levelled picks', () => {
    const options = getNextCampaignOptions({
      settings: completedParent().settings,
      party: [{ heroId: 'h1', level: 1 }],
    });
    const next = options.find((o) => o.template.id === 'heroic-fantasy-t2');
    expect(next).toBeTruthy(); // still offered
    expect(next.underLeveled).toBe(true);
  });

  it('getPartyLevel reads both level spellings and defaults to 1', () => {
    expect(getPartyLevel([{ level: 2 }, { heroLevel: 4 }])).toBe(4);
    expect(getPartyLevel([])).toBe(1);
    expect(getPartyLevel(null)).toBe(1);
  });
});

describe('buildChainedSaveRow', () => {
  it('builds a NEW linked save: fresh session, chain schema, carried healed party, prologue', () => {
    const parent = completedParent();
    const { payload, row, prologue } = buildChainedSaveRow({ template: t2(), parent, provider: 'cf-workers', model: 'gpt-oss' });

    // fresh session id (this is also what guarantees a fresh RAG index)
    expect(row.sessionId).toMatch(/^game-/);
    expect(row.sessionId).not.toBe(parent.sessionId);

    // chain schema (additive)
    expect(payload.gameSettings.chain).toEqual({ parentSaveId: 'game-111-parent', chapter: 2 });
    expect(payload.gameSettings.completedCampaigns).toEqual(['heroic-fantasy-t1']);
    expect(payload.gameSettings.templateId).toBe('heroic-fantasy-t2');

    // save naming: "<root> — Chapter <n>"
    expect(payload.gameSettings.saveName).toBe('Adventure — Chapter 2');
    expect(payload.conversationName).toMatch(/^Adventure — Chapter 2 - /);

    // carried party: healed, everything conserved, decoupled from the parent
    expect(payload.selectedHeroes).toHaveLength(1);
    const hero = payload.selectedHeroes[0];
    expect(hero.currentHP).toBe(hero.maxHP);
    expect(hero.isDefeated).toBe(false);
    expect(hero.xp).toBe(350);
    expect(hero.level).toBe(3);
    expect(hero.gold).toBe(77);
    expect(hero.inventory).toEqual(parent.heroes[0].inventory);
    expect(hero.inventory).not.toBe(parent.heroes[0].inventory);
    expect(parent.heroes[0].currentHP).toBe(5); // parent untouched

    // fresh world + valid starting position, marked explored
    expect(Array.isArray(payload.worldMap)).toBe(true);
    const { x, y } = payload.playerPosition;
    expect(payload.worldMap[y][x].isExplored).toBe(true);

    // the conversation opens with the deterministic prologue
    expect(payload.conversation).toEqual([{ role: 'ai', content: prologue }]);
    expect(prologue).toContain('**Chapter 2**');
    expect(prologue).toContain('Goblin Chieftain'); // distilled from the parent summary

    // sub-maps carry the pre-generated towns and a clean world-level state
    expect(payload.sub_maps.currentMapLevel).toBe('world');
    expect(payload.sub_maps.isInsideTown).toBe(false);
    expect(Object.keys(payload.sub_maps.townMapsCache).length).toBeGreaterThan(0);

    // provider/model carried; summary starts fresh
    expect(payload.provider).toBe('cf-workers');
    expect(payload.currentSummary).toBe('');

    // row mirrors the persisted shape the load path expects
    expect(row.world_map).toBe(payload.worldMap);
    expect(row.game_settings).toBe(payload.gameSettings);
    expect(row.conversation_data).toBe(payload.conversation);
    expect(row.selected_heroes).toBe(payload.selectedHeroes);
  });

  it('numbers chapter 3 from a chapter-2 parent and re-strips the name suffix', () => {
    const parent = completedParent({
      settings: {
        chain: { parentSaveId: 'game-000-root', chapter: 2 },
        completedCampaigns: ['grimdark-survival-t1'],
        saveName: 'Adventure — Chapter 2',
        templateId: 'heroic-fantasy-t1',
      },
    });
    const { payload } = buildChainedSaveRow({ template: t2(), parent });
    expect(payload.gameSettings.chain.chapter).toBe(3);
    expect(payload.gameSettings.saveName).toBe('Adventure — Chapter 3');
    expect(payload.gameSettings.completedCampaigns).toEqual(['grimdark-survival-t1', 'heroic-fantasy-t1']);
  });

  it('works retroactively for old completed saves missing templateId/saveName', () => {
    const parent = completedParent({
      settings: {
        templateId: undefined,
        templateName: 'Heroic Fantasy — The Goblin Threat',
        saveName: undefined,
      },
      conversationName: 'Goblin Run - 6/1/2026 9:00:00 AM',
    });
    delete parent.settings.templateId;
    delete parent.settings.saveName;
    const { payload } = buildChainedSaveRow({ template: t2(), parent });
    expect(payload.gameSettings.completedCampaigns).toEqual(['heroic-fantasy-t1']);
    expect(payload.gameSettings.saveName).toBe('Goblin Run — Chapter 2');
  });
});

describe('startChainedCampaign', () => {
  it('persists the new save through the normal save path and returns the row', async () => {
    const parent = completedParent();
    const row = await startChainedCampaign({ template: t2(), parent, provider: 'cf-workers', model: 'gpt-oss' });

    expect(conversationsApi.save).toHaveBeenCalled();
    const savedPayload = conversationsApi.save.mock.calls[0][0];
    expect(savedPayload.sessionId).toBe(row.sessionId);
    expect(savedPayload.gameSettings.chain.parentSaveId).toBe(parent.sessionId);
    expect(localStorage.getItem('activeGameSessionId')).toBe(row.sessionId);
  });

  it('stamps the parent additively (continuedInSessionId) without other changes', async () => {
    const parent = completedParent();
    const parentRow = {
      sessionId: parent.sessionId,
      session_id: parent.sessionId,
      conversation_name: 'Adventure - 1/1/2026 10:00:00 AM',
      conversation_data: [{ role: 'ai', content: 'old world' }],
      game_settings: parent.settings,
      selected_heroes: parent.heroes,
      summary: parent.summary,
      world_map: [[{ biome: 'plains' }]],
      player_position: { x: 0, y: 0 },
      sub_maps: { currentMapLevel: 'world' },
      provider: 'cf-workers',
      model: 'gpt-oss',
      timestamp: '2026-01-01T10:00:00.000Z',
    };
    conversationsApi.getById.mockResolvedValue(parentRow);

    const row = await startChainedCampaign({ template: t2(), parent });

    // second save call is the parent stamp
    expect(conversationsApi.save).toHaveBeenCalledTimes(2);
    const stamp = conversationsApi.save.mock.calls[1][0];
    expect(stamp.sessionId).toBe(parent.sessionId);
    expect(stamp.gameSettings.continuedInSessionId).toBe(row.sessionId);
    // everything else preserved (world untouched, never destroyed)
    expect(stamp.gameSettings.campaignComplete).toBe(true);
    expect(stamp.worldMap).toBe(parentRow.world_map);
    expect(stamp.conversation).toBe(parentRow.conversation_data);
    expect(stamp.timestamp).toBe(parentRow.timestamp);
  });

  it('still succeeds when the parent stamp fails (stamp is best-effort)', async () => {
    conversationsApi.getById.mockRejectedValue(new Error('offline'));
    const row = await startChainedCampaign({ template: t2(), parent: completedParent() });
    expect(row.sessionId).toMatch(/^game-/);
    expect(conversationsApi.save).toHaveBeenCalledTimes(1); // only the new save
  });

  it('skips the stamp when the parent settings are unreadable (never risk the old save)', async () => {
    conversationsApi.getById.mockResolvedValue({
      sessionId: 'game-111-parent',
      game_settings: '{not json',
      conversation_data: [],
    });
    await startChainedCampaign({ template: t2(), parent: completedParent() });
    expect(conversationsApi.save).toHaveBeenCalledTimes(1);
  });
});
