-- DungeonGPT Initial D1 Migration
-- Matches the existing SQLite schema from server.js exactly.

CREATE TABLE IF NOT EXISTS `characterstable` (
	`characterId` text PRIMARY KEY NOT NULL,
	`characterName` text,
	`characterGender` text,
	`profilePicture` text,
	`characterRace` text,
	`characterClass` text,
	`characterLevel` integer,
	`characterBackground` text,
	`characterAlignment` text,
	`stats` text
);

CREATE TABLE IF NOT EXISTS `conversations` (
	`sessionId` text PRIMARY KEY NOT NULL,
	`conversation_data` text,
	`provider` text,
	`model` text,
	`timestamp` text,
	`conversation_name` text,
	`game_settings` text,
	`selected_heroes` text,
	`summary` text,
	`world_map` text,
	`player_position` text,
	`sub_maps` text
);
