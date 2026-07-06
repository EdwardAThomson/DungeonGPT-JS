import { Hono } from "hono";
import { z } from "zod";
import { generateText, AiServiceError } from "../services/ai";
import { getAllModels, DEFAULT_MODEL_ID } from "../services/models";
import { generatePremiumText } from "../services/openrouter";
import { getSql, type Sql } from "../services/pg";
import { getAccountTier, tierRank } from "../services/tiers";
import { requireAuth, type AuthVariables } from "../middleware/auth";
import {
  rateLimit,
  bumpCounter,
  PREMIUM_DAILY_BUCKET,
  PREMIUM_MONTHLY_BUCKET,
  PREMIUM_MONTHLY_WINDOW_SECONDS,
  PREMIUM_MONTHLY_LIMITS,
  PREMIUM_DAILY_LIMITS,
  PREMIUM_DAILY_WINDOW_SECONDS,
} from "../middleware/rateLimit";
import type { Env } from "../types";

const aiRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const generateAiRequestSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  // 32k chars is roughly 8k tokens: well above any legitimate game prompt
  // (DM protocol + context + history windows run 2-4k tokens) while capping the
  // input-cost vector on both pools (maintainer 2026-07-06).
  prompt: z.string().min(1).max(32000),
  systemPrompt: z.string().max(10000).optional(),
  maxTokens: z.number().int().positive().max(1500).optional(),
  temperature: z.number().min(0).max(2).optional(),
  // AI pool (backlog #7): 'premium' requests the Members OpenRouter pool; anything
  // else (absent, unknown, 'free') is the free Workers AI pool. Tier and daily
  // allowance are enforced below.
  pool: z.string().optional(),
});

const generateAiResponseSchema = z.object({
  text: z.string(),
  // Pool ACTUALLY used for this response (a premium request that fell back to the
  // free pool reports 'free' plus the fallback fields, so the client can surface it).
  pool: z.enum(["free", "premium"]),
  fallbackFrom: z.literal("premium").optional(),
  fallbackReason: z.literal("premium_error").optional(),
});

// Respond explicitly to CORS preflight for authenticated requests.
aiRoutes.options("*", (c) => c.body(null, 204));

aiRoutes.get("/models", requireAuth, (c) => {
  const models = getAllModels();
  return c.json({
    models,
    defaultModelId: DEFAULT_MODEL_ID,
  });
});

