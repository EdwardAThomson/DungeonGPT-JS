/**
 * Conversation CRUD routes.
 *
 * Ported from server.js lines 272-473.
 * Endpoints:
 *   GET    /api/conversations                  — List all conversations
 *   GET    /api/conversations/:sessionId        — Get a single conversation
 *   POST   /api/conversations                  — Save/upsert a conversation
 *   PUT    /api/conversations/:sessionId        — Update conversation messages
 *   PUT    /api/conversations/:sessionId/name   — Update conversation name
 *   DELETE /api/conversations/:sessionId        — Delete a conversation
 */
import {
  saveConversationRequestSchema,
  updateConversationDataRequestSchema,
  updateConversationNameRequestSchema,
} from "@dungeongpt/shared";
import { Hono } from "hono";

import {
  deleteConversation,
  getAllConversations,
  getConversationById,
  updateConversationMessages,
  updateConversationName,
  upsertConversation,
} from "../db/conversations.js";
import { validateBody } from "../middleware/validate.js";

import type { Env } from "../types.js";

/** Log type for structured error logging. */
const LOG_TYPE_DB_ERROR = "db_error";

/** Shared 404 message for missing conversations. */
const NOT_FOUND_MESSAGE = "Conversation not found";

/** Route path for session-scoped endpoints. */
const SESSION_PATH = "/:sessionId";

/** Extract error message safely from an unknown error value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const conversationRoutes = new Hono<{ Bindings: Env }>();

/**
 * GET /api/conversations — List all conversations.
 * Matches server.js GET /api/conversations (lines 286-297).
 * Returns rows ordered by timestamp DESC.
 */
conversationRoutes.get("/", async (c) => {
  try {
    const items = await getAllConversations(c.env.DB);
    return c.json(items);
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        type: LOG_TYPE_DB_ERROR,
        operation: "getAllConversations",
        message: errorMessage(error),
      }),
    );
    return c.json({ error: "Failed to retrieve conversations" }, 500);
  }
});

/**
 * GET /api/conversations/:sessionId — Get a single conversation.
 * Matches server.js GET /api/conversations/:sessionId (lines 383-408).
 * Returns full conversation with parsed JSON fields.
 */
conversationRoutes.get(SESSION_PATH, async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    const conversation = await getConversationById(c.env.DB, sessionId);
    if (!conversation) {
      return c.json({ error: NOT_FOUND_MESSAGE }, 404);
    }
    return c.json(conversation);
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        type: LOG_TYPE_DB_ERROR,
        operation: "getConversationById",
        sessionId,
        message: errorMessage(error),
      }),
    );
    return c.json({ error: "Failed to retrieve conversation" }, 500);
  }
});

/**
 * POST /api/conversations — Save or update a conversation (upsert).
 * Matches server.js POST /api/conversations (lines 308-380).
 *
 * Validates:
 *   - sessionId is present
 *   - conversation is a non-empty array
 *
 * Original server.js also checks: !sessionId || !conversation || !Array.isArray(conversation)
 * Zod validation handles all of this via saveConversationRequestSchema.
 *
 * Returns { message: 'Conversation saved successfully', sessionId } with 201 status.
 */
conversationRoutes.post(
  "/",
  validateBody(saveConversationRequestSchema),
  async (c) => {
    const data = c.req.valid("json");

    try {
      await upsertConversation(c.env.DB, data);
      return c.json(
        {
          message: "Conversation saved successfully",
          sessionId: data.sessionId,
        },
        201,
      );
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          type: LOG_TYPE_DB_ERROR,
          operation: "upsertConversation",
          sessionId: data.sessionId,
          message: errorMessage(error),
        }),
      );
      return c.json({ message: "Server error saving conversation" }, 500);
    }
  },
);

/**
 * PUT /api/conversations/:sessionId — Update conversation messages.
 * Matches server.js PUT /api/conversations/:sessionId (lines 411-432).
 *
 * Original validation: checks if conversation_data is present.
 * Zod validation handles this via updateConversationDataRequestSchema.
 */
conversationRoutes.put(
  SESSION_PATH,
  validateBody(updateConversationDataRequestSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const data = c.req.valid("json");

    try {
      const changes = await updateConversationMessages(
        c.env.DB,
        sessionId,
        data.conversation_data,
      );
      if (changes === 0) {
        return c.json({ message: NOT_FOUND_MESSAGE }, 404);
      }
      return c.json({ message: "Conversation data updated successfully" });
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          type: LOG_TYPE_DB_ERROR,
          operation: "updateConversationMessages",
          sessionId,
          message: errorMessage(error),
        }),
      );
      return c.json(
        { message: "Server error updating conversation data" },
        500,
      );
    }
  },
);

/**
 * PUT /api/conversations/:sessionId/name — Update conversation name.
 * Matches server.js PUT /api/conversations/:sessionId/name (lines 435-455).
 *
 * Original validation: checks if conversationName is present and non-empty after trim.
 * Zod validation handles this via updateConversationNameRequestSchema (min(1)).
 */
conversationRoutes.put(
  `${SESSION_PATH}/name`,
  validateBody(updateConversationNameRequestSchema),
  async (c) => {
    const sessionId = c.req.param("sessionId");
    const data = c.req.valid("json");

    try {
      const changes = await updateConversationName(
        c.env.DB,
        sessionId,
        data.conversationName,
      );
      if (changes === 0) {
        return c.json({ message: NOT_FOUND_MESSAGE }, 404);
      }
      return c.json({ message: "Conversation name updated successfully" });
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          type: LOG_TYPE_DB_ERROR,
          operation: "updateConversationName",
          sessionId,
          message: errorMessage(error),
        }),
      );
      return c.json(
        { message: "Server error updating conversation name" },
        500,
      );
    }
  },
);

/**
 * DELETE /api/conversations/:sessionId — Delete a conversation.
 * Matches server.js DELETE /api/conversations/:sessionId (lines 458-473).
 */
conversationRoutes.delete(SESSION_PATH, async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    const changes = await deleteConversation(c.env.DB, sessionId);
    if (changes === 0) {
      return c.json({ message: NOT_FOUND_MESSAGE }, 404);
    }
    return c.json({ message: "Conversation deleted successfully" });
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        type: LOG_TYPE_DB_ERROR,
        operation: "deleteConversation",
        sessionId,
        message: errorMessage(error),
      }),
    );
    return c.json({ message: "Server error deleting conversation" }, 500);
  }
});

export { conversationRoutes };
