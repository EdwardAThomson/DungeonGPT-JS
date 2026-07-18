import { AiServiceError, sanitizeResponse } from './ai';
import type { Env } from '../types';

// ─── Premium AI pool via OpenRouter (backlog #7) ──────────────────────────────
//
// The Members premium pool. Frontier-lab chat models reached through OpenRouter's
// OpenAI-compatible chat-completions API, paid per token, so access is tier-gated
// (member+) and allowance-capped (PREMIUM_DAILY_LIMITS in middleware/rateLimit.ts)
// by routes/ai.ts before this service is ever called.
//
// SECRET SETUP (never .env; same pattern as CF_API_TOKEN):
//   cd cf-worker && npx wrangler secret put OPENROUTER_API_KEY
//   Local dev: put OPENROUTER_API_KEY=sk-or-... in cf-worker/.dev.vars (gitignored).
// Key comes from https://openrouter.ai/keys. If the secret is missing, premium
// generation throws and routes/ai.ts falls back to the free pool: a missing key
// degrades quality, never availability.
//
// Model curation mirrors services/models.ts conventions: small fixed registry, one
// default, fallback candidates = default first then registry order. The pool IS the
// choice in production, so the client normally sends no premium model id; the
// default carries the pool. Unknown ids fall back to the default silently.

export interface PremiumModelDefinition {
  id: string;
  displayName: string;
  maxTokens: number;
  /**
   * OpenRouter provider slugs this model may be served by (sent as
   * provider.only with allow_fallbacks:false). Used to pin Chinese-origin
   * open-weight models to US-based inference hosts so player prompts never
   * route to Chinese-hosted endpoints. Omit for frontier-lab models that only
   * have first-party hosting.
   */
  providerOnly?: readonly string[];
}

/**
 * Curated premium registry. Criteria: strong narrative prose, wide availability on
 * OpenRouter, and sane per-token cost for a game that makes many small calls
 * (~500-token DM turns). Deliberately the cheap-fast rung of each frontier lab,
 * NOT the flagship rung: the visible jump from open-weights is already large, and
 * the daily allowance math only works at this price class.
 *
 *   anthropic/claude-haiku-4.5   default: best prose quality per dollar of the
 *                               class, strong instruction-following for the strict
 *                               DM protocol.
 *   openai/gpt-5-mini           very cheap, reliable, excellent availability; the
 *   anthropic/claude-haiku-4.5  default: best name-grounding of the three in play.
 *   openai/gpt-5-mini           cheap workhorse fallback.
 *   google/gemini-3.5-flash     fast, long context; diversity fallback so a single-
 *                               lab outage never empties the pool.
 */
export const PREMIUM_MODEL_REGISTRY: readonly PremiumModelDefinition[] = [
  {
    id: 'anthropic/claude-haiku-4.5',
    displayName: 'Claude Haiku 4.5',
    maxTokens: 1500,
  },
  {
    id: 'openai/gpt-5-mini',
    displayName: 'GPT-5 Mini',
    maxTokens: 1500,
  },
  {
    id: 'google/gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    maxTokens: 1500,
  },
  // ── PROPOSAL (2026-07-15 model trial, NOT yet a default change) ────────────
  // Cheap Members-tier candidate: ~10x cheaper than Haiku ($0.27/$0.40 per 1M
  // vs $1/$5, live OR catalog 2026-07-15). Provider-pinned to US hosts (slugs
  // verified against /api/v1/models/deepseek/deepseek-v3.2/endpoints). Placed
  // LAST so the existing fallback chain (default + next two) is unchanged; it
  // is only reachable by explicit modelId until the maintainer flips the
  // default. Evaluate first with scripts/eval-premium-models.mjs; if a Kimi or
  // GLM candidate wins instead, swap this entry (moonshotai/kimi-k2.6 pin:
  // deepinfra/fireworks/parasail/baseten/wandb; z-ai/glm-5.2 pin adds
  // together). Trial context: octonion docs/ai-cost-analysis.md.
  {
    id: 'deepseek/deepseek-v3.2',
    displayName: 'DeepSeek V3.2',
    maxTokens: 1500,
    providerOnly: ['deepinfra', 'digitalocean', 'venice'],
  },
];

// Default flipped to Haiku 4.5 (2026-07-07): in playtest gpt-5-mini conflated the
// town name with character names and ran terse; Haiku follows the name-grounding
// prompt better and reads richer. gpt-5-mini stays next in the chain as the cheap
// fallback. Output cap raised 800 -> 1500 for parity with the free pool (premium
// reading SHORTER than free was backwards); worst-case output cost roughly doubles
// per call but stays fractions of a cent, bounded overall by the monthly allowance.
export const DEFAULT_PREMIUM_MODEL_ID = 'anthropic/claude-haiku-4.5';
// Registry verified against the LIVE OpenRouter catalog on 2026-07-06 (the first
// draft named claude-3.5-haiku, which no longer exists there at all): re-verify
// ids against https://openrouter.ai/api/v1/models when touching this list.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Output clamp: 800 tokens is a generous long narration; the per-model cap in
// the registry enforces it even against a client-requested maxTokens (cost
// ceiling per generation, maintainer 2026-07-06).
const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_TEMPERATURE = 0.7;

export function getPremiumModelById(
  modelId: string
): PremiumModelDefinition | undefined {
  return PREMIUM_MODEL_REGISTRY.find((m) => m.id === modelId);
}

/**
 * Fallback candidates for a failed premium model: default first, then remaining
 * registry order (same convention as services/models.ts getFallbackCandidates).
 */
