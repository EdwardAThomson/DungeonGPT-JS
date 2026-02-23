import { z } from "zod";

import {
  characterAlignmentSchema,
  characterClassSchema,
  characterGenderSchema,
  characterRaceSchema,
  characterSchema,
  characterStatsSchema,
} from "./character.js";
import {
  conversationListItemSchema,
  conversationMessageSchema,
  conversationSchema,
  playerPositionSchema,
  subMapsSchema,
} from "./conversation.js";
import { gameSettingsSchema } from "./game-settings.js";

// ── Character API ────────────────────────────────────────────────────────────

/**
 * POST /api/characters — create a new character.
 * Matches server.js POST /characters request body (line 162).
 */
export const createCharacterRequestSchema = characterSchema;

export type CreateCharacterRequest = z.infer<
  typeof createCharacterRequestSchema
>;

/**
 * PUT /api/characters/:characterId — update an existing character.
 * Matches server.js PUT /characters/:characterId request body (line 181).
 * characterId comes from the URL param, not the body.
 */
export const updateCharacterRequestSchema = z.object({
  characterName: z.string().min(1).max(50),
  characterGender: characterGenderSchema,
  profilePicture: z.string().min(1),
  characterRace: characterRaceSchema,
  characterClass: characterClassSchema,
  characterLevel: z.number().int().min(1).max(20),
  characterBackground: z.string().min(1).max(200),
  characterAlignment: characterAlignmentSchema,
  stats: characterStatsSchema,
});

export type UpdateCharacterRequest = z.infer<
  typeof updateCharacterRequestSchema
>;

/**
 * POST /api/characters — response after creation.
 * Returns the characterId of the newly created character.
 */
export const createCharacterResponseSchema = z.object({
  id: z.string(),
});

export type CreateCharacterResponse = z.infer<
  typeof createCharacterResponseSchema
>;

/**
 * GET /api/characters — response is an array of characters.
 * Matches server.js GET /characters response (lines 236-240).
 */
export const getCharactersResponseSchema = z.array(characterSchema);

export type GetCharactersResponse = z.infer<typeof getCharactersResponseSchema>;

// ── Conversation API ─────────────────────────────────────────────────────────

/**
 * POST /api/conversations — save or update a conversation (upsert).
 * Matches server.js POST /api/conversations request body (lines 310-311).
 *
 * The frontend sends: sessionId, conversation, provider, model, timestamp,
 * conversationName, gameSettings, selectedHeroes, currentSummary,
 * worldMap, playerPosition, sub_maps/subMaps, hasAdventureStarted.
 */
export const saveConversationRequestSchema = z.object({
  sessionId: z.string().min(1),
  conversation: z.array(conversationMessageSchema),
  provider: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  timestamp: z.string(),
  conversationName: z.string().optional(),
  gameSettings: gameSettingsSchema.nullable().optional(),
  selectedHeroes: z.array(characterSchema).nullable().optional(),
  currentSummary: z.string().nullable().optional(),
  worldMap: z.unknown().nullable().optional(),
  playerPosition: playerPositionSchema.nullable().optional(),
  sub_maps: subMapsSchema.nullable().optional(),
  subMaps: subMapsSchema.nullable().optional(),
  hasAdventureStarted: z.boolean().optional(),
});

export type SaveConversationRequest = z.infer<
  typeof saveConversationRequestSchema
>;

/**
 * POST /api/conversations — response after save.
 * Matches server.js line 373.
 */
export const saveConversationResponseSchema = z.object({
  message: z.string(),
  sessionId: z.string(),
});

export type SaveConversationResponse = z.infer<
  typeof saveConversationResponseSchema
>;

/**
 * GET /api/conversations — response is an array of conversation list items.
 */
export const getConversationsResponseSchema = z.array(
  conversationListItemSchema,
);

export type GetConversationsResponse = z.infer<
  typeof getConversationsResponseSchema
>;

/**
 * GET /api/conversations/:sessionId — response is a full conversation.
 */
export const getConversationResponseSchema = conversationSchema;

export type GetConversationResponse = z.infer<
  typeof getConversationResponseSchema
>;

/**
 * PUT /api/conversations/:sessionId — update conversation messages.
 * Matches server.js PUT /api/conversations/:sessionId (line 413).
 */
export const updateConversationDataRequestSchema = z.object({
  conversation_data: z.array(conversationMessageSchema),
});

export type UpdateConversationDataRequest = z.infer<
  typeof updateConversationDataRequestSchema
>;

/**
 * PUT /api/conversations/:sessionId/name — update conversation name.
 * Matches server.js PUT /api/conversations/:sessionId/name (line 438).
 */
export const updateConversationNameRequestSchema = z.object({
  conversationName: z.string().min(1),
});

export type UpdateConversationNameRequest = z.infer<
  typeof updateConversationNameRequestSchema
>;

// ── AI / LLM API ─────────────────────────────────────────────────────────────

/**
 * POST /api/ai/generate — generate text from an AI model.
 * Matches server.js POST /api/llm/generate (line 478) and
 * llmBackend.js generateText params (line 10).
 */
export const generateAiRequestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  maxTokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

export type GenerateAiRequest = z.infer<typeof generateAiRequestSchema>;

/**
 * POST /api/ai/generate — response.
 * Matches server.js line 482: { text: response }
 */
export const generateAiResponseSchema = z.object({
  text: z.string(),
});

export type GenerateAiResponse = z.infer<typeof generateAiResponseSchema>;

// ── Generic API Responses ────────────────────────────────────────────────────

/**
 * Generic success message response — used by update and delete operations.
 */
export const messageResponseSchema = z.object({
  message: z.string(),
});

export type MessageResponse = z.infer<typeof messageResponseSchema>;

/**
 * Generic error response.
 */
export const errorResponseSchema = z.object({
  error: z.string().optional(),
  message: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
