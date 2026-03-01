export type ModelTier = "ultra" | "premium" | "quality" | "balanced" | "fast" | "budget";

export interface ModelDefinition {
  id: string;
  displayName: string;
  tier: ModelTier;
  maxTokens: number;
}

export const MODEL_REGISTRY: readonly ModelDefinition[] = [
  // Ultra Tier - Absolute Best (100B+ or Reasoning)
  {
    id: "@cf/openai/gpt-oss-120b",
    displayName: "GPT-OSS 120B",
    tier: "ultra",
    maxTokens: 4096,
  },
  {
    id: "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    displayName: "DeepSeek R1 32B",
    tier: "ultra",
    maxTokens: 4096,
  },
  {
    id: "@cf/qwen/qwq-32b",
    displayName: "QwQ 32B Reasoning",
    tier: "ultra",
    maxTokens: 4096,
  },
  
  // Premium Tier - Large Models (30B-70B)
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    displayName: "Llama 3.3 70B",
    tier: "premium",
    maxTokens: 4096,
  },
  {
    id: "@cf/qwen/qwen3-30b-a3b-fp8",
    displayName: "Qwen3 30B MoE",
    tier: "premium",
    maxTokens: 4096,
  },
  
  // Quality Tier - High Quality (12B-24B)
  {
    id: "@cf/openai/gpt-oss-20b",
    displayName: "GPT-OSS 20B",
    tier: "quality",
    maxTokens: 4096,
  },
  {
    id: "@cf/mistralai/mistral-small-3.1-24b-instruct",
    displayName: "Mistral Small 3.1 24B",
    tier: "quality",
    maxTokens: 8192,
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
  
  // Balanced Tier - 7B-8B
  {
    id: "@cf/meta/llama-3.1-8b-instruct-fast",
    displayName: "Llama 3.1 8B Fast",
    tier: "balanced",
    maxTokens: 2048,
  },
  {
    id: "@cf/ibm-granite/granite-4.0-h-micro",
    displayName: "Granite 4.0 Micro",
    tier: "balanced",
    maxTokens: 4096,
  },
  {
    id: "@cf/zai-org/glm-4.7-flash",
    displayName: "GLM 4.7 Flash",
    tier: "balanced",
    maxTokens: 8192,
  },
  
  // Fast/Budget Tier - Small models
  {
    id: "@cf/meta/llama-3.2-3b-instruct",
    displayName: "Llama 3.2 3B",
    tier: "fast",
    maxTokens: 2048,
  },
  {
    id: "@cf/meta/llama-3.2-1b-instruct",
    displayName: "Llama 3.2 1B",
    tier: "budget",
    maxTokens: 2048,
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
