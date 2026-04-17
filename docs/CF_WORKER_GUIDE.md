# Cloudflare Workers AI — Guide

**Worker name:** `dungeongpt-api`
**URL:** `https://dungeongpt-api.steep-mountain-8753.workers.dev`
**Stack:** Hono + Zod + TypeScript, deployed on Cloudflare Workers
**Source of truth:** `cf-worker/src/` — if this doc and the code disagree, the code wins.
**Last updated:** April 2026

---

## Architecture

### Entry point and middleware

`cf-worker/src/index.ts` — Hono app with global CORS middleware. Allowed origins: `localhost:3000/8787/8788`, `dungeongpt.xyz`, `*.dungeongpt-js.pages.dev`, and an optional `CUSTOM_DOMAIN` env var.

### Routes

| Route                  | File                    | Auth | Purpose |
|------------------------|-------------------------|------|---------|
| `GET  /health`         | `index.ts`              | No   | Liveness check |
| `GET  /api/ai/models`  | `routes/ai.ts`          | Yes  | List registered text models + default |
| `POST /api/ai/generate`| `routes/ai.ts`          | Yes  | Text generation (model, prompt, systemPrompt, maxTokens, temperature) |
| `POST /api/embed`      | `routes/embed.ts`       | Yes  | Text embeddings (`@cf/baai/bge-base-en-v1.5`, 768-dim, max 100 texts) |
| `GET  /api/image/models`| `routes/image.ts`      | Yes  | List image models |
| `POST /api/image/generate`| `routes/image.ts`    | Yes* | Image generation (8 models; FLUX.2 uses REST API, others use AI binding) |
| `/api/db/*`            | `routes/db.ts`          | Yes  | Supabase CRUD proxy (heroes, saves, etc.) |

*Image generate currently has `requireAuth` commented out (TODO in code).

### Service layer

- **`services/models.ts`** — `MODEL_REGISTRY`, `DEFAULT_MODEL_ID`, `FALLBACK_MAP`, lookup helpers.
- **`services/ai.ts`** — `generateText()` orchestrates: resolve model (unknown IDs fall back to default), call Workers AI, handle response format variants, try fallback on failure, sanitize output (strips leaked prompt markers).

### Auth (`middleware/auth.ts`)

Supabase JWT verification with JWKS caching (10-min TTL). Validates expiration, issuer, and `role: "authenticated"`. Extracts `sub` claim as `userId`.

Checks `OCTONION_SUPABASE_URL` first, falls back to `SUPABASE_URL`. If neither is set, fails closed unless `ALLOW_UNAUTHENTICATED_DEV=true` (see Local Development below).

### Bindings (`types.ts`)

```typescript
interface Env {
  AI: Ai;                          // [ai] binding — no API key needed for text/embedding
  ENVIRONMENT: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  OCTONION_SUPABASE_URL?: string;
  CUSTOM_DOMAIN?: string;
  ALLOW_UNAUTHENTICATED_DEV?: string;
}
```

`CF_ACCOUNT_ID` and `CF_API_TOKEN` are only used by the image route for FLUX.2 models (REST API path).

---

## Production Models (April 2026)

Seven models across five tiers. Trimmed from 15 after benchmark runs (commit `2a9ac5f`).

