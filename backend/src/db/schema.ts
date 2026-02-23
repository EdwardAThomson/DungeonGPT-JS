/**
 * Drizzle table definitions for Cloudflare D1.
 *
 * Matches the existing SQLite schema from server.js:
 * - characterstable: character data with stats stored as JSON TEXT
 * - conversations: game session data with multiple JSON TEXT columns
 *
 * Column names preserved exactly from the original schema
 * to maintain backward compatibility with Edward's existing data.
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Characters table — matches server.js characterstable schema.
 *
 * Original schema (server.js lines 59-70):
 *   characterId TEXT PRIMARY KEY
 *   characterName TEXT
 *   characterGender TEXT
 *   profilePicture TEXT
 *   characterRace TEXT
 *   characterClass TEXT
 *   characterLevel INTEGER
 *   characterBackground TEXT
 *   characterAlignment TEXT
 *   stats TEXT (JSON)
 */
export const characters = sqliteTable("characterstable", {
  characterId: text("characterId").primaryKey(),
  characterName: text("characterName"),
  characterGender: text("characterGender"),
  profilePicture: text("profilePicture"),
  characterRace: text("characterRace"),
  characterClass: text("characterClass"),
  characterLevel: integer("characterLevel"),
  characterBackground: text("characterBackground"),
  characterAlignment: text("characterAlignment"),
  /** Stats stored as JSON string: { Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma } */
  stats: text("stats"),
});

/**
 * Conversations table — matches server.js conversations schema.
 *
 * Original schema (server.js lines 78-90 + ALTER TABLE additions):
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
 */
export const conversations = sqliteTable("conversations", {
  sessionId: text("sessionId").primaryKey(),
  /** JSON array of { role, content } message objects */
  conversation_data: text("conversation_data"),
  provider: text("provider"),
  model: text("model"),
  timestamp: text("timestamp"),
  conversation_name: text("conversation_name"),
  /** JSON object matching GameSettings schema */
  game_settings: text("game_settings"),
  /** JSON array of Character objects */
  selected_heroes: text("selected_heroes"),
  summary: text("summary"),
  /** JSON 2D array for the world map */
  world_map: text("world_map"),
  /** JSON object { x, y } for player position */
  player_position: text("player_position"),
  /** JSON object for sub-map state (town maps, visited biomes, etc.) */
  sub_maps: text("sub_maps"),
});
