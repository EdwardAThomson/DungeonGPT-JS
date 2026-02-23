/**
 * Conversation query functions using Drizzle ORM.
 *
 * All queries are parameterized via Drizzle.
 * Ported from server.js lines 272-473.
 */
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { conversations } from "./schema.js";

import type {
  Conversation,
  ConversationListItem,
  SaveConversationRequest,
} from "@dungeongpt/shared";

/**
 * Parse a raw conversation row, converting JSON text columns back to objects.
 * Matches server.js GET /api/conversations/:sessionId (lines 396-404).
 */
function parseConversationRow(
  row: typeof conversations.$inferSelect,
): Conversation {
  return {
    sessionId: row.sessionId,
    conversation_data: safeJsonParse(row.conversation_data, []),
    provider: row.provider ?? null,
    model: row.model ?? null,
    timestamp: row.timestamp ?? null,
    conversation_name: row.conversation_name ?? null,
    game_settings: safeJsonParse(row.game_settings, null),
    selected_heroes: safeJsonParse(row.selected_heroes, null),
    summary: row.summary ?? null,
    world_map: safeJsonParse(row.world_map, null),
    player_position: safeJsonParse(row.player_position, null),
    sub_maps: safeJsonParse(row.sub_maps, null),
  };
}

/**
 * Parse a raw conversation row into a list item (minimal fields).
 * Used for GET /api/conversations listing.
 */
function parseConversationListItem(
  row: typeof conversations.$inferSelect,
): ConversationListItem {
  return {
    sessionId: row.sessionId,
    conversation_name: row.conversation_name ?? null,
    provider: row.provider ?? null,
    model: row.model ?? null,
    timestamp: row.timestamp ?? null,
    summary: row.summary ?? null,
  };
}

/**
 * Safely parse a JSON string, returning a fallback value on parse failure.
 */
function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Get all conversations, ordered by timestamp descending.
 * Matches server.js GET /api/conversations (lines 286-297).
 * Returns list items (not full conversation data).
 */
export async function getAllConversations(
  db: D1Database,
): Promise<ConversationListItem[]> {
  const d = drizzle(db);
  const rows = await d
    .select()
    .from(conversations)
    .orderBy(desc(conversations.timestamp));
  return rows.map((row) => parseConversationListItem(row));
}

/**
 * Get a single conversation by session ID.
 * Matches server.js GET /api/conversations/:sessionId (lines 383-408).
 * Returns the full conversation with parsed JSON fields.
 */
export async function getConversationById(
  db: D1Database,
  sessionId: string,
): Promise<Conversation | undefined> {
  const d = drizzle(db);
  const rows = await d
    .select()
    .from(conversations)
    .where(eq(conversations.sessionId, sessionId));
  const row = rows[0];
  if (!row) {
    return undefined;
  }
  return parseConversationRow(row);
}

/**
 * Upsert a conversation (insert or update on conflict).
 * Matches server.js POST /api/conversations (lines 308-380).
 *
 * Uses D1 raw SQL for ON CONFLICT upsert since Drizzle's D1 adapter
 * has limited support for onConflictDoUpdate on all columns.
 */
export async function upsertConversation(
  db: D1Database,
  data: SaveConversationRequest,
): Promise<void> {
  const effectiveSubMaps = data.sub_maps ?? data.subMaps;
  const conversationJson = JSON.stringify(data.conversation);
  const settingsJson = data.gameSettings
    ? JSON.stringify(data.gameSettings)
    : null;
  const heroesJson = data.selectedHeroes
    ? JSON.stringify(data.selectedHeroes)
    : null;
  const mapJson = data.worldMap ? JSON.stringify(data.worldMap) : null;
  const positionJson = data.playerPosition
    ? JSON.stringify(data.playerPosition)
    : null;
  const subMapsJson = effectiveSubMaps
    ? JSON.stringify(effectiveSubMaps)
    : null;

  // Port the exact conversationName fallback from server.js line 357
  const conversationName =
    data.conversationName ??
    `Game Session ${new Date(data.timestamp).toLocaleDateString()}`;

  const query = `
    INSERT INTO conversations (sessionId, conversation_data, provider, model, timestamp, conversation_name, game_settings, selected_heroes, summary, world_map, player_position, sub_maps)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (sessionId)
    DO UPDATE SET
      conversation_data = excluded.conversation_data,
      provider = excluded.provider,
      model = excluded.model,
      timestamp = excluded.timestamp,
      conversation_name = excluded.conversation_name,
      game_settings = excluded.game_settings,
      selected_heroes = excluded.selected_heroes,
      summary = excluded.summary,
      world_map = excluded.world_map,
      player_position = excluded.player_position,
      sub_maps = excluded.sub_maps;
  `;

  await db
    .prepare(query)
    .bind(
      data.sessionId,
      conversationJson,
      data.provider ?? null,
      data.model ?? null,
      data.timestamp,
      conversationName,
      settingsJson,
      heroesJson,
      data.currentSummary ?? null,
      mapJson,
      positionJson,
      subMapsJson,
    )
    .run();
}

/**
 * Update conversation messages only.
 * Matches server.js PUT /api/conversations/:sessionId (lines 411-432).
 * Returns the number of rows changed.
 */
export async function updateConversationMessages(
  db: D1Database,
  sessionId: string,
  conversationData: unknown[],
): Promise<number> {
  const d = drizzle(db);
  const result = await d
    .update(conversations)
    .set({
      conversation_data: JSON.stringify(conversationData),
    })
    .where(eq(conversations.sessionId, sessionId))
    .returning();

  return result.length;
}

/**
 * Update conversation name.
 * Matches server.js PUT /api/conversations/:sessionId/name (lines 435-455).
 * Returns the number of rows changed.
 */
export async function updateConversationName(
  db: D1Database,
  sessionId: string,
  conversationName: string,
): Promise<number> {
  const d = drizzle(db);
  const result = await d
    .update(conversations)
    .set({
      conversation_name: conversationName.trim(),
    })
    .where(eq(conversations.sessionId, sessionId))
    .returning();

  return result.length;
}

/**
 * Delete a conversation by session ID.
 * Matches server.js DELETE /api/conversations/:sessionId (lines 458-473).
 * Returns the number of rows deleted.
 */
export async function deleteConversation(
  db: D1Database,
  sessionId: string,
): Promise<number> {
  const d = drizzle(db);
  const result = await d
    .delete(conversations)
    .where(eq(conversations.sessionId, sessionId))
    .returning();

  return result.length;
}