export function getPremiumFallbackCandidates(failedModelId: string): string[] {
  const candidates: string[] = [];
  if (failedModelId !== DEFAULT_PREMIUM_MODEL_ID) {
    candidates.push(DEFAULT_PREMIUM_MODEL_ID);
  }
  for (const model of PREMIUM_MODEL_REGISTRY) {
    if (model.id !== failedModelId && !candidates.includes(model.id)) {
      candidates.push(model.id);
    }
  }
  return candidates;
}

/** Is the premium pool usable at all (secret present)? */
export function isPremiumPoolConfigured(env: Env): boolean {
  return typeof env.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.length > 0;
}

interface PremiumGenerateOptions {
  prompt: string;
  /** Optional premium model id; unknown/absent ids resolve to the default. */
  modelId?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

async function callOpenRouter(
  env: Env,
  modelId: string,
  prompt: string,
  maxTokens: number,
  temperature: number,
  systemPrompt?: string
): Promise<{ text: string }> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  // US-host pin for models that declare one (see PremiumModelDefinition):
  // provider.only restricts routing to the listed hosts and allow_fallbacks
  // false stops OpenRouter widening the pool when they are busy. A model with
  // no pin (frontier labs) keeps OpenRouter's default routing. Ids outside the
  // registry resolve to undefined and are likewise unpinned.
  const providerOnly = getPremiumModelById(modelId)?.providerOnly;

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        // OpenRouter attribution headers (optional, used for their rankings page).
        'HTTP-Referer': 'https://dungeongpt.xyz',
        'X-Title': 'DungeonGPT',
      },
      body: JSON.stringify({
        model: modelId,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(providerOnly
          ? { provider: { only: [...providerOnly], allow_fallbacks: false } }
          : {}),
      }),
    });
  } catch (error: unknown) {
    console.error(`OpenRouter network error for model ${modelId}:`, error);
    throw new AiServiceError(
      `OpenRouter network error: ${error instanceof Error ? error.message : String(error)}`,
      502
    );
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '');
    console.error(
      `OpenRouter HTTP ${response.status} for model ${modelId}: ${bodyText.slice(0, 500)}`
    );
    throw new AiServiceError(`OpenRouter error: HTTP ${response.status}`, 502);
  }

  const data = (await response.json().catch(() => null)) as any;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string' && content.length > 0) {
    return { text: content };
  }

  console.error('Unexpected OpenRouter response format:', JSON.stringify(data)?.slice(0, 500));
  throw new AiServiceError('Unexpected OpenRouter response format', 502);
}

/**
 * Premium-pool text generation with the same shape and posture as generateText in
 * services/ai.ts: resolve model (unknown -> default), clamp tokens, try the primary,
 * then walk up to two fallback candidates. Applies the SAME sanitization pass as the
 * free pool (sanitizeResponse is imported from services/ai.ts, not duplicated).
 * Throws AiServiceError when the pool is unconfigured or every candidate fails;
 * routes/ai.ts catches that and falls back to the free pool so a generation is
 * never dead.
 */
export async function generatePremiumText(
  env: Env,
  options: PremiumGenerateOptions
): Promise<{ text: string; modelId: string }> {
  if (!isPremiumPoolConfigured(env)) {
    throw new AiServiceError(
      'Premium pool unconfigured: OPENROUTER_API_KEY secret is not set',
      503
    );
  }

  let model = options.modelId ? getPremiumModelById(options.modelId) : undefined;
  if (!model) {
    if (options.modelId) {
      console.warn(
        `Unknown premium model "${options.modelId}", falling back to default "${DEFAULT_PREMIUM_MODEL_ID}"`
      );
    }
    model = getPremiumModelById(DEFAULT_PREMIUM_MODEL_ID);
    if (!model) {
      throw new AiServiceError(
        `Default premium model "${DEFAULT_PREMIUM_MODEL_ID}" not found in registry`,
        500
      );
    }
  }

  const maxTokens = Math.min(options.maxTokens ?? DEFAULT_MAX_TOKENS, model.maxTokens);
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;

  try {
    const primary = await callOpenRouter(
      env,
      model.id,
      options.prompt,
      maxTokens,
      temperature,
      options.systemPrompt
    );
    return { text: sanitizeResponse(primary.text), modelId: model.id };
  } catch (primaryError: unknown) {
    console.error(
      `Primary premium model ${model.id} failed:`,
      primaryError instanceof Error ? primaryError.message : primaryError
    );

    const candidates = getPremiumFallbackCandidates(model.id);
    for (const candidateId of candidates.slice(0, 2)) {
      const fallbackModel = getPremiumModelById(candidateId);
      if (!fallbackModel) continue;

      console.log(`Falling back to premium model: ${fallbackModel.id}`);
      try {
        const fallback = await callOpenRouter(
          env,
          fallbackModel.id,
          options.prompt,
          Math.min(maxTokens, fallbackModel.maxTokens),
          temperature,
          options.systemPrompt
        );
        return { text: sanitizeResponse(fallback.text), modelId: fallbackModel.id };
      } catch (fallbackError: unknown) {
        console.error(
          `Fallback premium model ${fallbackModel.id} also failed:`,
          fallbackError instanceof Error ? fallbackError.message : fallbackError
        );
      }
    }

    const errMsg =
      primaryError instanceof Error ? primaryError.message : String(primaryError);
    throw new AiServiceError(
      `Premium AI generation failed (all fallbacks exhausted): ${errMsg}`,
      502
    );
  }
}
