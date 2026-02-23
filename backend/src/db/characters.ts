/**
 * Character query functions using Drizzle ORM.
 *
 * All queries are parameterized via Drizzle.
 * Ported from server.js lines 161-245.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import { characters } from "./schema.js";

import type { Character, CharacterStats } from "@dungeongpt/shared";

/**
 * Parse a character row from D1, converting the JSON stats string
 * back to an object. Matches server.js GET /characters behavior (lines 236-239).
 */
function parseCharacterRow(row: typeof characters.$inferSelect): Character {
  let stats: CharacterStats;
  try {
    stats = JSON.parse(row.stats ?? "{}") as CharacterStats;
  } catch {
    stats = {
      Strength: 10,
      Dexterity: 10,
      Constitution: 10,
      Intelligence: 10,
      Wisdom: 10,
      Charisma: 10,
    };
  }

  return {
    characterId: row.characterId,
    characterName: row.characterName ?? "",
    characterGender: (row.characterGender ?? "Male") as Character["characterGender"],
    profilePicture: row.profilePicture ?? "",
    characterRace: (row.characterRace ?? "Human") as Character["characterRace"],
    characterClass: (row.characterClass ?? "Fighter") as Character["characterClass"],
    characterLevel: row.characterLevel ?? 1,
    characterBackground: row.characterBackground ?? "",
    characterAlignment: (row.characterAlignment ?? "True Neutral") as Character["characterAlignment"],
    stats,
  };
}

/**
 * Get all characters.
 * Matches server.js GET /characters (lines 224-245).
 */
export async function getAllCharacters(db: D1Database): Promise<Character[]> {
  const d = drizzle(db);
  const rows = await d.select().from(characters);
  return rows.map((row) => parseCharacterRow(row));
}

/**
 * Create a new character.
 * Matches server.js POST /characters (lines 161-176).
 */
export async function createCharacter(
  db: D1Database,
  character: Character,
): Promise<void> {
  const d = drizzle(db);
  await d.insert(characters).values({
    characterId: character.characterId,
    characterName: character.characterName,
    characterGender: character.characterGender,
    profilePicture: character.profilePicture,
    characterRace: character.characterRace,
    characterClass: character.characterClass,
    characterLevel: character.characterLevel,
    characterBackground: character.characterBackground,
    characterAlignment: character.characterAlignment,
    stats: JSON.stringify(character.stats),
  });
}

/**
 * Update an existing character.
 * Matches server.js PUT /characters/:characterId (lines 179-220).
 * Returns the number of rows changed.
 */
export async function updateCharacter(
  db: D1Database,
  characterId: string,
  data: Omit<Character, "characterId">,
): Promise<number> {
  const d = drizzle(db);
  const result = await d
    .update(characters)
    .set({
      characterName: data.characterName,
      characterGender: data.characterGender,
      profilePicture: data.profilePicture,
      characterRace: data.characterRace,
      characterClass: data.characterClass,
      characterLevel: data.characterLevel,
      characterBackground: data.characterBackground,
      characterAlignment: data.characterAlignment,
      stats: JSON.stringify(data.stats),
    })
    .where(eq(characters.characterId, characterId))
    .returning();

  return result.length;
}

/**
 * Delete a character by ID.
 * Returns the number of rows deleted.
 */
export async function deleteCharacter(
  db: D1Database,
  characterId: string,
): Promise<number> {
  const d = drizzle(db);
  const result = await d
    .delete(characters)
    .where(eq(characters.characterId, characterId))
    .returning();

  return result.length;
}
