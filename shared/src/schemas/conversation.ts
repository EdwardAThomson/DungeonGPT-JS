import { z } from "zod";

import { characterSchema } from "./character.js";
import { gameSettingsSchema } from "./game-settings.js";

/**
 * Conversation message role — matches the roles used in useGameInteraction.js.
 * "user" for player input, "ai" for DM responses, "system" for milestone/campaign messages.
 */
export const messageRoleSchema = z.enum(["user", "ai", "system"]);

export type MessageRole = z.infer<typeof messageRoleSchema>;

/**
 * Conversation message — matches the message objects pushed to the conversation array.
 * From useGameInteraction.js: { role: 'user'|'ai'|'system', content: string }
 */
export const conversationMessageSchema = z.object({
  role: messageRoleSchema,
  content: z.string(),
});

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

/**
 * Player position — matches the {x, y} coordinate objects used throughout the codebase.
 */
export const playerPositionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

export type PlayerPosition = z.infer<typeof playerPositionSchema>;

/**
 * Sub-maps state — matches the sub_maps object from Game.js lines 228-238.
 * Stores town map state, visited biomes/towns, and encounter tracking.
 *
 * These are complex runtime objects that vary in shape, so we use
 * z.unknown() for the deeply nested map data structures (town maps, tile objects, etc.)
 * while typing the primitive fields explicitly.
 */
export const subMapsSchema = z.object({
  currentTownMap: z.unknown().optional(),
  townPlayerPosition: z.unknown().optional(),
  currentTownTile: z.unknown().optional(),
  isInsideTown: z.boolean().optional(),
  currentMapLevel: z.string().optional(),
  townMapsCache: z.unknown().optional(),
  visitedBiomes: z.array(z.string()).optional(),
  visitedTowns: z.array(z.string()).optional(),
  movesSinceEncounter: z.number().int().optional(),
});

export type SubMaps = z.infer<typeof subMapsSchema>;

/**
 * Conversation schema — matches the conversations table from server.js
 * and the shape returned by GET /api/conversations/:sessionId.
 *
 * Table schema (server.js lines 78-90):
 *   sessionId TEXT PRIMARY KEY
 *   conversation_data TEXT (JSON array of messages)
 *   provider TEXT
 *   model TEXT
 *   timestamp TEXT
 *   conversation_name TEXT
 *   game_settings TEXT (JSON)
 *   selected_heroes TEXT (JSON array)
 *   summary TEXT
 *   world_map TEXT (JSON 2D array)
 *   player_position TEXT (JSON {x, y})
 *   sub_maps TEXT (JSON)
 *
 * When read from the database, JSON fields are parsed by server.js lines 396-404.
 */
export const conversationSchema = z.object({
  sessionId: z.string().min(1),
  conversation_data: z.array(conversationMessageSchema),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  timestamp: z.string().nullable().optional(),
  conversation_name: z.string().nullable().optional(),
  game_settings: gameSettingsSchema.nullable().optional(),
  selected_heroes: z.array(characterSchema).nullable().optional(),
  summary: z.string().nullable().optional(),
  world_map: z.unknown().nullable().optional(),
  player_position: playerPositionSchema.nullable().optional(),
  sub_maps: subMapsSchema.nullable().optional(),
});

export type Conversation = z.infer<typeof conversationSchema>;

/**
 * Conversation list item — the shape returned by GET /api/conversations
 * (the raw row without parsed JSON fields, or with minimal parsing).
 * Used for listing saved games — doesn't need full parsed data.
 */
export const conversationListItemSchema = z.object({
  sessionId: z.string().min(1),
  conversation_name: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  timestamp: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
});

export type ConversationListItem = z.infer<typeof conversationListItemSchema>;
