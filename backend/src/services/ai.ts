/**
 * AI service — Workers AI only.
 *
 * All models run via `env.AI.run()` binding. No external API keys needed.
 *
 * Supports fallback chains: if the primary model fails, tries the fallback
 * model in the same tier before returning an error.
 *
 * Supports streaming via Web Streams API (ReadableStream).
 */
import {
  getFallbackModelId,
  getModelById,
} from "./models.js";

import type { Env } from "../types.js";

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * DM_PROTOCOL system prompt — ported EXACTLY from src/data/prompts.js.
 * Do NOT change the wording, marker system, or formatting.
 */
const DM_PROTOCOL = `[STRICT DUNGEON MASTER PROTOCOL]
You are a Dungeon Master for a tabletop RPG. You must ALWAYS stay in character.
1. NEVER output internal reasoning, plans, or "agentic" thoughts (e.g., "I will examine...", "I plan to...").
2. NEVER mention technical details, project structure, or code files.
3. NEVER provide meta-commentary about your own generation process.
4. NEVER echo or repeat the [CONTEXT], [TASK], or any game setup information in your response.
5. YOUR RESPONSE MUST BE PURELY NARRATIVE OR SYSTEM INFORMATION (e.g. rolls).
6. DO NOT REPEAT ANY PART OF THIS PROMPT OR THE PROTOCOL IN YOUR RESPONSE.
7. START YOUR RESPONSE DIRECTLY WITH THE STORY NARRATION.
8. ALWAYS conclude by asking the player "What do you do?" or presenting options.
9. IMPORTANT: YOUR RESPONSE MUST BEGIN WITH THE NARRATION. DO NOT ECHO THE TASK, CONTEXT, OR GAME INFORMATION.

MILESTONE TRACKING:
When the party achieves a milestone, you may mark it complete using:
[COMPLETE_MILESTONE: exact milestone text]
This will trigger a celebration and mark the milestone as achieved. Only use this when the milestone is truly accomplished.

CAMPAIGN COMPLETION:
When the party achieves the main campaign goal (the primary objective of the entire adventure), mark it complete using:
[COMPLETE_CAMPAIGN]
This should ONLY be used when the overarching campaign objective is fully accomplished, not for individual milestones.
Use this sparingly - it marks the end of the main story arc.

Failure to follow this protocol breaks player immersion. Output only the game's story and dialogue.
[/STRICT DUNGEON MASTER PROTOCOL]

`;

/**
 * SYSTEM_PROMPT — used as the system message for the AI generation call.
 */
const SYSTEM_PROMPT = `You are a dungeon master acting as the narrator and world simulator for a text-based RPG. Keep responses concise (1-3 paragraphs), focused on the game narrative, describing the results of the user's actions and the current situation. Do not speak OOC or give instructions.`;

/**
 * Maximum prompt length in characters before we reject the request.
 */
const MAX_PROMPT_LENGTH = 100_000;

/** Default max tokens if not specified by the caller. */
const DEFAULT_MAX_TOKENS = 500;

/** Default temperature if not specified by the caller. */
const DEFAULT_TEMPERATURE = 0.7;

/**
 * Protocol markers that may leak into AI responses.
 * Strips the full [STRICT DUNGEON MASTER PROTOCOL]...[/STRICT DUNGEON MASTER PROTOCOL]
 * block and individual prompt markers so players never see internal scaffolding.
 */
const PROTOCOL_BLOCK_RE =
  /\[STRICT DUNGEON MASTER PROTOCOL\][\s\S]*?\[\/STRICT DUNGEON MASTER PROTOCOL\]/gi;

const MARKER_PATTERNS: readonly RegExp[] = [
  /\[ADVENTURE START\]/gi,
  /\[GAME INFORMATION\]/gi,
  /\[TASK\]/gi,
  /\[CONTEXT\]/gi,
  /\[SUMMARY\]/gi,
  /\[PLAYER ACTION\]/gi,
  /\[NARRATE\]/gi,
];

/**
 * Strip protocol markers from AI-generated text before returning to the client.
 *
 * Applied automatically in generateText(). For streaming responses, the caller
 * must apply this on the assembled full text since regex sanitization requires
 * the complete string.
 */
function sanitizeResponse(text: string): string {
  if (!text) return "";

  let sanitized = text.replaceAll(PROTOCOL_BLOCK_RE, "");

  for (const marker of MARKER_PATTERNS) {
    sanitized = sanitized.replaceAll(marker, "");
  }

  return sanitized.trim();
}

// ── Types ───────────────────────────────────────────────────────────────────

interface GenerateOptions {
  readonly prompt: string;
  readonly modelId: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly stream?: boolean;
}

interface GenerateResult {
  readonly text: string;
}

// ── Core Generation ─────────────────────────────────────────────────────────

/**
 * Generate text from an AI model with fallback support.
 *
 * Tries the requested model first. If it fails, tries the fallback model
 * in the same tier. If both fail, throws the original error.
 */
