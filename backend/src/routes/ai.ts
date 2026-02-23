/**
 * AI route group.
 *
 * Endpoints:
 *   POST /api/ai/generate — Generate text from an AI model.
 *   GET  /api/ai/models   — List available models grouped by tier.
 *
 * Ported from server.js POST /api/llm/generate (line 478).
 * CLI task endpoints (/api/llm/tasks) are intentionally not ported —
 * Workers cannot spawn child processes.
 */
import { generateAiRequestSchema } from "@dungeongpt/shared";
import { Hono } from "hono";

import { validateBody } from "../middleware/validate.js";
import {
  AiServiceError,
  generateText,
  generateTextStream,
} from "../services/ai.js";
import { MODEL_REGISTRY, getModelsByTier } from "../services/models.js";

import type { Env } from "../types.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Extract error message safely from an unknown error value. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Extract HTTP status from error if it has one, clamped to valid range. */
function errorStatus(error: unknown): ContentfulStatusCode {
  if (error instanceof AiServiceError) {
    const s = error.status;
    if (s >= 200 && s < 600) {
      return s as ContentfulStatusCode;
    }
  }
  return 500;
}

/**
 * Build GenerateOptions from validated request data.
 * Uses explicit property assignment to satisfy exactOptionalPropertyTypes —
 * only includes optional properties when they have actual values.
 *
 * The `| undefined` in the parameter types is required because Zod's `.optional()`
 * produces `T | undefined` rather than just `T?`, and exactOptionalPropertyTypes
 * treats these differently.
 */
function buildGenerateOptions(
  prompt: string,
  modelId: string,
  maxTokens: number | undefined,
  temperature: number | undefined,
) {
  const options: {
    prompt: string;
    modelId: string;
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
  } = {
    prompt,
    modelId,
  };

  if (maxTokens !== undefined) {
    options.maxTokens = maxTokens;
  }
  if (temperature !== undefined) {
    options.temperature = temperature;
  }

  return options;
}

const aiRoutes = new Hono<{ Bindings: Env }>();

/**
 * POST /api/ai/generate — Generate text from an AI model.
 *
 * Accepts: { provider, model, prompt, maxTokens?, temperature? }
 * Returns: { text: string } (non-streaming) or ReadableStream (streaming)
 *
 * The `provider` field from the shared schema is used for backward compatibility
 * with the original API shape. The actual routing is determined by the model's
 * tier and provider in the model registry.
 *
 * Query parameter `?stream=true` enables streaming responses.
 */
aiRoutes.post(
  "/generate",
  validateBody(generateAiRequestSchema),
  async (c) => {
    const data = c.req.valid("json");
    const streamParam = c.req.query("stream");
    const wantStream = streamParam === "true";

    try {
      if (wantStream) {
        const options = buildGenerateOptions(
          data.prompt,
          data.model,
          data.maxTokens,
          data.temperature,
        );
        options.stream = true;

        const stream = await generateTextStream(c.env, options);

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      const result = await generateText(
        c.env,
        buildGenerateOptions(
          data.prompt,
          data.model,
          data.maxTokens,
          data.temperature,
        ),
      );
      return c.json({ text: result.text });
    } catch (error: unknown) {
      const status = errorStatus(error);

      console.error(
        JSON.stringify({
          type: "ai_generate_error",
          model: data.model,
          provider: data.provider,
          message: errorMessage(error),
        }),
      );

      // Return generic messages for 5xx errors, specific for 4xx
      const clientMessage =
        status >= 500 ? "AI generation failed" : errorMessage(error);

      return c.json({ error: clientMessage }, status);
    }
  },
);

/**
 * GET /api/ai/models — List available models grouped by tier.
 *
 * Returns: { models: { fast: [...], balanced: [...], quality: [...] }, total: number }
 * Each model includes: id, displayName, tier, maxTokens.
 */
aiRoutes.get("/models", (c) => {
  const fastModels = getModelsByTier("fast").map((m) => formatModelResponse(m));
  const balancedModels = getModelsByTier("balanced").map((m) =>
    formatModelResponse(m),
  );
  const qualityModels = getModelsByTier("quality").map((m) =>
    formatModelResponse(m),
  );

  return c.json({
    models: {
      fast: fastModels,
      balanced: balancedModels,
      quality: qualityModels,
    },
    total: MODEL_REGISTRY.length,
  });
});

/** Format a model definition for the API response. */
function formatModelResponse(model: (typeof MODEL_REGISTRY)[number]) {
  return {
    id: model.id,
    displayName: model.displayName,
    tier: model.tier,
    maxTokens: model.maxTokens,
  };
}

export { aiRoutes };
