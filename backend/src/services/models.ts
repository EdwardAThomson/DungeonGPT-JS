/**
 * Model tier definitions and metadata.
 *
 * All models run on Cloudflare Workers AI via `env.AI.run()`.
 * No external API keys or AI Gateway needed.
 *
 * Model reference: .project/cloudflare-models.md
 */

/** Model tier — groups models by speed/quality tradeoff. */
type ModelTier = "fast" | "balanced" | "quality";

/** Model metadata — everything the AI service needs to route a request. */
interface ModelDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly tier: ModelTier;
  readonly maxTokens: number;
}

// ── Model IDs ────────────────────────────────────────────────────────────────

/** Model ID constants — single source of truth for all references. */
const ID = {
  // Fast
  LLAMA_8B_FAST: "@cf/meta/llama-3.1-8b-instruct-fast",
  GLM_FLASH: "@cf/zai-org/glm-4.7-flash",
  LLAMA_8B: "@cf/meta/llama-3.1-8b-instruct",
  // Balanced
  GEMMA_12B: "@cf/google/gemma-3-12b-it",
  LLAMA_SCOUT_17B: "@cf/meta/llama-4-scout-17b-16e-instruct",
  GPT_OSS_20B: "@cf/openai/gpt-oss-20b",
  MISTRAL_24B: "@cf/mistralai/mistral-small-3.1-24b-instruct",
  // Quality
  QWEN_30B: "@cf/qwen/qwen3-30b-a3b-fp8",
  LLAMA_70B: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  GPT_OSS_120B: "@cf/openai/gpt-oss-120b",
} as const;

// ── Model Registry ──────────────────────────────────────────────────────────

/**
 * All available models — Workers AI only.
 *
 * Organized by tier:
 * - Fast: low latency, good for responsive game narration
 * - Balanced: better quality, reasonable speed
 * - Quality: best output, higher latency
 */
const MODEL_REGISTRY: readonly ModelDefinition[] = [
  // ── Fast Tier ─────────────────────────────────────────────────────────
  { id: ID.LLAMA_8B_FAST, displayName: "Llama 3.1 8B Fast", tier: "fast", maxTokens: 2048 },
  { id: ID.GLM_FLASH, displayName: "GLM 4.7 Flash", tier: "fast", maxTokens: 4096 },
  { id: ID.LLAMA_8B, displayName: "Llama 3.1 8B", tier: "fast", maxTokens: 2048 },
  // ── Balanced Tier ─────────────────────────────────────────────────────
  { id: ID.GEMMA_12B, displayName: "Gemma 3 12B", tier: "balanced", maxTokens: 4096 },
  { id: ID.LLAMA_SCOUT_17B, displayName: "Llama 4 Scout 17B", tier: "balanced", maxTokens: 4096 },
  { id: ID.GPT_OSS_20B, displayName: "GPT-OSS 20B", tier: "balanced", maxTokens: 4096 },
  { id: ID.MISTRAL_24B, displayName: "Mistral Small 3.1 24B", tier: "balanced", maxTokens: 4096 },
  // ── Quality Tier ──────────────────────────────────────────────────────
  { id: ID.QWEN_30B, displayName: "Qwen3 30B MoE", tier: "quality", maxTokens: 4096 },
  { id: ID.LLAMA_70B, displayName: "Llama 3.3 70B", tier: "quality", maxTokens: 4096 },
  { id: ID.GPT_OSS_120B, displayName: "GPT-OSS 120B", tier: "quality", maxTokens: 4096 },
] as const;

// ── Fallback Mapping ────────────────────────────────────────────────────────

/**
 * Fallback model IDs by tier.
 * If the primary model fails, try the fallback in the same tier.
 */
const FALLBACK_MAP: Readonly<Record<string, string>> = {
  // Fast tier fallbacks
  [ID.LLAMA_8B_FAST]: ID.GLM_FLASH,
  [ID.GLM_FLASH]: ID.LLAMA_8B_FAST,
  [ID.LLAMA_8B]: ID.LLAMA_8B_FAST,
  // Balanced tier fallbacks
  [ID.GEMMA_12B]: ID.LLAMA_SCOUT_17B,
  [ID.LLAMA_SCOUT_17B]: ID.GPT_OSS_20B,
  [ID.GPT_OSS_20B]: ID.MISTRAL_24B,
  [ID.MISTRAL_24B]: ID.GEMMA_12B,
  // Quality tier fallbacks
  [ID.QWEN_30B]: ID.LLAMA_70B,
  [ID.LLAMA_70B]: ID.GPT_OSS_120B,
  [ID.GPT_OSS_120B]: ID.QWEN_30B,
};

// ── Helper Functions ────────────────────────────────────────────────────────

/** Look up a model by its ID. Returns undefined if not found. */
function getModelById(modelId: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((m) => m.id === modelId);
}

/** Get all models in a given tier. */
function getModelsByTier(tier: ModelTier): readonly ModelDefinition[] {
  return MODEL_REGISTRY.filter((m) => m.tier === tier);
}

/** Get the fallback model ID for a given model ID. Returns undefined if none. */
function getFallbackModelId(modelId: string): string | undefined {
  return FALLBACK_MAP[modelId];
}

export {
  MODEL_REGISTRY,
  getFallbackModelId,
  getModelById,
  getModelsByTier,
};