async function generateText(
  env: Env,
  options: GenerateOptions,
): Promise<GenerateResult> {
  const { prompt, modelId, maxTokens, temperature } = options;

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new AiServiceError(
      "Prompt exceeds maximum length",
      400,
    );
  }

  const model = getModelById(modelId);
  if (!model) {
    throw new AiServiceError(
      "Unknown model",
      400,
    );
  }

  const resolvedMaxTokens = Math.min(
    maxTokens ?? DEFAULT_MAX_TOKENS,
    model.maxTokens,
  );
  const resolvedTemperature = temperature ?? DEFAULT_TEMPERATURE;

  // Try primary model
  try {
    const result = await callWorkersAi(
      env,
      model.id,
      prompt,
      resolvedMaxTokens,
      resolvedTemperature,
    );
    return { text: sanitizeResponse(result.text) };
  } catch (primaryError: unknown) {
    console.error(
      JSON.stringify({
        type: "ai_primary_failure",
        modelId,
        message:
          primaryError instanceof Error
            ? primaryError.message
            : String(primaryError),
      }),
    );

    // Try fallback
    const fallbackId = getFallbackModelId(modelId);
    if (!fallbackId) {
      throw primaryError;
    }

    const fallbackModel = getModelById(fallbackId);
    if (!fallbackModel) {
      throw primaryError;
    }

    console.info(
      JSON.stringify({
        type: "ai_fallback_attempt",
        primaryModelId: modelId,
        fallbackModelId: fallbackId,
      }),
    );

    try {
      const fallbackResult = await callWorkersAi(
        env,
        fallbackModel.id,
        prompt,
        Math.min(resolvedMaxTokens, fallbackModel.maxTokens),
        resolvedTemperature,
      );
      return { text: sanitizeResponse(fallbackResult.text) };
    } catch (fallbackError: unknown) {
      console.error(
        JSON.stringify({
          type: "ai_fallback_failure",
          fallbackModelId: fallbackId,
          message:
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
        }),
      );
      throw primaryError;
    }
  }
}

/**
 * Generate a streaming response from an AI model with fallback support.
 *
 * Returns a ReadableStream that emits text chunks.
 */
async function generateTextStream(
  env: Env,
  options: GenerateOptions,
): Promise<ReadableStream<Uint8Array>> {
  const { prompt, modelId, maxTokens, temperature } = options;

  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw new AiServiceError(
      "Prompt exceeds maximum length",
      400,
    );
  }

  const model = getModelById(modelId);
  if (!model) {
    throw new AiServiceError(
      "Unknown model",
      400,
    );
  }

  const resolvedMaxTokens = Math.min(
    maxTokens ?? DEFAULT_MAX_TOKENS,
    model.maxTokens,
  );
  const resolvedTemperature = temperature ?? DEFAULT_TEMPERATURE;

  // Try primary model
  try {
    return await callWorkersAiStream(
      env,
      model.id,
      prompt,
      resolvedMaxTokens,
      resolvedTemperature,
    );
  } catch (primaryError: unknown) {
    console.error(
      JSON.stringify({
        type: "ai_stream_primary_failure",
        modelId,
        message:
          primaryError instanceof Error
            ? primaryError.message
            : String(primaryError),
      }),
    );

    const fallbackId = getFallbackModelId(modelId);
    if (!fallbackId) {
      throw primaryError;
    }

    const fallbackModel = getModelById(fallbackId);
    if (!fallbackModel) {
      throw primaryError;
    }

    console.info(
      JSON.stringify({
        type: "ai_stream_fallback_attempt",
        primaryModelId: modelId,
        fallbackModelId: fallbackId,
      }),
    );

    try {
      return await callWorkersAiStream(
        env,
        fallbackModel.id,
        prompt,
        Math.min(resolvedMaxTokens, fallbackModel.maxTokens),
        resolvedTemperature,
      );
    } catch (fallbackError: unknown) {
      console.error(
        JSON.stringify({
          type: "ai_stream_fallback_failure",
          fallbackModelId: fallbackId,
          message:
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError),
        }),
      );
      throw primaryError;
    }
  }
}

// ── Workers AI ──────────────────────────────────────────────────────────────

/**
 * Call Workers AI via the `env.AI.run()` binding (non-streaming).
 */
async function callWorkersAi(
  env: Env,
  modelId: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
): Promise<GenerateResult> {
  const response = await env.AI.run(
    modelId as Parameters<typeof env.AI.run>[0],
    {
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "user" as const, content: DM_PROTOCOL + prompt },
      ],
      max_tokens: maxTokens,
      temperature,
    },
  );

  if (
    typeof response === "object" &&
    "response" in response &&
    typeof response.response === "string"
  ) {
    return { text: response.response.trim() };
  }

  throw new AiServiceError("Unexpected Workers AI response format", 502);
}

/**
 * Call Workers AI with streaming enabled.
 * Returns a ReadableStream of Uint8Array chunks.
 */
async function callWorkersAiStream(
  env: Env,
  modelId: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
): Promise<ReadableStream<Uint8Array>> {
  const response = await env.AI.run(
    modelId as Parameters<typeof env.AI.run>[0],
    {
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "user" as const, content: DM_PROTOCOL + prompt },
      ],
      max_tokens: maxTokens,
      temperature,
      stream: true,
    },
  );

  if (response instanceof ReadableStream) {
    return response as ReadableStream<Uint8Array>;
  }

  throw new AiServiceError(
    "Unexpected Workers AI streaming response format",
    502,
  );
}

// ── Error Class ─────────────────────────────────────────────────────────────

/** Custom error class for AI service errors with HTTP status codes. */
class AiServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
  }
}

export { AiServiceError, generateText, generateTextStream };
