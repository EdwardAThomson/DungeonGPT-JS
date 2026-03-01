import { getFallbackModelId, getModelById } from "./models";
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
        anyResponse.choices.length > 0 &&
        anyResponse.choices[0]?.message?.content
      ) {
        return { text: anyResponse.choices[0].message.content };
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
  const model = getModelById(options.modelId);
  if (!model) {
    throw new AiServiceError(`Unknown model: ${options.modelId}`, 400);
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
    const status =
      primaryError instanceof AiServiceError ? primaryError.status : 500;
    const errMsg =
      primaryError instanceof Error ? primaryError.message : String(primaryError);
    const message =
      status >= 500
        ? `AI generation failed: ${errMsg}`
        : errMsg;

    console.error(
      `Primary model ${model.id} failed:`,
      primaryError instanceof Error ? primaryError.message : primaryError
    );

    const fallbackId = getFallbackModelId(model.id);
    if (!fallbackId) {
      throw new AiServiceError(message, status);
    }

    const fallbackModel = getModelById(fallbackId);
    if (!fallbackModel) {
      throw primaryError;
    }

    console.log(`Falling back to model: ${fallbackModel.id}`);

    const fallback = await callWorkersAi(
      env,
      fallbackModel.id,
      options.prompt,
      Math.min(maxTokens, fallbackModel.maxTokens),
      temperature,
      options.systemPrompt
    );
    return { text: sanitizeResponse(fallback.text) };
  }
}
