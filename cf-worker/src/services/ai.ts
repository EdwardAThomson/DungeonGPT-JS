import { getFallbackModelId, getModelById } from "./models";
import type { Env } from "../types";

const SYSTEM_PROMPT = `You are a dungeon master acting as the narrator and world simulator for a text-based RPG. Keep responses concise (1-3 paragraphs), focused on the game narrative, describing the results of the user's actions and the current situation. Do not speak OOC or give instructions.`;

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
  temperature: number
): Promise<{ text: string }> {
  const response = await env.AI.run(
    modelId as Parameters<typeof env.AI.run>[0],
    {
      messages: [
        { role: "system" as const, content: SYSTEM_PROMPT },
        { role: "user" as const, content: prompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }
  );

  if (
    typeof response === "object" &&
    response !== null &&
    "response" in response &&
    typeof response.response === "string"
  ) {
    return { text: response.response };
  }

  throw new AiServiceError("Unexpected Workers AI response format", 502);
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
      temperature
    );
    return { text: sanitizeResponse(primary.text) };
  } catch (primaryError: unknown) {
    console.error(
      `Primary model ${model.id} failed:`,
      primaryError instanceof Error ? primaryError.message : primaryError
    );

    const fallbackId = getFallbackModelId(model.id);
    if (!fallbackId) {
      throw primaryError;
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
      temperature
    );
    return { text: sanitizeResponse(fallback.text) };
  }
}
