// Load-path test for useGameSession's settings hydration, focused on the #45
// side-quest backfill: a loaded save whose settings predate the current SIDE_QUESTS
// pool gets topped up (as 'available') before setSettings fires; a stamped save is
// left alone. The pure rules live in questEngine (see questEngine.test.js); this
// covers the wiring only.

import { renderHook } from '@testing-library/react';
import useGameSession from './useGameSession';
import { SIDE_QUESTS } from '../data/sideQuests';

// conversationsApi drags in the supabase client + env; the hydration path under test
// never calls it (it is only used by saveConversationToBackend).
jest.mock('../services/conversationsApi', () => ({
  conversationsApi: { save: jest.fn() },
}));

const b = (buildingType) => ({ type: 'building', buildingType });
const worldMap = [[
  { poi: 'town', townName: 'Aldwyn' },
  { poi: 'town', townName: 'Brimford' },
  { poi: 'cave_entrance' },
  { poi: 'ruins' },
]];
const subMaps = {
  townMapsCache: {
    Aldwyn: { mapData: [['inn', 'tavern', 'shop', 'townhall', 'market', 'mill'].map(b)] },
    Brimford: { mapData: [['temple', 'shrine', 'library', 'archives', 'blacksmith', 'alchemist'].map(b)] },
  },
};

const makeConversation = (gameSettings, extra = {}) => ({
  sessionId: 'game-test-45',
  game_settings: gameSettings,
  world_map: worldMap,
  sub_maps: subMaps,
  selected_heroes: [{ heroId: 'h1', level: 4 }, { heroId: 'h2', level: 2 }],
  conversation_data: [{ role: 'ai', content: 'Once upon a time…' }],
  ...extra,
});

const renderSession = (conversation) => {
  const setSettings = jest.fn();
  const utils = renderHook(() =>
    useGameSession(conversation, setSettings, jest.fn(), jest.fn(), null)
  );
  return { setSettings, ...utils };
};

afterEach(() => localStorage.clear());

describe('useGameSession — side-quest backfill on load (#45)', () => {
  test('an unstamped save hydrates with appended quests + the pool-size stamp, and reports the count', () => {
    const existing = [{ id: 'lost_heirloom', status: 'active', giver: { building: ['inn', 'tavern'] }, milestones: [] }];
    const conversation = makeConversation({ worldSeed: 4242, sideQuests: existing });
    const { setSettings, result } = renderSession(conversation);

    expect(setSettings).toHaveBeenCalledTimes(1);
    const hydrated = setSettings.mock.calls[0][0];
    expect(hydrated.sideQuestPoolSize).toBe(SIDE_QUESTS.length);
    // existing quest untouched and first; new quests appended as 'available'
    expect(hydrated.sideQuests[0]).toBe(existing[0]);
    expect(hydrated.sideQuests.length).toBeGreaterThan(1);
    hydrated.sideQuests.slice(1).forEach((q) => {
      expect(q.status).toBe('available');
      expect(q.id).not.toBe('lost_heirloom');
    });
    // the hook reports how many were added, for Game.js's single system line
    expect(result.current.sideQuestsBackfilled).toBe(hydrated.sideQuests.length - 1);
  });

  test('a stamped save (pool unchanged) hydrates verbatim: no additions, no notice', () => {
    const settings = {
      worldSeed: 4242,
      sideQuests: [{ id: 'prove_mettle', status: 'completed' }],
      sideQuestPoolSize: SIDE_QUESTS.length,
    };
    const conversation = makeConversation(settings);
    const { setSettings, result } = renderSession(conversation);

    expect(setSettings).toHaveBeenCalledTimes(1);
    expect(setSettings.mock.calls[0][0]).toBe(settings); // same reference: cheap skip
    expect(result.current.sideQuestsBackfilled).toBe(0);
  });

  test('string-form game_settings and world_map (older rows) still backfill', () => {
    const conversation = makeConversation(
      JSON.stringify({ worldSeed: 99, sideQuests: [] }),
      { world_map: worldMap, sub_maps: JSON.stringify(subMaps) }
    );
    const { setSettings, result } = renderSession(conversation);

    const hydrated = setSettings.mock.calls[0][0];
    expect(hydrated.sideQuests.length).toBeGreaterThan(0);
    expect(hydrated.sideQuestPoolSize).toBe(SIDE_QUESTS.length);
    expect(result.current.sideQuestsBackfilled).toBe(hydrated.sideQuests.length);
  });

  test('a save with no world map hydrates untouched (retry on a later good load)', () => {
    const settings = { worldSeed: 7, sideQuests: [] };
    const conversation = makeConversation(settings, { world_map: undefined });
    const { setSettings, result } = renderSession(conversation);

    expect(setSettings.mock.calls[0][0]).toBe(settings);
    expect(setSettings.mock.calls[0][0].sideQuestPoolSize).toBeUndefined();
    expect(result.current.sideQuestsBackfilled).toBe(0);
  });

  test('no loadedConversation (brand-new game): settings are never touched', () => {
    const { setSettings, result } = renderSession(null);
    expect(setSettings).not.toHaveBeenCalled();
    expect(result.current.sideQuestsBackfilled).toBe(0);
  });
});
