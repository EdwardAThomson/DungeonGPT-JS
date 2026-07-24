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
| `POST /api/ai/generate`| `routes/ai.ts`          | Yes  | Text generation (model, prompt, systemPrompt, `maxTokens` (schema-capped at **1500**; a larger value 400s), temperature, optional `pool: 'free' \| 'premium'` — see AI Pools below). Rate-limited (`ai-generate` bucket) |
| `POST /api/embed`      | `routes/embed.ts`       | Yes  | Text embeddings (`@cf/baai/bge-base-en-v1.5`, 768-dim, max 100 texts) |
| `GET  /api/image/models`| `routes/image.ts`      | Yes  | List image models |
| `POST /api/image/generate`| `routes/image.ts`    | Yes* | Image generation (8 models; FLUX.2 uses REST API, others use AI binding) |
| `/api/db/*`            | `routes/db.ts`          | Yes  | Postgres CRUD proxy via Hyperdrive (heroes, saves, etc.). All responses carry `Cache-Control: no-store`; every read/write is owner-scoped (`WHERE user_id = ${userId}`, including the revision-guarded conversation upsert and its guard-miss branch). The conversations **list** GET selects only lightweight columns (no `conversation_data`/`world_map`/`sub_maps`/`summary`). Hero create/update names are validated server-side (`services/validation.ts`) |
| `GET  /api/db/entitlements` | `routes/db.ts`     | Yes  | Caller's **effective** account tier: `{ tier, updatedAt, expiresAt }`, no row = `free`. Effective tier = base `account_tiers` row MAX any unexpired `tier_grants` (see `services/tiers.ts`); `expiresAt` is the grant end date when a grant supplies the tier (additive, `null` when the base row covers it). Read-only (base grants via psql `002_account_tiers.sql`; time-boxed grants also arrive via `POST /api/db/redeem-code`); smoke test: `scripts/test-cf-entitlements.mjs` |
| `GET  /api/entitlements` | `routes/entitlements.ts` | Yes | Caller's **merged** entitlements snapshot: `{ tier, updatedAt, expiresAt, hub, usage }`. Reports `MAX(local game-ladder tier, hub billing tier)` via the shared `services/mergedTier.ts` resolver (the SAME resolver the server enforcement points use since hub payments Phase 3, so the snapshot and the gates cannot drift) so manual grants and redemption codes never regress while billing moves to the Octonion hub. `tier` is the effective game-ladder tier; `updatedAt`/`expiresAt` keep the `GET /api/db/entitlements` contract; `hub` is the raw hub snapshot (display metadata only, every gate keys on `tier`); `usage` (additive, #6 visibility slice) is the premium-pool allowance meter for member+ callers: `{ premiumDaily: { used, limit }, premiumMonthly: { used, limit } }`, a read-only peek at the same `request_counters` rows the `routes/ai.ts` gate bumps, `null` for free tier or when the counter read fails (display only; enforcement stays in `routes/ai.ts`). Both tier sources fail closed independently → both failing yields `free` with a `200`, never a `500`. `Cache-Control: no-store`. Client: `src/services/entitlementsApi.js` (the app now fetches this route, not `/api/db/entitlements`); the Profile page renders the meter plus the hub credit balance |
| `POST /api/db/redeem-code` | `routes/db.ts`      | Yes  | Redeem a membership code (billing MVP #6, migration `006_redemption_codes.sql`): body `{ code }`, success `200 { tier, expiresAt }` grants a time-boxed `tier_grants` row atomically. Generic `400 code_invalid` for any dead code, `409 already_redeemed`, per-user `429 rate_limited` (10/day, fails CLOSED). See `docs/REDEMPTION_CODES.md` |
| `GET  /api/db/premium-templates` | `routes/db.ts` | Yes  | Server-delivered premium story templates (#40): `{ templates: [...] }` with all enabled `premium_templates` rows: the full template when the caller's tier covers `min_tier`, otherwise a marketing-safe **teaser** (card-face metadata only: id, name, subtitle, tier, levelRange, shortDescription, theme, minTier, `teaser: true`; authored content (settings, milestones, customNames, NPCs, rewards) never leaves the server below tier). Free/no-row accounts get teasers, never an error. Since hub payments Phase 3 the tier check is the merged tier (`services/mergedTier.ts`, local MAX hub), so a hub subscriber with no local `account_tiers` row still receives full templates. Read-only (content loaded/disabled via psql, see the `cf-worker/migrations/004_premium_templates.sql` runbook); smoke test: `scripts/test-cf-premium.mjs` (manual, not auto-run) |

*Image generate currently has `requireAuth` commented out (TODO in code).

### Service layer

- **`services/models.ts`** — `MODEL_REGISTRY`, `DEFAULT_MODEL_ID`, `getFallbackCandidates()`, lookup helpers (free pool).
- **`services/ai.ts`** — `generateText()` orchestrates: resolve model (unknown IDs fall back to default), call Workers AI, handle response format variants, try fallback on failure, sanitize output (strips leaked prompt markers and, since #76 Phase 1, any `[COMPLETE_MILESTONE...]`/`[COMPLETE_CAMPAIGN]` completion marker — the engine referees completions, the LLM only narrates; `sanitizeResponse` is exported so the premium pool reuses the exact same pass).
- **`services/openrouter.ts`** — premium pool (#7): `PREMIUM_MODEL_REGISTRY`, `DEFAULT_PREMIUM_MODEL_ID`, `generatePremiumText()` (OpenRouter chat completions, same resolve/clamp/fallback/sanitize shape as `ai.ts`).
- **`services/pg.ts` / `services/tiers.ts`** — shared per-request postgres.js client (Hyperdrive) and the tier ladder + `getAccountTier()` lookup, used by `routes/db.ts`, the rate limiter, and the premium gate. `getAccountTier()` returns the **effective** tier = base `account_tiers` row MAX any unexpired `tier_grants` (redemption-code grants, #6); expiry is passive and a grant never lowers the base, so premium-templates / premium-AI / allowances all honour grants with no further changes.
- **`services/hubEntitlements.ts`** — hub payments Phase 1: `getHubEntitlements()` reads the Octonion hub's billing tier (`GET ${HUB_URL}/api/me/entitlements` with the user's forwarded JWT), 60 s per-user cache mirroring the JWKS-cache pattern, 3 s timeout, **fails closed to free** (failures uncached). `hubTierToGameTier()` normalizes the hub's `members` rung onto the game ladder's `member` in exactly one place. Consumed by `services/mergedTier.ts`.
- **`services/mergedTier.ts`** — hub payments Phase 3: `getMergedTier()` is THE one shared answer to "what tier is this caller, really?": effective game-ladder tier = `MAX(local effective tier, hub tier mapped onto the game ladder)`. Local (`account_tiers` + `tier_grants`) is consulted first (one indexed round trip, no network); an optional `skipHubAtOrAbove` skips the hub call entirely when the local tier already satisfies the admission bar. Never throws, each source degrades to `free` independently, and errors can only narrow access, never widen it. Returns `localErrored` so a gate can distinguish a genuine `free` verdict (deny with an upgrade prompt) from a local-DB outage (degrade politely). Consumed by the premium AI gate (`routes/ai.ts`), premium-content delivery (`routes/db.ts` premium-templates), and the client snapshot (`routes/entitlements.ts`). Tests: `cf-worker/test/hub-tier-gates.test.ts`.
- **`services/validation.ts`**: server-side hero-name allowlist (`validateHeroName`, `sanitizeHeroName`; length `HERO_NAME_MIN` to `HERO_NAME_MAX`, i.e. 2 to 40, Latin letters plus diacritics/digits/space/apostrophe/hyphen). Mirrors the client `src/utils/validation.js` and is enforced in `routes/db.ts` on hero create/update so a crafted client cannot persist a name outside the allowlist.

### Rate limiting (`middleware/rateLimit.ts`, backlog #12)

Fixed-window per-user counters in the `request_counters` Postgres table (migration `cf-worker/migrations/005_request_counters.sql`, applied manually via psql BEFORE deploying the limiter; see the migration header for the runbook and cleanup cron). Each counted request is one atomic upsert-increment (`INSERT ... ON CONFLICT ... DO UPDATE SET count = count + 1 RETURNING count`): a single DB round trip, race-free. The limiter **fails OPEN** on any DB error (availability over strictness, logged loudly) and is skipped when there is no `userId` (the `ALLOW_UNAUTHENTICATED_DEV` bypass).

| Bucket | Window | Limit | Applied to |
|--------|--------|-------|------------|
| `ai-generate` | 5 min | 30 free / 60 member+ | `POST /api/ai/generate` |
| `embed` | 5 min | 60 | `POST /api/embed` |
| `db-write` | 5 min | 120 | `POST/PUT/PATCH/DELETE /api/db/*` |
| `ai-premium-daily` | 1 day (UTC) | 100 member / 200 premium / 300 elite | premium-pool generations (checked in `routes/ai.ts`, not middleware) |
| `ai-premium-monthly` | 30 days | 800 member / 2000 premium / 4000 elite | premium-pool generations, the subscription-aligned ceiling (also checked in `routes/ai.ts`) |

**Worst-case premium cost math:** input is capped at 32k chars (~8k tokens) and output at **1500 tokens** (raised from 800 for free-pool parity, 2026-07-07). Raising the output cap roughly doubles the worst-case cost per call, but it stays fractions of a cent; the default model flipped from `gpt-5-mini` to `claude-haiku-4.5` at the same time (better name-grounding, gpt-5-mini stays next in the chain as the cheap workhorse). The MONTHLY allowance is the revenue-aligned bound: member 800/month, premium 2000, elite 4000 generations; daily caps (100/200/300) are burst protection within it. Realistic heavy play still runs well under a dollar a month. Player model choice is removed entirely: the premium pool always runs the server default chain.

`GET /api/db/*` (entitlements, premium-templates, saves reads) is deliberately **unthrottled**: reads are cheap and a counter upsert per read would roughly double their DB cost. The member-tier allowance lookup is lazy: the tier is only queried once a user is already past the free limit inside the current window. 429 responses carry `{ error, code: 'rate_limited', bucket, retryAfterSeconds }` plus a `Retry-After` header. Limits are constants in `rateLimit.ts` (`RATE_LIMITS`, `PREMIUM_DAILY_LIMITS`, `PREMIUM_MONTHLY_LIMITS`); tuning them is a code deploy, never a migration. The monthly limits are kept in lock-step with the Octonion hub's per-tier monthly credit allowances (granted by the hub's Stripe webhook); if either side changes, the other must move with it (see the note above `PREMIUM_MONTHLY_LIMITS` in `rateLimit.ts`).

### AI pools (`routes/ai.ts` + `services/openrouter.ts`, backlog #7)

`POST /api/ai/generate` accepts an optional `pool` field: `'premium'` requests the Members OpenRouter pool; anything else (absent, `'free'`, unknown values) is the free Workers AI pool — never an error.

**Premium request contract:**

- Tier gate (hub payments Phase 3): the **merged** tier must rank member+, where merged = `MAX(local account_tiers + tier_grants, hub billing tier)` via `services/mergedTier.ts` (a local member skips the hub round trip via `skipHubAtOrAbove`; a hub subscriber with no local row is admitted). A genuine `free` verdict → `403 { error, code: 'premium_required' }`; when the local lookup ERRORED and the hub could not vouch either, the request instead degrades to the free pool with the fallback fields (never 403 a possibly-paying member over a DB blip).
- Daily allowance: `ai-premium-daily` bucket (100/day member, 200/day premium, 300/day elite (calibrated 2026-07-06 against worst-case cost: see below)) → over-allowance is `429 { error, code: 'premium_cap', retryAfterSeconds }`.
- Monthly allowance: `ai-premium-monthly` bucket (800/month member, 2000 premium, 4000 elite), the subscription-aligned ceiling → same `429 premium_cap` shape.
- Success: `200 { text, pool: 'premium' }`.
- OpenRouter failure (or missing `OPENROUTER_API_KEY`, or a DB error during the allowance check): generation **falls back to the free pool automatically** — never a dead generation — and the response is marked: `200 { text, pool: 'free', fallbackFrom: 'premium', fallbackReason: 'premium_error' }`. A DB error never opens the paid pool.
- Free requests always answer `200 { text, pool: 'free' }` (the `pool` field is new; older clients simply ignore it).

**Premium model registry** (`PREMIUM_MODEL_REGISTRY`, curated cheap-fast frontier rungs, same conventions as `models.ts`: default first, fallback = default then registry order, first two candidates tried):

| Model ID | Display Name | Notes |
|----------|--------------|-------|
| `anthropic/claude-haiku-4.5` | Claude Haiku 4.5 | **DEFAULT_PREMIUM_MODEL_ID**: better name-grounding and richer prose |
| `openai/gpt-5-mini` | GPT-5 Mini | First fallback: very cheap, reliable workhorse |
| `google/gemini-3.5-flash` | Gemini 3.5 Flash | Lab-diversity fallback, long context |
| `deepseek/deepseek-v3.2` | DeepSeek V3.2 | Inert proposal candidate (reachable only by explicit modelId; last in registry order so the default + fallback chain are unchanged). Carries `providerOnly: ['deepinfra', 'digitalocean', 'venice']`, sent to OpenRouter as `provider.only` + `allow_fallbacks: false` to pin inference to US hosts |

A registry entry may carry an optional `providerOnly` list to pin which OpenRouter providers may serve it (no pin means any provider). Every rung caps output at **1500 tokens** (raised from 800 for parity with the free pool); the registry enforces the cap even against a client-requested `maxTokens`.

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
  HUB_URL?: string;                // Octonion hub base URL (billing reads); [vars], defaults to https://octonion.io
  OPENROUTER_API_KEY?: string;     // premium AI pool (#7); secret via wrangler
  CUSTOM_DOMAIN?: string;
  ALLOW_UNAUTHENTICATED_DEV?: string;
}
```

`CF_ACCOUNT_ID` and `CF_API_TOKEN` are only used by the image route for FLUX.2 models (REST API path). `OPENROUTER_API_KEY` powers the premium pool; when absent, premium requests degrade to the free pool (marked in the response). `HUB_URL` is a plain `[vars]` entry (not a secret) pointing at the Octonion billing hub; it defaults to `https://octonion.io` and can target a local hub via `.dev.vars`.

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
- **4C** Rapid milestones — three back-to-back completions, verify each emits the `[COMPLETE_MILESTONE]` tag. *(Historical: markers were retired by #76 Phase 1, 2026-07-19 — completions are now engine-refereed and the worker strips any leaked marker, so a rerun would instead verify clean narration with no control tokens.)*
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
| Merged entitlements route | `cf-worker/src/routes/entitlements.ts` |
| Hub billing-tier reader | `cf-worker/src/services/hubEntitlements.ts` |
| Merged tier resolver (Phase 3 gates) | `cf-worker/src/services/mergedTier.ts` |
| Frontend entitlements fetch | `src/services/entitlementsApi.js` |
| Hero-name validation (server) | `cf-worker/src/services/validation.ts` |
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
