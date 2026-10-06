import { DEFAULT_MODEL_ID, getFallbackCandidates, getModelById } from "./models";
import type { Env } from "../types";
import { detectNarrationProblem } from "./responseGuard";

const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_TEMPERATURE = 0.7;

export class AiServiceError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
    this.code = code;
  }
}

// Workers AI refuses every model once the account's daily neuron allocation is
// spent (error 4006, "you have used up your daily free allocation of 10,000
// neurons"). It resets at 00:00 UTC.
export const AI_QUOTA_CODE = "ai_quota";

function isQuotaExhausted(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /\b4006\b|daily free allocation|neurons/i.test(msg);
}

function secondsUntilUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now) / 1000));
}

export function quotaRetryAfterSeconds(now?: number): number {
  return secondsUntilUtcMidnight(now);
}

interface GenerateOptions {
  prompt: string;
  modelId: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

// Exported so the premium OpenRouter pool (services/openrouter.ts) applies the
// exact same pass; keep this the single sanitization implementation on the Worker.
export function sanitizeResponse(text: string): string {
  if (!text) return "";

  let sanitized = text;

  // Remove protocol block if it exists
  sanitized = sanitized.replace(
    /\[STRICT DUNGEON MASTER PROTOCOL\][\s\S]*?\[\/STRICT DUNGEON MASTER PROTOCOL\]/gi,
    ""
  );

  // Remove common prompt markers. Includes the retired completion markers (#76): the engine
  // now referees milestone/campaign completion, so a model that still emits one (old training
  // / few-shot habit) must never have it reach the player or the journal. The premium pool
  // reuses this same pass.
  const markers = [
    /\[ADVENTURE START\]/gi,
    /\[GAME INFORMATION\]/gi,
    /\[TASK\]/gi,
    /\[CONTEXT\]/gi,
    /\[SUMMARY\]/gi,
    /\[PLAYER ACTION\]/gi,
    /\[NARRATE\]/gi,
    /\[COMPLETE_MILESTONE:[\s\S]*?\]/gi,
    /\[COMPLETE_CAMPAIGN\]/gi,
  ];

  markers.forEach((marker) => {
    sanitized = sanitized.replace(marker, "");
  });

  return sanitized.trim();
}

// Sanitize, then reject output that echoes the DM protocol or has collapsed into a
// repetition loop. Throwing lets the caller's fallback walk try the next model
// instead of showing the player the leak. Shared with the premium pool.
export function acceptNarration(text: string, modelId: string): string {
  const sanitized = sanitizeResponse(text);
  const problem = detectNarrationProblem(sanitized);
  if (problem) {
    console.warn(
      `Model ${modelId} output rejected (${problem}): ${sanitized.slice(0, 200)}`
    );
    throw new AiServiceError(`Model output rejected (${problem})`, 502);
  }
  return sanitized;
}

async function callWorkersAi(
  env: Env,
  modelId: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
  systemPrompt?: string
): Promise<{ text: string }> {
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  try {
    const response = await env.AI.run(
      modelId as Parameters<typeof env.AI.run>[0],
      {
        messages,
        max_tokens: maxTokens,
        temperature,
      }
    );

    // Handle both response formats:
    // 1. Legacy CF format: { response: "text" }
    // 2. OpenAI-compatible format: { choices: [{ message: { content: "text" } }] }
    
    if (typeof response === "object" && response !== null) {
      // Legacy format
      if ("response" in response && typeof response.response === "string") {
        return { text: response.response };
      }

      // OpenAI-compatible format (cast to any to handle dynamic response types)
      const anyResponse = response as any;
      if (
        "choices" in anyResponse &&
        Array.isArray(anyResponse.choices) &&
        anyResponse.choices.length > 0
      ) {
        const message = anyResponse.choices[0]?.message;

        if (typeof message?.content === "string" && message.content.length > 0) {
          return { text: message.content };
        }

        // Reasoning models that run out of max_tokens mid-thinking return
        // content null with partial planning in `message.reasoning`. That text is
        // the model's internal planning (it often restates the prompt), so it is
        // never shown as narration: fall through to the error and let the
        // fallback walk try another model.
        if (typeof message?.reasoning === "string" && message.reasoning.length > 0) {
          console.warn(
            `Model ${modelId} returned null content with reasoning text (likely max_tokens exhausted mid-thinking).`
          );
        }
      }
    }

    console.error("Unexpected CF AI response format:", JSON.stringify(response));
    throw new AiServiceError("Unexpected Workers AI response format", 502);
  } catch (error: unknown) {
    console.error(`CF AI error for model ${modelId}:`, error);
    if (error instanceof AiServiceError) throw error;
    if (isQuotaExhausted(error)) {
      throw new AiServiceError("Workers AI daily allocation used up", 503, AI_QUOTA_CODE);
    }
    if (error instanceof Error) {
      throw new AiServiceError(`CF AI error: ${error.message}`, 502);
    }
    throw new AiServiceError(`CF AI error: ${String(error)}`, 502);
  }
}

export async function generateText(
  env: Env,
  options: GenerateOptions
): Promise<{ text: string }> {
  // Unknown model id (e.g. a user has a removed model saved in localStorage):
  // fall back to the default model rather than 400ing.
  let model = getModelById(options.modelId);
  if (!model) {
    console.warn(
      `Unknown model "${options.modelId}", falling back to default "${DEFAULT_MODEL_ID}"`
    );
    model = getModelById(DEFAULT_MODEL_ID);
    if (!model) {
      throw new AiServiceError(
        `Default model "${DEFAULT_MODEL_ID}" not found in registry`,
        500
      );
    }
  }

  const maxTokens = Math.min(
    options.maxTokens ?? DEFAULT_MAX_TOKENS,
    model.maxTokens
  );
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;

  try {
    const primary = await callWorkersAi(
      env,
      model.id,
      options.prompt,
      maxTokens,
      temperature,
      options.systemPrompt
    );
    return { text: acceptNarration(primary.text, model.id) };
  } catch (primaryError: unknown) {
    console.error(
      `Primary model ${model.id} failed:`,
      primaryError instanceof Error ? primaryError.message : primaryError
    );

    // Every model draws on the same account allocation, so a fallback can't help.
    if (primaryError instanceof AiServiceError && primaryError.code === AI_QUOTA_CODE) {
      throw primaryError;
    }

    // Try fallback candidates: default model first, then others in registry order
    const candidates = getFallbackCandidates(model.id);
    for (const candidateId of candidates.slice(0, 2)) {
      const fallbackModel = getModelById(candidateId);
      if (!fallbackModel) continue;

      console.log(`Falling back to model: ${fallbackModel.id}`);
      try {
        const fallback = await callWorkersAi(
          env,
          fallbackModel.id,
          options.prompt,
          Math.min(maxTokens, fallbackModel.maxTokens),
          temperature,
          options.systemPrompt
        );
        return { text: acceptNarration(fallback.text, fallbackModel.id) };
      } catch (fallbackError: unknown) {
        console.error(
          `Fallback model ${fallbackModel.id} also failed:`,
          fallbackError instanceof Error ? fallbackError.message : fallbackError
        );
        if (fallbackError instanceof AiServiceError && fallbackError.code === AI_QUOTA_CODE) {
          throw fallbackError;
        }
      }
    }

    // All fallbacks exhausted
    const errMsg =
      primaryError instanceof Error ? primaryError.message : String(primaryError);
    throw new AiServiceError(
      `AI generation failed (all fallbacks exhausted): ${errMsg}`,
      502
    );
  }
}
