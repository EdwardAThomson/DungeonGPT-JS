export type ModelTier = "fast" | "balanced" | "quality";

export interface ModelDefinition {
  id: string;
  displayName: string;
  tier: ModelTier;
  maxTokens: number;
}

export const MODEL_REGISTRY: readonly ModelDefinition[] = [
  {
    id: "@cf/meta/llama-3.1-8b-instruct-fast",
    displayName: "Llama 3.1 8B Fast",
    tier: "fast",
    maxTokens: 2048,
  },
  {
    id: "@cf/google/gemma-3-12b-it",
    displayName: "Gemma 3 12B",
    tier: "balanced",
    maxTokens: 4096,
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    displayName: "Llama 3.3 70B",
    tier: "quality",
    maxTokens: 4096,
  },
];

export const DEFAULT_MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fast";

const FALLBACK_MAP: Readonly<Record<string, string>> = {
  "@cf/meta/llama-3.1-8b-instruct-fast": "@cf/google/gemma-3-12b-it",
  "@cf/google/gemma-3-12b-it": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": "@cf/meta/llama-3.1-8b-instruct-fast",
};

export function getModelById(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((m) => m.id === modelId);
}

export function getFallbackModelId(modelId: string): string | undefined {
  return FALLBACK_MAP[modelId];
}

export function getAllModels(): readonly ModelDefinition[] {
  return MODEL_REGISTRY;
}
