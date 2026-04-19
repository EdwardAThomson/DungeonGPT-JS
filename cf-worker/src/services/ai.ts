import { DEFAULT_MODEL_ID, getFallbackCandidates, getModelById } from "./models";
import type { Env } from "../types";

const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_TEMPERATURE = 0.7;

export class AiServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
  }
}

interface GenerateOptions {
  prompt: string;
  modelId: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

function sanitizeResponse(text: string): string {
  if (!text) return "";

  let sanitized = text;

  // Remove protocol block if it exists
  sanitized = sanitized.replace(
    /\[STRICT DUNGEON MASTER PROTOCOL\][\s\S]*?\[\/STRICT DUNGEON MASTER PROTOCOL\]/gi,
    ""
  );

  // Remove common prompt markers
  const markers = [
    /\[ADVENTURE START\]/gi,
    /\[GAME INFORMATION\]/gi,
    /\[TASK\]/gi,
    /\[CONTEXT\]/gi,
    /\[SUMMARY\]/gi,
    /\[PLAYER ACTION\]/gi,
    /\[NARRATE\]/gi,
  ];

  markers.forEach((marker) => {
    sanitized = sanitized.replace(marker, "");
  });

  return sanitized.trim();
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

        // Reasoning-model fallback: some models (e.g. @cf/google/gemma-4-26b-a4b-it)
        // emit chain-of-thought into `message.reasoning` and only populate
        // `message.content` once they finish thinking. If max_tokens runs out
        // mid-thinking, content is null while reasoning holds partial planning.
        // Use reasoning as a degraded fallback so callers get something back
        // instead of a 502, but warn loudly so the situation is visible.
        if (typeof message?.reasoning === "string" && message.reasoning.length > 0) {
          console.warn(
            `Model ${modelId} returned null content with reasoning text; ` +
              `using reasoning as degraded fallback (likely max_tokens exhausted mid-thinking).`
          );
          return { text: message.reasoning };
        }
      }
    }

    console.error("Unexpected CF AI response format:", JSON.stringify(response));
    throw new AiServiceError("Unexpected Workers AI response format", 502);
  } catch (error: unknown) {
    console.error(`CF AI error for model ${modelId}:`, error);
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
    return { text: sanitizeResponse(primary.text) };
  } catch (primaryError: unknown) {
    console.error(
      `Primary model ${model.id} failed:`,
      primaryError instanceof Error ? primaryError.message : primaryError
    );

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
        return { text: sanitizeResponse(fallback.text) };
      } catch (fallbackError: unknown) {
        console.error(
          `Fallback model ${fallbackModel.id} also failed:`,
          fallbackError instanceof Error ? fallbackError.message : fallbackError
        );
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