| Tier     | Model ID                                      | Display Name        | maxTokens | Notes |
|----------|------------------------------------------------|---------------------|-----------|-------|
| ultra    | `@cf/openai/gpt-oss-120b`                      | GPT-OSS 120B        | 4096      | Best narrative quality; slower (3.7s). |
| premium  | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`     | Llama 3.3 70B       | 4096      | FP8 quantized; 7.2s. Fallback target. |
| quality  | `@cf/openai/gpt-oss-20b`                       | GPT-OSS 20B         | 4096      | UI default pick for "good DM". |
| quality  | `@cf/meta/llama-4-scout-17b-16e-instruct`      | Llama 4 Scout 17B   | 4096      | 17B MoE, multimodal-capable. |
| quality  | `@cf/google/gemma-3-12b-it`                    | Gemma 3 12B         | 4096      | Fallback for the default model. |
| balanced | `@cf/meta/llama-3.1-8b-instruct-fast`          | Llama 3.1 8B Fast   | 2048      | **DEFAULT_MODEL_ID** — low-latency baseline (2.6s). |
| fast     | `@cf/meta/llama-3.2-3b-instruct`               | Llama 3.2 3B        | 2048      | Budget; ~95% protocol compliance, occasional failures. |

### Fallback chain

```
llama-3.1-8b-instruct-fast  -->  gemma-3-12b-it
gemma-3-12b-it              -->  llama-3.3-70b-instruct-fp8-fast
llama-3.3-70b-instruct-fp8-fast --> llama-3.1-8b-instruct-fast
```

Only these three participate. Other models fail closed (error propagates to client). Unknown model IDs (e.g. removed model cached in localStorage) are silently remapped to `DEFAULT_MODEL_ID` before the primary call.

### Token clamping

`generateText` takes `min(requested, model.maxTokens)`. The 8B and 3B models cap at 2048; everything else at 4096. `DEFAULT_MAX_TOKENS` in `ai.ts` is 500.

### Response format

Legacy CF models return `{ response: "text" }`. Newer models (GPT-OSS, Llama 4 Scout) return OpenAI-compatible `{ choices: [{ message: { content } }] }`. `callWorkersAi` handles both transparently.

---

## Reasoning-Model Handling

Some Workers AI models emit chain-of-thought into `choices[0].message.reasoning` and only populate `content` once thinking completes. If `max_tokens` runs out mid-reasoning, `content` is `null` while `reasoning` holds partial planning text.

**What `callWorkersAi` does (commit `e454761`):**

1. Prefer `content` if present and non-empty.
2. If `content` is null/empty but `reasoning` exists, return reasoning as a **degraded fallback** and log a warning.
3. If neither is usable, throw `AiServiceError` (502).

**Operational signal:** the warning in worker logs means a caller's `maxTokens` is too low for that model. Bump `DEFAULT_MAX_TOKENS` or have the caller pass a larger value. The reasoning text is not real DM narration.

None of the current seven models are R1-style reasoners, but the handler is defensive for future additions.

---

## Adding a New Model

Four files, none derived from the others — missing one leaves the model invisible, unservable, or untested:

1. **`cf-worker/src/services/models.ts`** — Add to `MODEL_REGISTRY` with appropriate `tier` and `maxTokens`. Decide if it belongs in `FALLBACK_MAP`.
2. **`src/llm/llm_constants.js`** — Add to `AVAILABLE_MODELS['cf-workers']` so the frontend model picker shows it.
3. **`scripts/test-cf-models.mjs`** — Add to `ALL_MODELS` (direct CF API test).
4. **`scripts/test-cf-models-simple.mjs`** — Add to `TEST_MODELS` (worker-proxy test).

**If the model is a reasoner:** verify `DEFAULT_MAX_TOKENS` (currently 500) is high enough, or have the caller pass a larger `maxTokens`. The degraded-fallback path keeps it from 502ing, but the output quality will be poor.

**Validation:** Run Phase 1 automated tests against just the new model. If it clears >=80%, proceed to Phase 2/3 comparison against the incumbent in its tier. If it replaces a model in `FALLBACK_MAP`, update the map.

---

## Manual Testing

### Setup

```bash
cd cf-worker && nvm use 20 && npm run dev   # local worker on :8787
```

Test script: `scripts/test-cf-models-simple.mjs` — set its `TEST_MODELS` array to match the 7 production IDs.

### Phase 1 — Automated protocol compliance

Run `test-cf-models-simple.mjs` against all 7 models. Scenarios: opening, interaction, movement, milestone, combat, town, skill_check, invalid_action.

| Gate | Production-ready | Minimum |
|------|------------------|---------|
| Average quality | >=90% | >=80% |

### Phase 2 — Multi-turn consistency (10 turns)

Test models: GPT-OSS 20B (primary), Gemma 3 12B, Llama 3.1 8B Fast. Optional: Llama 3.3 70B, Llama 4 Scout 17B.

Scenario "The Cursed Village": war-torn kingdom, level-5 party (Kael/Lyra/Bram), 10 turns covering arrival through combat to milestone completion. Score on Consistency, Tone, Milestone Tracking, Combat Handling, NPC Characterization (5 each). Target: >=20/25, minimum 16/25.

### Phase 3 — Comparative quality (4 scenarios)

Models: GPT-OSS 20B, Gemma 3 12B, Llama 3.1 8B Fast. Four scenarios (Mysterious Artifact, Destroyed Bridge, Nervous Innkeeper, Moral Dilemma) scoring Creativity, Detail, Player Agency, etc. Target: >=45/60, minimum 36/60.

### Phase 4 — Stress

- **4A** Long context (20 turns) — note degradation point and recall of turn-1 events at turn 20.
- **4B** Invalid input — nonsensical, impossible, meta-breaking, contradictory. Expect in-character redirection.
- **4C** Rapid milestones — three back-to-back completions, verify each emits the `[COMPLETE_MILESTONE]` tag.
- **4D** Character death — death saves + revive attempt. Expect rules-aware, emotionally weighted handling.

Target: >=4/5 average, minimum 3/5.

---

## Local Development

### Wrangler commands

```bash
cd cf-worker
nvm use 20
npm run dev          # wrangler dev (local on :8787)
npx wrangler deploy  # deploy to production
npx wrangler secret put CF_API_TOKEN  # set production secret
```

### wrangler.toml essentials

```toml
name = "dungeongpt-api"
main = "src/index.ts"
compatibility_date = "2025-02-14"
compatibility_flags = ["nodejs_compat"]

[ai]
binding = "AI"   # gives env.AI — no API key needed for text/embedding models
```

### Auth bypass for local testing

The local worker still runs the auth middleware. To bypass it without a real Supabase JWT:

1. Back up `cf-worker/.dev.vars`.
2. Comment out `SUPABASE_URL` and `OCTONION_SUPABASE_URL`.
3. Add `ALLOW_UNAUTHENTICATED_DEV=true`.
4. The middleware only honors the bypass when no JWKS URL is configured.
5. **Restore `.dev.vars` after testing.**

### Frontend integration

```javascript
const CF_WORKER_URL = process.env.REACT_APP_CF_WORKER_URL || "http://localhost:8787";

// Text generation
const res = await fetch(`${CF_WORKER_URL}/api/ai/generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ provider: "cf-workers", model: modelId, prompt, maxTokens: 1024 }),
});

// Embedding
const res = await fetch(`${CF_WORKER_URL}/api/embed`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
  body: JSON.stringify({ text: ["some text"] }),
});
```

### Key files reference

| What | Path |
|------|------|
| Worker entry + CORS | `cf-worker/src/index.ts` |
| Auth middleware | `cf-worker/src/middleware/auth.ts` |
| Text generation route | `cf-worker/src/routes/ai.ts` |
| Embedding route | `cf-worker/src/routes/embed.ts` |
| Image route | `cf-worker/src/routes/image.ts` |
| DB proxy route | `cf-worker/src/routes/db.ts` |
| Model registry | `cf-worker/src/services/models.ts` |
| AI service logic | `cf-worker/src/services/ai.ts` |
| Frontend LLM service | `src/services/llmService.js` |
| Frontend embedding service | `src/services/embeddingService.js` |
| Frontend model constants | `src/llm/llm_constants.js` |
