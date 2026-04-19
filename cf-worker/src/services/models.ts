export type ModelTier = "ultra" | "premium" | "quality" | "balanced" | "fast" | "budget";

export interface ModelDefinition {
  id: string;
  displayName: string;
  tier: ModelTier;
  maxTokens: number;
}

export const MODEL_REGISTRY: readonly ModelDefinition[] = [
  // Ultra Tier - 100B+
  {
    id: "@cf/openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    tier: "ultra",
    maxTokens: 4096,
  },

  // Quality Tier - 12B-20B
  {
    id: "@cf/openai/gpt-oss-20b",
    displayName: "GPT-OSS 20B",
    tier: "quality",
    maxTokens: 4096,
  },
  {
    id: "@cf/meta/llama-4-scout-17b-16e-instruct",
    displayName: "Llama 4 Scout 17B",
    tier: "quality",
    maxTokens: 4096,
  },
  {
    id: "@cf/google/gemma-3-12b-it",
    displayName: "Gemma 3 12B",
    tier: "quality",
    maxTokens: 4096,
  },

  // Balanced Tier - 8B
  {
    id: "@cf/meta/llama-3.1-8b-instruct-fast",
    displayName: "Llama 3.1 8B Fast",
    tier: "balanced",
    maxTokens: 2048,
  },
];

export const DEFAULT_MODEL_ID = "@cf/openai/gpt-oss-120b";

export function getModelById(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((m) => m.id === modelId);
}

/**
 * Returns fallback candidates for a failed model: default model first,
 * then remaining models in registry order. Caller should try these
 * sequentially until one succeeds (or all are exhausted).
 */
export function getFallbackCandidates(failedModelId: string): string[] {
  const candidates: string[] = [];

  // First choice: the default model
  if (failedModelId !== DEFAULT_MODEL_ID) {
    candidates.push(DEFAULT_MODEL_ID);
  }

  // Then: remaining models in registry order
  for (const model of MODEL_REGISTRY) {
    if (model.id !== failedModelId && !candidates.includes(model.id)) {
      candidates.push(model.id);
    }
  }

  return candidates;
}

export function getAllModels(): readonly ModelDefinition[] {
  return MODEL_REGISTRY;
}
