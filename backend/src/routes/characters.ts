/**
 * Character CRUD routes.
 *
 * Ported from server.js lines 161-245.
 * Endpoints:
 *   GET    /api/characters           — List all characters
 *   POST   /api/characters           — Create a new character
 *   PUT    /api/characters/:id       — Update an existing character
 *   DELETE /api/characters/:id       — Delete a character
 */
import {
  createCharacterRequestSchema,
  updateCharacterRequestSchema,
} from "@dungeongpt/shared";
import { Hono } from "hono";

import {
  createCharacter,
  deleteCharacter,
  getAllCharacters,
  updateCharacter,
} from "../db/characters.js";
import { validateBody } from "../middleware/validate.js";

import type { Env } from "../types.js";

/** Extract error message safely from an unknown error value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const characterRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /api/characters — List all characters.
 * Matches server.js GET /characters (lines 224-245).
 * Returns array of characters with parsed stats JSON.
 */
characterRoutes.get("/", async (c) => {
  try {
    const characters = await getAllCharacters(c.env.DB);
    return c.json(characters);
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        type: "db_error",
        operation: "getAllCharacters",
        message: errorMessage(error),
      }),
    );
    return c.json({ error: "Failed to retrieve characters" }, 500);
  }
});

/**
 * POST /api/characters — Create a new character.
 * Matches server.js POST /characters (lines 161-176).
 * Returns { id: lastID } on success — ported as { id: characterId }.
 *
 * NOTE: Original server.js returns { id: this.lastID } which is the SQLite
 * auto-increment row ID, but characterstable uses characterId TEXT as PRIMARY KEY.
 * The original return value is arguably a bug (returns 0 since there's no ROWID insert).
 * We preserve the response shape but return the characterId instead, which is more useful.
 */
characterRoutes.post(
  "/",
  validateBody(createCharacterRequestSchema),
  async (c) => {
    const data = c.req.valid("json");

    try {
      await createCharacter(c.env.DB, data);
      return c.json({ id: data.characterId });
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          type: "db_error",
          operation: "createCharacter",
          message: errorMessage(error),
        }),
      );
      return c.json({ error: "Failed to add character" }, 500);
    }
  },
);

/**
 * PUT /api/characters/:id — Update an existing character.
 * Matches server.js PUT /characters/:characterId (lines 179-220).
 * Returns { message: 'Character updated successfully' } or 404.
 */
characterRoutes.put(
  "/:id",
  validateBody(updateCharacterRequestSchema),
  async (c) => {
    const characterId = c.req.param("id");
    const data = c.req.valid("json");

    try {
      const changes = await updateCharacter(c.env.DB, characterId, data);
      if (changes === 0) {
        return c.json({ error: "Character not found" }, 404);
      }
      return c.json({ message: "Character updated successfully" });
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          type: "db_error",
          operation: "updateCharacter",
          characterId,
          message: errorMessage(error),
        }),
      );
      return c.json({ error: "Failed to update character" }, 500);
    }
  },
);

/**
 * DELETE /api/characters/:id — Delete a character.
 * No direct equivalent in original server.js character routes,
 * but follows the same pattern as conversation delete.
 */
characterRoutes.delete("/:id", async (c) => {
  const characterId = c.req.param("id");

  try {
    const changes = await deleteCharacter(c.env.DB, characterId);
    if (changes === 0) {
      return c.json({ error: "Character not found" }, 404);
    }
    return c.json({ message: "Character deleted successfully" });
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        type: "db_error",
        operation: "deleteCharacter",
        characterId,
        message: errorMessage(error),
      }),
    );
    return c.json({ error: "Failed to delete character" }, 500);
  }
});

export { characterRoutes };
