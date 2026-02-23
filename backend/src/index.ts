/**
 * DungeonGPT Backend Worker
 *
 * Cloudflare Worker entry point using Hono.
 * Mounts route groups for characters and conversations.
 * Auth middleware will be added in Phase 10.
 *
 * Security middleware stack (Phase 9):
 *  1. CORS — explicit origin whitelist, no wildcards
 *  2. Security headers — CSP, HSTS, X-Frame-Options, nosniff
 *  3. Payload size limits — 1MB for conversations/AI, 10KB for others
 *  4. Path parameter length validation — rejects params over 64 characters
 *  5. Rate limiting — 30 req/min per IP on /api/ai/* (in-memory, per-isolate)
 */
import { Hono } from "hono";

import { corsMiddleware } from "./middleware/cors.js";
import { onErrorHandler, onNotFoundHandler } from "./middleware/errors.js";
import { paramLengthMiddleware } from "./middleware/param-length.js";
import { payloadLimitMiddleware } from "./middleware/payload-limit.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { securityHeadersMiddleware } from "./middleware/security-headers.js";
import { aiRoutes } from "./routes/ai.js";
import { characterRoutes } from "./routes/characters.js";
import { conversationRoutes } from "./routes/conversations.js";

import type { Env } from "./types.js";

const app = new Hono<{ Bindings: Env }>();

// ── Global error handling ─────────────────────────────────────────────────
app.onError(onErrorHandler);
app.notFound(onNotFoundHandler);

// ── Security middleware stack ─────────────────────────────────────────────
app.use("*", corsMiddleware);
app.use("*", securityHeadersMiddleware);
app.use("*", payloadLimitMiddleware);
app.use("*", paramLengthMiddleware);

// ── Rate limiting — AI generation endpoints only ─────────────────────────
app.use("/api/ai/*", rateLimitMiddleware);

// ── Health check (public — no auth required) ──────────────────────────────
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Route groups ──────────────────────────────────────────────────────────
// Auth middleware will be applied before these in Phase 10.
app.route("/api/characters", characterRoutes);
app.route("/api/conversations", conversationRoutes);
app.route("/api/ai", aiRoutes);

export default app;
