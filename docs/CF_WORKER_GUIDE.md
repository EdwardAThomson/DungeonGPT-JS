# Cloudflare Workers AI — Guide

**Worker name:** `dungeongpt-api`
**URL:** `https://dungeongpt-api.steep-mountain-8753.workers.dev`
**Stack:** Hono + Zod + TypeScript, deployed on Cloudflare Workers
**Source of truth:** `cf-worker/src/` — if this doc and the code disagree, the code wins.
**Last updated:** July 2026

---

## Architecture

### Entry point and middleware

`cf-worker/src/index.ts` — Hono app with global CORS middleware. Allowed origins: `localhost:3000/8787/8788`, `dungeongpt.xyz`, `*.dungeongpt-js.pages.dev`, and an optional `CUSTOM_DOMAIN` env var.

### Routes

| Route                  | File                    | Auth | Purpose |
|------------------------|-------------------------|------|---------|
| `GET  /health`         | `index.ts`              | No   | Liveness check |
| `GET  /api/ai/models`  | `routes/ai.ts`          | Yes  | List registered text models + default |
| `POST /api/ai/generate`| `routes/ai.ts`          | Yes  | Text generation (model, prompt, systemPrompt, maxTokens, temperature, optional `pool: 'free' \| 'premium'` — see AI Pools below). Rate-limited (`ai-generate` bucket) |
| `POST /api/embed`      | `routes/embed.ts`       | Yes  | Text embeddings (`@cf/baai/bge-base-en-v1.5`, 768-dim, max 100 texts) |
| `GET  /api/image/models`| `routes/image.ts`      | Yes  | List image models |
| `POST /api/image/generate`| `routes/image.ts`    | Yes* | Image generation (8 models; FLUX.2 uses REST API, others use AI binding) |
| `/api/db/*`            | `routes/db.ts`          | Yes  | Postgres CRUD proxy via Hyperdrive (heroes, saves, etc.) |
| `GET  /api/db/entitlements` | `routes/db.ts`     | Yes  | Caller's account tier: `{ tier, updatedAt }`, no row = `free`. Read-only (grants via psql, see `cf-worker/migrations/002_account_tiers.sql`); smoke test: `scripts/test-cf-entitlements.mjs` |
| `GET  /api/db/premium-templates` | `routes/db.ts` | Yes  | Server-delivered premium story templates (#40): `{ templates: [...] }` with only enabled `premium_templates` rows whose `min_tier` the caller's tier covers; free/no-row accounts get an empty list, never an error. Read-only (content loaded/disabled via psql, see the `cf-worker/migrations/004_premium_templates.sql` runbook); smoke test: `scripts/test-cf-premium.mjs` (manual, not auto-run) |

*Image generate currently has `requireAuth` commented out (TODO in code).

### Service layer

- **`services/models.ts`** — `MODEL_REGISTRY`, `DEFAULT_MODEL_ID`, `getFallbackCandidates()`, lookup helpers (free pool).
- **`services/ai.ts`** — `generateText()` orchestrates: resolve model (unknown IDs fall back to default), call Workers AI, handle response format variants, try fallback on failure, sanitize output (strips leaked prompt markers; `sanitizeResponse` is exported so the premium pool reuses the exact same pass).
- **`services/openrouter.ts`** — premium pool (#7): `PREMIUM_MODEL_REGISTRY`, `DEFAULT_PREMIUM_MODEL_ID`, `generatePremiumText()` (OpenRouter chat completions, same resolve/clamp/fallback/sanitize shape as `ai.ts`).
- **`services/pg.ts` / `services/tiers.ts`** — shared per-request postgres.js client (Hyperdrive) and the tier ladder + `getAccountTier()` lookup, used by `routes/db.ts`, the rate limiter, and the premium gate.

### Rate limiting (`middleware/rateLimit.ts`, backlog #12)

Fixed-window per-user counters in the `request_counters` Postgres table (migration `cf-worker/migrations/005_request_counters.sql`, applied manually via psql BEFORE deploying the limiter; see the migration header for the runbook and cleanup cron). Each counted request is one atomic upsert-increment (`INSERT ... ON CONFLICT ... DO UPDATE SET count = count + 1 RETURNING count`): a single DB round trip, race-free. The limiter **fails OPEN** on any DB error (availability over strictness, logged loudly) and is skipped when there is no `userId` (the `ALLOW_UNAUTHENTICATED_DEV` bypass).

| Bucket | Window | Limit | Applied to |
|--------|--------|-------|------------|
| `ai-generate` | 5 min | 30 free / 60 member+ | `POST /api/ai/generate` |
| `embed` | 5 min | 60 | `POST /api/embed` |
| `db-write` | 5 min | 120 | `POST/PUT/PATCH/DELETE /api/db/*` |
| `ai-premium-daily` | 1 day (UTC) | 120 member / 300 premium+ | premium-pool generations (checked in `routes/ai.ts`, not middleware) |

**Worst-case premium cost math (2026-07-06, gpt-5-mini default at ~$0.25/M input, ~$2/M output):** input capped at 32k chars (~8k tokens) and output at 800 tokens gives a ceiling of ~$0.0036 per generation. The MONTHLY allowance is the revenue-aligned bound: member 800/month (~$2.90 worst case against $5), premium 2000 (~$7.20 against $10), elite 4000 (~$14.40 against $20); daily caps (100/200/300) are burst protection within it. Typical generations (~3k in / 500 out) cost under $0.002, so realistic heavy play runs well under a dollar a month. Haiku 4.5 stays in the fallback chain for quality diversity. Player model choice is removed entirely: the premium pool always runs the server default chain.

`GET /api/db/*` (entitlements, premium-templates, saves reads) is deliberately **unthrottled**: reads are cheap and a counter upsert per read would roughly double their DB cost. The member-tier allowance lookup is lazy: the tier is only queried once a user is already past the free limit inside the current window. 429 responses carry `{ error, code: 'rate_limited', bucket, retryAfterSeconds }` plus a `Retry-After` header. Limits are constants in `rateLimit.ts` (`RATE_LIMITS`, `PREMIUM_DAILY_LIMITS`); tuning them is a code deploy, never a migration.

### AI pools (`routes/ai.ts` + `services/openrouter.ts`, backlog #7)

`POST /api/ai/generate` accepts an optional `pool` field: `'premium'` requests the Members OpenRouter pool; anything else (absent, `'free'`, unknown values) is the free Workers AI pool — never an error.

**Premium request contract:**

- Tier gate: `account_tiers` must rank member+ → otherwise `403 { error, code: 'premium_required' }`.
- Daily allowance: `ai-premium-daily` bucket (120/day member, 300/day premium+ (calibrated 2026-07-06 against worst-case cost: see below)) → over-allowance is `429 { error, code: 'premium_cap', retryAfterSeconds }`.
- Success: `200 { text, pool: 'premium' }`.
- OpenRouter failure (or missing `OPENROUTER_API_KEY`, or a DB error during the tier/allowance check): generation **falls back to the free pool automatically** — never a dead generation — and the response is marked: `200 { text, pool: 'free', fallbackFrom: 'premium', fallbackReason: 'premium_error' }`. A DB error never opens the paid pool.
- Free requests always answer `200 { text, pool: 'free' }` (the `pool` field is new; older clients simply ignore it).

**Premium model registry** (`PREMIUM_MODEL_REGISTRY`, curated cheap-fast frontier rungs, same conventions as `models.ts`: default first, fallback = default then registry order, first two candidates tried):

| Model ID | Display Name | Notes |
|----------|--------------|-------|
| `anthropic/claude-haiku-4.5` | Claude Haiku 4.5 | **DEFAULT_PREMIUM_MODEL_ID** — best prose per dollar of the class |
| `openai/gpt-5-mini` | GPT-5 Mini | Very cheap, reliable workhorse fallback |
| `google/gemini-3.5-flash` | Gemini 3.5 Flash | Lab-diversity fallback, long context |

The pool is the choice in production: clients send their free-pool model id and the premium default carries the pool (only ids present in `PREMIUM_MODEL_REGISTRY` are honored; everything else resolves to the premium default). The client side lives in `src/services/aiPool.js` (persisted preference, tier-gated request pool, pool-outcome notices), `src/services/llmService.js` (sends `pool`, retries once on `premium_cap`/`premium_required`), and the pool chips in `src/components/Modals.js`.

**Secret setup** (never `.env`; same pattern as `CF_API_TOKEN`):

```bash
cd cf-worker
npx wrangler secret put OPENROUTER_API_KEY   # production
# local dev: OPENROUTER_API_KEY=sk-or-... in cf-worker/.dev.vars (gitignored)
```

Smoke test: `scripts/test-cf-premium-ai.mjs` (manual, not auto-run; covers 401, the free-tier 403, the member 200 shape, the 429 cap shape, and unknown-pool collapse).

### Auth (`middleware/auth.ts`)

Supabase JWT verification with JWKS caching (10-min TTL). Validates expiration, issuer, and `role: "authenticated"`. Extracts `sub` claim as `userId`.

Checks `OCTONION_SUPABASE_URL` first, falls back to `SUPABASE_URL`. If neither is set, fails closed unless `ALLOW_UNAUTHENTICATED_DEV=true` (see Local Development below).

### Bindings (`types.ts`)

```typescript
interface Env {
  AI: Ai;                          // [ai] binding — no API key needed for text/embedding
  ENVIRONMENT: string;
  HYPERDRIVE: Hyperdrive;          // data Postgres (games box) via Cloudflare Hyperdrive
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  OCTONION_SUPABASE_URL?: string;
  OPENROUTER_API_KEY?: string;     // premium AI pool (#7); secret via wrangler
  CUSTOM_DOMAIN?: string;
  ALLOW_UNAUTHENTICATED_DEV?: string;
}
```

`CF_ACCOUNT_ID` and `CF_API_TOKEN` are only used by the image route for FLUX.2 models (REST API path). `OPENROUTER_API_KEY` powers the premium pool; when absent, premium requests degrade to the free pool (marked in the response).

---

## Production Models (July 2026)

Five models across three tiers. Trimmed from 15 after benchmark runs (commit `2a9ac5f`) and pared down further since.

| Tier     | Model ID                                      | Display Name        | maxTokens | Notes |
|----------|------------------------------------------------|---------------------|-----------|-------|
| ultra    | `@cf/openai/gpt-oss-120b`                      | GPT-OSS 120B        | 4096      | **DEFAULT_MODEL_ID** — best narrative quality (3.7s). |
| quality  | `@cf/openai/gpt-oss-20b`                       | GPT-OSS 20B         | 4096      | Recommended pick (⭐) in the frontend model picker. |
| quality  | `@cf/meta/llama-4-scout-17b-16e-instruct`      | Llama 4 Scout 17B   | 4096      | 17B MoE, multimodal-capable. |
| quality  | `@cf/google/gemma-3-12b-it`                    | Gemma 3 12B         | 4096      | Lightweight quality-tier option. |
| balanced | `@cf/meta/llama-3.1-8b-instruct-fast`          | Llama 3.1 8B Fast   | 2048      | Low-latency baseline (2.6s). |

### Fallback chain

On generation failure, `getFallbackCandidates(failedId)` returns the default model first (unless it was the one that failed), then every other registered model in `MODEL_REGISTRY` order. `ai.ts` tries the first two of those candidates in turn until one succeeds; if both fail, the error propagates to the client. There is no hand-maintained map — fallback order is derived from registry order, so any registered model can serve as a fallback. Unknown model IDs (e.g. a removed model cached in localStorage) are silently remapped to `DEFAULT_MODEL_ID` before the primary call.

### Token clamping

`generateText` takes `min(requested, model.maxTokens)`. The 8B model caps at 2048; everything else at 4096. `DEFAULT_MAX_TOKENS` in `ai.ts` is 500.

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

None of the current five models are R1-style reasoners, but the handler is defensive for future additions.

---

## Adding a New Model

Four files, none derived from the others — missing one leaves the model invisible, unservable, or untested:

1. **`cf-worker/src/services/models.ts`** — Add to `MODEL_REGISTRY` with appropriate `tier` and `maxTokens`. Its position in the registry also sets its place in the fallback order (see Fallback chain); there is no separate map to edit.
2. **`src/llm/llm_constants.js`** — Add to `AVAILABLE_MODELS['cf-workers']` so the frontend model picker shows it.
3. **`scripts/test-cf-models.mjs`** — Add to `ALL_MODELS` (direct CF API test).
4. **`scripts/test-cf-models-simple.mjs`** — Add to `TEST_MODELS` (worker-proxy test).

**If the model is a reasoner:** verify `DEFAULT_MAX_TOKENS` (currently 500) is high enough, or have the caller pass a larger `maxTokens`. The degraded-fallback path keeps it from 502ing, but the output quality will be poor.

**Validation:** Run Phase 1 automated tests against just the new model. If it clears >=80%, proceed to Phase 2/3 comparison against the incumbent in its tier. Fallback order follows `MODEL_REGISTRY` order automatically, so its ranking there is the only thing to get right.

---

## Manual Testing

### Setup

```bash
cd cf-worker && nvm use 20 && npm run dev   # local worker on :8787
```

Test script: `scripts/test-cf-models-simple.mjs` — set its `TEST_MODELS` array to match the 5 production IDs.

### Phase 1 — Automated protocol compliance

Run `test-cf-models-simple.mjs` against all 5 models. Scenarios: opening, interaction, movement, milestone, combat, town, skill_check, invalid_action.

| Gate | Production-ready | Minimum |
|------|------------------|---------|
| Average quality | >=90% | >=80% |

### Phase 2 — Multi-turn consistency (10 turns)

Test models: GPT-OSS 20B (primary), Gemma 3 12B, Llama 3.1 8B Fast. Optional: GPT-OSS 120B, Llama 4 Scout 17B.

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
npx wrangler secret put CF_API_TOKEN        # set production secret (image REST path)
npx wrangler secret put OPENROUTER_API_KEY  # premium AI pool secret (#7)
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
| Rate limiting middleware | `cf-worker/src/middleware/rateLimit.ts` |
| Text generation route | `cf-worker/src/routes/ai.ts` |
| Premium pool (OpenRouter) | `cf-worker/src/services/openrouter.ts` |
| Shared Postgres client / tier ladder | `cf-worker/src/services/pg.ts`, `cf-worker/src/services/tiers.ts` |
| Embedding route | `cf-worker/src/routes/embed.ts` |
| Image route | `cf-worker/src/routes/image.ts` |
| DB proxy route | `cf-worker/src/routes/db.ts` |
| Model registry | `cf-worker/src/services/models.ts` |
| AI service logic | `cf-worker/src/services/ai.ts` |
| Frontend LLM service | `src/services/llmService.js` |
| Frontend AI pool selection | `src/services/aiPool.js` |
| Frontend embedding service | `src/services/embeddingService.js` |
| Frontend model constants | `src/llm/llm_constants.js` |

## Automated tests (vitest, in-runtime)

`cd cf-worker && npm test` (or `npm run test:worker` from the root): vitest via
@cloudflare/vitest-pool-workers runs the suite INSIDE workerd, fully offline
(fake Postgres seam, stubbed AI binding, mocked fetch incl. a real-JWKS JWT
path), no credentials needed. Branch-gated premium tests in test/premium/
self-activate when the premium modules exist (probe import + skipIf). The
config deliberately does not inherit wrangler.toml bindings (the [ai] binding
would demand a Cloudflare token at pool startup); it parses compatibility
date/flags from wrangler.toml instead. CI: run the suite before wrangler
deploy in .github/workflows/deploy-worker.yml.
