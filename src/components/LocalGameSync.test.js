// Guards the B2 guest-game-sync mapping: a guest game stored locally must survive
// the round-trip back to a cloud save payload with no field dropped or renamed.
// mapPayloadToRow (localGameStore, what we WRITE) and rowToPayload (what we READ
// back to upload) have to be inverses over the persisted business fields, and the
// upload payload has to match the canonical save shape used by useGameSession.

import { rowToPayload } from './LocalGameSync';
import { mapPayloadToRow } from '../services/localGameStore';

// Mirrors the canonical payload built in useGameSession.saveConversationToBackend.
const canonicalPayload = () => ({
  sessionId: 'sess-abc-123',
  conversationName: 'Adventure - 6/23/2026 4:20:00 PM',
  conversation: [
    { role: 'system', content: 'The party stands at the edge of Willowdale.' },
    { role: 'user', content: 'look around' },
  ],
  gameSettings: { templateName: 'The Cursed Village', campaignGoal: 'Lift the curse', milestones: [] },
  selectedHeroes: [{ id: 'hero-1', heroName: 'Bryn', heroClass: 'Ranger' }],
  currentSummary: 'They have just arrived.',
  worldMap: { width: 20, height: 20, tiles: [{ x: 0, y: 0, biome: 'forest' }] },
  playerPosition: { x: 3, y: 5 },
  sub_maps: { 'town-willowdale': { buildings: [] } },
  provider: 'cf-workers',
  model: 'gpt-oss',
  timestamp: '2026-06-23T16:20:00.000Z',
});

describe('LocalGameSync payload mapping (B2)', () => {
  test('write-then-read round-trip preserves every persisted field', () => {
    const payload = canonicalPayload();
    const row = mapPayloadToRow(payload);     // what localGameStore persists for a guest
    const uploaded = rowToPayload(row);        // what LocalGameSync sends on sign-in

    expect(uploaded).toEqual(payload);
  });

  test('row uses snake_case storage keys (matches cloud row shape)', () => {
    const row = mapPayloadToRow(canonicalPayload());
    expect(row.session_id).toBe('sess-abc-123');
    expect(row.conversation_data).toHaveLength(2);
    expect(row.game_settings.templateName).toBe('The Cursed Village');
    expect(row.selected_heroes[0].heroName).toBe('Bryn');
    expect(row.summary).toBe('They have just arrived.');
    expect(row.world_map.width).toBe(20);
    expect(row.player_position).toEqual({ x: 3, y: 5 });
  });

  test('rowToPayload emits the camelCase keys the save backends destructure', () => {
    const uploaded = rowToPayload(mapPayloadToRow(canonicalPayload()));
    // These are the exact keys Express (server.js) and the CF Worker read.
    expect(Object.keys(uploaded).sort()).toEqual([
      'conversation', 'conversationName', 'currentSummary', 'gameSettings',
      'model', 'playerPosition', 'provider', 'selectedHeroes', 'sessionId',
      'sub_maps', 'timestamp', 'worldMap',
    ]);
  });
});
