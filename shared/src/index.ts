/**
 * @dungeongpt/shared
 *
 * Zod schemas and inferred types shared between frontend and backend.
 * All data shapes are defined here as the single source of truth.
 */

// ── Character schemas and types ──────────────────────────────────────────────
export {
  characterAlignmentSchema,
  characterClassSchema,
  characterGenderSchema,
  characterRaceSchema,
  characterSchema,
  characterStatsSchema,
} from "./schemas/character.js";

export type {
  Character,
  CharacterAlignment,
  CharacterClass,
  CharacterGender,
  CharacterRace,
  CharacterStats,
} from "./schemas/character.js";

// ── Game settings schemas and types ──────────────────────────────────────────
export {
  darknessLevelSchema,
  gameSettingsSchema,
  grimnessLevelSchema,
  magicLevelSchema,
  milestoneSchema,
  responseVerbositySchema,
  technologyLevelSchema,
} from "./schemas/game-settings.js";

export type {
  DarknessLevel,
  GameSettings,
  GrimnessLevel,
  MagicLevel,
  Milestone,
  ResponseVerbosity,
  TechnologyLevel,
} from "./schemas/game-settings.js";

// ── Conversation schemas and types ───────────────────────────────────────────
export {
  conversationListItemSchema,
  conversationMessageSchema,
  conversationSchema,
  messageRoleSchema,
  playerPositionSchema,
  subMapsSchema,
} from "./schemas/conversation.js";

export type {
  Conversation,
  ConversationListItem,
  ConversationMessage,
  MessageRole,
  PlayerPosition,
  SubMaps,
} from "./schemas/conversation.js";

// ── API request/response schemas and types ───────────────────────────────────
export {
  createCharacterRequestSchema,
  createCharacterResponseSchema,
  errorResponseSchema,
  generateAiRequestSchema,
  generateAiResponseSchema,
  getCharactersResponseSchema,
  getConversationResponseSchema,
  getConversationsResponseSchema,
  messageResponseSchema,
  saveConversationRequestSchema,
  saveConversationResponseSchema,
  updateCharacterRequestSchema,
  updateConversationDataRequestSchema,
  updateConversationNameRequestSchema,
} from "./schemas/api.js";

export type {
  CreateCharacterRequest,
  CreateCharacterResponse,
  ErrorResponse,
  GenerateAiRequest,
  GenerateAiResponse,
  GetCharactersResponse,
  GetConversationResponse,
  GetConversationsResponse,
  MessageResponse,
  SaveConversationRequest,
  SaveConversationResponse,
  UpdateCharacterRequest,
  UpdateConversationDataRequest,
  UpdateConversationNameRequest,
} from "./schemas/api.js";