aiRoutes.post("/generate", requireAuth, rateLimit("ai-generate"), async (c) => {
  const body: unknown = await c.req.json();
  const parsed = generateAiRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      {
        error: "Validation failed",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      400
    );
  }

  // Unknown pool values collapse to 'free' (never an error: an older client that
  // sends nothing keeps working, a garbage value gets the safe pool).
  const requestedPool = parsed.data.pool === "premium" ? "premium" : "free";

  // ── Premium pool gate (backlog #7) ──────────────────────────────────────────
  // pool: 'premium' requires tier member+ (account_tiers, same lookup the
  // entitlements/premium-templates routes use) and passes through the DAILY
  // premium allowance (bucket 'ai-premium-daily' in request_counters):
  //   not entitled  -> 403 { code: 'premium_required' }
  //   over allowance-> 429 { code: 'premium_cap', retryAfterSeconds }
  // Both carry a code so the client can quietly fall back to the free pool.
  // A DB error here (tier lookup / counter) does NOT open the paid pool: the
  // request degrades to the free pool instead (availability without leaking paid
  // model usage).
  let usePremium = false;
  let premiumDegraded = false; // premium requested but DB trouble forced free
  if (requestedPool === "premium") {
    const userId = c.get("userId");
    if (!userId) {
      // Only reachable via the ALLOW_UNAUTHENTICATED_DEV bypass: no identity, no
      // tier, no paid pool. Fail closed.
      return c.json(
        { error: "Premium AI requires a Membership", code: "premium_required" },
        403
      );
    }

    let sql: Sql | undefined;
    try {
      sql = getSql(c.env);
      const tier = await getAccountTier(sql, userId);
      if (tierRank(tier) < tierRank("member")) {
        return c.json(
          { error: "Premium AI requires a Membership", code: "premium_required" },
          403
        );
      }

      const dailyLimit =
        PREMIUM_DAILY_LIMITS[tier] ?? PREMIUM_DAILY_LIMITS.member;
      const { count, retryAfterSeconds } = await bumpCounter(
        sql,
        userId,
        PREMIUM_DAILY_BUCKET,
        PREMIUM_DAILY_WINDOW_SECONDS
      );
      if (count > dailyLimit) {
        console.warn(
          `[premium] daily allowance hit: user=${userId} tier=${tier} count=${count} limit=${dailyLimit}`
        );
        c.header("Retry-After", String(retryAfterSeconds));
        return c.json(
          {
            error: "Premium AI allowance used for today",
            code: "premium_cap",
            retryAfterSeconds,
          },
          429
        );
      }

      // Monthly allowance: the subscription-aligned ceiling (the daily cap is
      // burst protection; this is the one that bounds spend against revenue).
      const monthlyLimit =
        PREMIUM_MONTHLY_LIMITS[tier] ?? PREMIUM_MONTHLY_LIMITS.member;
      const monthly = await bumpCounter(
        sql,
        userId,
        PREMIUM_MONTHLY_BUCKET,
        PREMIUM_MONTHLY_WINDOW_SECONDS
      );
      if (monthly.count > monthlyLimit) {
        console.warn(
          `[premium] monthly allowance hit: user=${userId} tier=${tier} count=${monthly.count} limit=${monthlyLimit}`
        );
        c.header("Retry-After", String(monthly.retryAfterSeconds));
        return c.json(
          {
            error: "Premium AI allowance used for this month",
            code: "premium_cap",
            retryAfterSeconds: monthly.retryAfterSeconds,
          },
          429
        );
      }

      usePremium = true;
    } catch (error) {
      console.error(
        "[premium] tier/allowance check failed; degrading to free pool:",
        error instanceof Error ? error.message : error
      );
      premiumDegraded = true;
    } finally {
      if (sql) c.executionCtx.waitUntil(sql.end());
    }
  }

  try {
    if (usePremium) {
      try {
        const premium = await generatePremiumText(c.env, {
          prompt: parsed.data.prompt,
          // No player model choice (maintainer 2026-07-06: it over-complicates
          // gameplay): the premium pool always runs the server-side default and
          // its curated fallback chain; client model ids are ignored entirely.
          maxTokens: parsed.data.maxTokens,
          temperature: parsed.data.temperature,
          systemPrompt: parsed.data.systemPrompt,
        });
        const output = generateAiResponseSchema.parse({
          text: premium.text,
          pool: "premium",
        });
        return c.json(output);
      } catch (premiumError) {
        // Never a dead generation: OpenRouter trouble (or a missing secret) drops
        // to the free pool, and the response says so.
        console.error(
          "[premium] OpenRouter generation failed; falling back to free pool:",
          premiumError instanceof Error ? premiumError.message : premiumError
        );
        premiumDegraded = true;
      }
    }

    const result = await generateText(c.env, {
      prompt: parsed.data.prompt,
      modelId: parsed.data.model,
      maxTokens: parsed.data.maxTokens,
      temperature: parsed.data.temperature,
      systemPrompt: parsed.data.systemPrompt,
    });

    const output = generateAiResponseSchema.parse({
      text: result.text,
      pool: "free",
      ...(premiumDegraded
        ? { fallbackFrom: "premium", fallbackReason: "premium_error" }
        : {}),
    });
    return c.json(output);
  } catch (error: unknown) {
    const status =
      error instanceof AiServiceError &&
      error.status >= 200 &&
      error.status < 600
        ? error.status
        : 500;

    const message =
      status >= 500
        ? "AI generation failed"
        : error instanceof Error
          ? error.message
          : String(error);

    return c.json({ error: message }, status as 400 | 500 | 502);
  }
});

export { aiRoutes };
