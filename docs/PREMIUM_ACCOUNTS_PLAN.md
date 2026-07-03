# Premium Accounts Plan

> Design plan, July 2026. No implementation yet. Covers the whole premium chain:
> how a user becomes premium, where that fact lives, how the Worker enforces it,
> and how the client consumes it. Supersedes the one-line designs in backlog #39
> (server-side entitlements) and connects #6 (billing/usage), #7 (OpenRouter
> premium models), and #40 (server-delivered premium content).
> Related decisions already made: [LICENSING_OPTIONS.md](LICENSING_OPTIONS.md)
> (premium is defended by engineering, not licensing).
>
> **In-flux caveat:** the `cf-worker/` working tree currently carries an
> uncommitted migration of the data DB from Supabase to Hetzner Postgres via
> Cloudflare Hyperdrive (`env.HYPERDRIVE` + postgres.js in
> `cf-worker/src/routes/db.ts`; old `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
> kept only for rollback per `cf-worker/src/types.ts`). This plan assumes that
> migration lands first (backlog #39 already says it is blocked on the WIP).
> Integration points below are named by route/function, not by line.

---

## Decisions needed (maintainer sign-off before Phase 1)

| # | Decision | Recommendation in this doc |
|---|---|---|
| D1 | Source of truth for premium | Per-game `user_entitlements` table in the game data Postgres (Hyperdrive), **not** a hub JWT claim. **2026-07-03 amendment:** the maintainer intends cross-game benefits ("unlocks in other games on octonion.io"), which tilts this toward an **account-level subscription tier at the hub** with per-game feature **mapping** (see the tier ladder below). Under discussion — whatever Phase 1 builds, keep the table **account-scoped and game-agnostic** (tier, not per-game flags) so it can be hoisted to the hub without migration |
| D2 | Billing provider | **Lemon Squeezy** (merchant of record; already named in backlog #6) |
| D3 | Product shape at launch | Simple monthly subscription; optional one-time lifetime "Founder" unlock alongside it |
| D4 | Premium bundle at launch | Desert/snow campaigns + premium Narrative Styles + premium loot cap lift + (when #7 lands) OpenRouter models. Confirm exact list |
| D5 | Downgrade behavior for existing saves | Gate **creation**, never brick existing saves (a desert campaign started while premium stays playable) |
| D6 | Usage metering sequencing | Premium stays **binary** first; `ai_usage_events`/credit ledger deferred to a later phase (see §7) |
| D7 | Pricing, trial, grandfathering | Open questions in §10; needed before Phase 2 (billing), not before Phase 1 |

---

## Tier ladder (maintainer's note, folded in 2026-07-03)

The maintainer's target ladder (from `premium_ideas.txt`, now absorbed here), with two
amendments agreed on fold-in. **Launch scope remains Free + Members** per this plan's
phasing; Premium/Elite are the published roadmap and open when their content exists.

- **Guest (free):** heroes/saves browser-local only. *(Already how the game works.)*
- **Free Account:** heroes/saves in the remote database (cross-device sync — the signup
  carrot); pooled CF Workers AI credits (rate-limited, "while CF offers it");
  cross-game account via octonion.io.
  **Amendment (2026-07-03): NO max-level cap.** The earlier decision stands ("gate the
  starting point, not the max level"): free tier is bounded by CONTENT — t1/t2 campaigns
  (which naturally top out ~Lv 4-5) — never by an XP wall.
- **Members ($5/m):** premium AI pool access; sand/snow maps + their music; custom quests
  with **rare** items (the existing rarity tier-gate wired to account tier in the quest
  builder's item picker); higher-tier campaign content; more unlocks in other
  octonion.io games.
- **Premium ($10/m):** greater share of the premium AI pool (requires the usage
  metering/ledger phase — the expensive line); new map types (sea-heavy + ships, depends
  on FEATURE_FAST_TRAVEL); bigger world maps (generateMapData already parameterized);
  custom quests with **very rare** items; unlock starting level / Lv-3 templates;
  player housing (unbuilt — roadmap only); more cross-game unlocks.
- **Elite ($20/m):** highest AI share; better ships/mounts; biggest maps; custom quests
  with **legendary** items; Lv-5 starting templates; bigger housing.
  **Note:** Elite is currently backed almost entirely by unbuilt features — do not sell
  until the content exists.

Cheapest-to-ship differentiators (reuse existing machinery): remote saves (exists),
sand/snow + music (gated), rarity-tiered custom quest items (rarity gate exists),
tiered campaign content (templates already tiered). Most expensive: tier-differentiated
AI limits (needs #6's ledger) and all new-content promises (ships, housing, bigger maps).

---

## 1. Current state (grounding, verified in-repo)

- **Auth.** The Octonion hub (octonion.io) issues Supabase-format JWTs.
  `cf-worker/src/middleware/auth.ts` (`requireAuth`) verifies them against the
  hub JWKS (`OCTONION_SUPABASE_URL`, 10-minute key cache), checks
  `exp`/`iss`/`role === "authenticated"`, and sets `userId` from `sub`. Those
  are the only claims the Worker reads today; nothing tier-shaped exists in the
  token. The hub serves **multiple games**, which matters for option A below.
- **Client auth plumbing.** `src/services/llmService.js` attaches
  `Authorization: Bearer <session.access_token>` (from the Supabase client via
  `AuthContext`) to every CF Worker request. Any new entitlements fetch reuses
  this exact pattern.
- **Worker surface.** `cf-worker/src/index.ts` mounts `/api/ai` (per-route
  `requireAuth` inside `cf-worker/src/routes/ai.ts`), `/api/embed`,
  `/api/image`, and `/api/db/*` (group-level `requireAuth`). `/api/db/*` routes
  enforce row ownership with `WHERE ... user_id = ${userId}` on every query.
- **Data DB (in flux).** `cf-worker/src/routes/db.ts` now talks to Postgres via
  Hyperdrive (`getSql(env)`), one client per request, `sql.end()` in
  `waitUntil`. An entitlements table follows this same access pattern.
- **Client seam.** `src/game/entitlements.js` is the designed single seam:
  placeholder `isPremium()` (localStorage dev override
  `dungeongpt:premium === 'true'`, fail-closed), plus `PREMIUM_THEMES`
  (`['desert','snow']`), `isThemePremium`, `isTemplatePremium`,
  `canUseTheme/Template`. Tests in `src/game/entitlements.test.js`.
- **Existing gates keyed off `isPremium()`** (all client-side, UX-only today):
  - `src/pages/NewGame.js`: `premiumUnlocked = isPremium()` at render;
    the locked "✨ Premium Adventures" section; theme-picker lock; tab-switch
    and submit backstops ("Desert and snow adventures are a Premium feature").
  - Planned: `src/utils/inventorySystem.js` has a documented PREMIUM HOOK above
    `RARITY_RANK` (cap non-premium random drops at `rare` via
    `maxRarityRankForTier`/`filterDropsByTier`).
  - Planned: Narrative Style (responseVerbosity) tiers, free locked to
    Moderate (gate the `SegmentedControl` in NewGame and honor server-side
    where feasible).
- **Backlog anchors.** #6 billing + usage accounting (L), #7 OpenRouter premium
  tier (M-L, "depends on #6 for tier gating"), #39 server-side entitlements
  (M, Soon), #40 server-delivered premium content (M), #12 rate limiting
  (adjacent, not in scope here).

## 2. Architecture at a glance

```
Lemon Squeezy checkout ──webhook──▶ POST /api/billing/webhook (new Worker route)
                                        │ verify HMAC signature, idempotent upsert
                                        ▼
                              user_entitlements table
                          (game data Postgres, via Hyperdrive)
                                        ▲                ▲
                     per-request read w/ short cache      │ manual SQL grants
                                        │                 │ (founders/testers, Phase 1)
        /api/ai/generate ───────────────┤
        /api/content/* (#40) ───────────┤
        GET /api/me/entitlements ◀──────┘
                 │
                 ▼ (fetch once per session, on auth change)
        EntitlementsContext + module snapshot in src/game/entitlements.js
                 │
                 ▼ (synchronous reads, unchanged call sites)
        isPremium() → NewGame gates, loot cap, Narrative Style, model picker UX
```

Two enforcement layers, deliberately different jobs:

- **Worker = security.** Anything that costs money or must not leak (premium
  AI models, server-delivered premium content, future usage caps) is checked
  server-side and fails closed.
- **Client = UX.** The existing `entitlements.js` gates stay, but they become
  presentation (lock icons, upgrade CTAs), not protection. A devtools user who
  flips the client gate gets nothing from the server it would not already give.

Note the honest limitation: purely client-side systems (loot rolls in
`inventorySystem.js`, map generation theme, Narrative Style prompt shaping)
cannot be *securely* enforced by the Worker without moving those systems
server-side. That is acceptable under the licensing memo's threat model (the
code is Apache anyway); what must be server-enforced is spend (models) and
unpublished content (#40).

## 3. (A) Entitlement storage and source of truth

### Options

| Option | Pros | Cons |
|---|---|---|
| **Per-game table** in the game data Postgres | Single writer (billing webhook), instant revocation, no auth-hub coupling, fits the existing `db.ts` Hyperdrive pattern, per-game by construction | One extra query per premium-gated request (mitigated by a short cache) |
| **JWT claim from the Octonion hub** | Zero extra queries; travels with the token | The hub serves multiple games, so a DungeonGPT-specific tier claim pollutes a shared identity token; the game's billing webhook would need write access to the hub; revocation latency = token lifetime; claim-schema changes need hub deploys |
| **Both** (table as truth, claim as cache) | Fast path + authoritative fallback | All the hub coupling for a latency win the cache already provides; premature |

### Recommendation: per-game `user_entitlements` table (D1)

The hub stays a pure identity provider (it already serves multiple games; keep
it that way). The game owns its own entitlements in its own data Postgres,
keyed by the hub `sub`. If a cross-game "Octonion Premium" ever becomes a
product, that becomes a hub-level entitlements *service*, which is a different
project (open question §10).

### Schema (new migration alongside the existing heroes/conversations tables)

```sql
CREATE TABLE user_entitlements (
  user_id                  text PRIMARY KEY,   -- Octonion JWT sub
  tier                     text NOT NULL DEFAULT 'free',      -- 'free' | 'premium'
  status                   text NOT NULL DEFAULT 'none',      -- 'none'|'active'|'past_due'|'cancelled'|'expired'
  lifetime                 boolean NOT NULL DEFAULT false,    -- Founder one-time unlock
  current_period_end       timestamptz,        -- honor access until here even after cancel
  source                   text NOT NULL DEFAULT 'manual',    -- 'manual' | 'lemonsqueezy'
  provider_customer_id     text,
  provider_subscription_id text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Raw webhook audit + idempotency (Phase 2)
CREATE TABLE billing_events (
  event_id    text PRIMARY KEY,   -- provider event id (dedupe key)
  event_name  text NOT NULL,
  user_id     text,
  payload     jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
```

**Effective premium** is computed in one place (Worker helper, mirrored in the
client snapshot):

```
premium := tier = 'premium' AND (
             lifetime
             OR status IN ('active','past_due')          -- past_due = grace period
             OR (status = 'cancelled' AND current_period_end > now())
           )
```

- **Multi-device:** trivially consistent, the table is the truth; each device
  fetches on session start.
- **Revocation latency:** bounded by the Worker read-cache TTL (60 s, §5) for
  server enforcement, and by the client's next entitlements fetch for UX. Both
  acceptable for a game subscription.
- **Offline/guest:** no JWT → no `userId` → free tier. The client snapshot
  defaults to free and `isPremium()` already fails closed. Guests are always
  free (they cannot even save; nothing to gate beyond NewGame UX).
- **No row = free.** Absence of a `user_entitlements` row is the normal state
  for every free user; never require a row to play.

## 4. (B) Billing provider and lifecycle

### Provider comparison (solo dev lens)

| | Lemon Squeezy | Paddle | Stripe |
|---|---|---|---|
| Merchant of record (handles global VAT/sales tax, invoices, fraud) | **Yes** | Yes | **No** (you are the merchant; tax registration is on you, or bolt on Stripe Tax + registrations) |
| Fees | ~5% + 50¢ | ~5% + 50¢ | ~2.9% + 30¢ (+ tax product) |
| Integration weight | Lightweight (hosted checkout, simple REST + webhooks) | Heavier onboarding/approval | Heaviest to do *correctly* solo |
| Webhooks | HMAC-SHA256 `X-Signature` over raw body | Yes | Yes |
| Already named in this repo | **Backlog #6 and DEPLOYMENT_ARCHITECTURE.md** | No | No |

**Recommendation: Lemon Squeezy (D2).** For a solo dev selling a ~$5/mo game
sub worldwide, merchant-of-record is the whole game: no VAT MOSS, no US state
sales-tax registrations, no invoice compliance. The ~2% fee premium over
Stripe is far cheaper than the accounting overhead. Paddle is the fallback if
LS store approval is a problem. Nothing below is LS-specific in shape: the
webhook route + entitlements upsert design ports to Paddle/Stripe unchanged.

### Product shape (D3)

Start with **one monthly subscription** ("DungeonGPT Premium") plus an
optional **one-time lifetime "Founder" purchase** at launch:

- Monthly is the durable model and forces the cancel/expire lifecycle to be
  built correctly from day one.
- Lifetime-Founder is cheap to support (it is just `lifetime = true`, no
  lifecycle), rewards early supporters of a pre-revenue indie, and creates a
  launch moment. Cap or time-limit it so it does not cannibalize subs forever.
- Skip annual plans, tiers, and regional pricing at launch; add later if asked.

### Lifecycle flow

1. **Checkout.** Client hits new Worker route `POST /api/billing/checkout`
   (behind `requireAuth`). The Worker calls the LS API to create a checkout,
   embedding `userId` in checkout `custom` data (never trust email matching
   alone), and returns the hosted checkout URL. Client opens it.
   (A static checkout link with `checkout[custom][user_id]` prefilled also
   works; the Worker route keeps the store/variant ids server-side.)
2. **Webhook → entitlement.** LS calls `POST /api/billing/webhook` (new route,
   **not** behind `requireAuth`; authenticated by HMAC signature instead, §9).
   Handled events:
   - `subscription_created` / `subscription_updated` (incl. resume, plan
     change, payment recovery) → upsert `user_entitlements` with
     `tier='premium'`, `status` from the event, `current_period_end` from
     `renews_at`/`ends_at`, provider ids.
   - `subscription_cancelled` → `status='cancelled'`, keep
     `current_period_end` (access until period end, D5-friendly).
   - `subscription_expired` → `status='expired'` (effective premium now false).
   - `subscription_payment_failed` → `status='past_due'` (grace; LS dunning
     will either recover → `updated`, or expire).
   - `order_created` for the lifetime variant → `lifetime=true`,
     `tier='premium'`.
   Every event is first inserted into `billing_events` keyed by the provider
   event id; a duplicate key means "already processed, return 200" (webhooks
   retry; the handler must be idempotent).
3. **Refunds/chargebacks.** LS (as MoR) handles the money; the corresponding
   `subscription_expired`/order-refunded events downgrade the row.
4. **Manage/cancel.** Client "Manage subscription" links to the LS customer
   portal URL (fetchable per subscription); no in-app billing UI needed.

### Where it lives

- New route file `cf-worker/src/routes/billing.ts`, mounted in
  `cf-worker/src/index.ts` as `/api/billing` (webhook + checkout).
- Secrets via `wrangler secret put`: `LEMONSQUEEZY_API_KEY`,
  `LEMONSQUEEZY_WEBHOOK_SECRET`, plus `LEMONSQUEEZY_STORE_ID`/variant ids as
  vars. Never in `.env` (matches existing convention for
  `SUPABASE_SERVICE_ROLE_KEY`/`CF_API_TOKEN`).

## 5. (C) Worker enforcement

### Shared helper

New `cf-worker/src/services/entitlements.ts`:

- `getEntitlements(env, userId): Promise<{ tier, premium, status, currentPeriodEnd, features }>`
  reads `user_entitlements` via the same Hyperdrive/postgres.js pattern as
  `routes/db.ts` (`getSql(env)`, `sql.end()` in `waitUntil`).
- **Caching:** module-level in-isolate `Map<userId, {value, cachedAt}>` with a
  **60 s TTL**, same pattern as the JWKS `keyCache` in
  `middleware/auth.ts`. Rationale: `/api/ai/generate` fires on every player
  action; a per-request query is one extra Hyperdrive round trip per
  generation, which is survivable, but the 60 s cache makes the check
  effectively free while bounding revocation latency at one minute. No KV/DO
  needed at this scale.
- **Fail-closed for granting:** any DB error → return `free`. Never grant
  premium on error. (The asymmetric rule: errors may deny a premium feature,
  they must never deny free-tier functionality, so only premium-gated code
  paths call this helper.)
- `features` is derived **server-side** from the tier (e.g.
  `{ premiumModels, premiumContent, narrativeStyles, premiumLoot }`) so the
  client never hardcodes what premium means; leaves room for future multi-tier
  without another client change.

### Enforcement points

| Endpoint | Check |
|---|---|
| `POST /api/ai/generate` (`cf-worker/src/routes/ai.ts`) | After schema validation: resolve the requested model against `MODEL_REGISTRY` (`cf-worker/src/services/models.ts`, new per-model flag `premium: true` for OpenRouter models when #7 lands). If premium model and user not entitled → **403 `{ error: "premium_required", code: "premium_required" }`**. Explicit rejection, not a silent fallback: the existing `FALLBACK_MAP` silent-downgrade is for *unknown* models; silently downgrading an entitlement check would hide client bugs and quietly serve worse output to paying-intent users. |
| `GET /api/ai/models` | Include `premium: true` flags in the response so the client model picker can render locks; optionally include the caller's `entitled` state to save a round trip. |
| `GET /api/content/templates`, `GET /api/content/templates/:id` (**new** route group for #40, e.g. `cf-worker/src/routes/content.ts`) | List returns all entries with premium ones as **locked stubs** (id, name, icon, description, `premium: true`, no `settings`/`milestones`). Detail returns full template JSON only if entitled, else 403 `premium_required`. Premium template JSON lives in a `premium_templates` table in the game DB (Hyperdrive Postgres) — **never Worker-bundled: `cf-worker/` is in the same PUBLIC repo, so anything in Worker source is public too.** Content lives only in data stores the Worker reads (DB rows; private R2 for music/assets via short-lived signed URLs behind the same check). |
| `GET /api/me/entitlements` (**new**, behind `requireAuth`) | Returns the helper output directly: `{ tier, premium, status, currentPeriodEnd, features }`. This is the client's single read point. Mount as its own tiny route group (`/api/me`) so future `me`-shaped endpoints (usage, profile) have a home. |
| Future usage caps (#6 Phase) | Same helper decides the cap bucket; the counter lives next to it. |
| `/api/db/*` | **No tier checks now.** Saves/heroes stay tier-independent (D5). If save-slot or hero-count limits are ever adopted (memory: "3 saves free / unlimited premium"), the check slots into the relevant `dbRoutes.post` handlers using the same helper. |

**Downgrade semantics (D5):** enforcement gates *acquisition* (starting a new
premium campaign, requesting a premium model, fetching new premium content),
never *possession*. A save whose `world_map` is desert keeps loading through
`GET /api/db/conversations/:sessionId` untouched; nothing scans saves for
premium taint. This avoids bricking paid-for progress and keeps `db.ts` clean.

## 6. (D) Client consumption

### The seam, and why `isPremium()` stays synchronous

Making `isPremium()` itself async would ripple badly. Current synchronous call
sites that would all need rework:

- `src/pages/NewGame.js`: `const premiumUnlocked = isPremium()` during render
  (line ~92), plus inline `isPremium()`-derived backstops in the submit
  handler, theme `onChange`, and tab-switch handler. Async here means
  suspense/loading states or effect + state plumbing through a 1500-line page.
- `src/game/entitlements.js` helpers `canUseTheme`/`canUseTemplate` are pure
  sync functions consumed in render paths and tested synchronously
  (`entitlements.test.js`).
- The planned `src/utils/inventorySystem.js` loot hook
  (`maxRarityRankForTier`) is a pure util with no React and must stay
  synchronous (it runs inside `encounterResolver.generateLoot`).
- The planned Narrative Style gate in NewGame render.

**Design: async fetch, synchronous read.** The fetch happens once per session;
the result is pushed into a module-level snapshot inside `entitlements.js`;
every existing call site keeps calling sync `isPremium()` unchanged. This is
exactly the "swap the body of `isPremium()`" contract the placeholder promised.

### Pieces

1. **`src/services/entitlementsService.js`** (new):
   `fetchEntitlements()` → `GET ${CF_WORKER_URL}/api/me/entitlements` with the
   same Bearer-token header construction `llmService.js` uses. Returns the
   server payload or `null` (guest / error → free).
2. **`src/game/entitlements.js`** (edit, additive):
   - module-level `let snapshot = null;`
   - `export function setEntitlementsSnapshot(s)` / `clearEntitlementsSnapshot()`
   - `isPremium()` body becomes: dev override (dev builds only, see below) →
     else `snapshot?.premium === true` → else `false`. Still no React, still
     fail-closed, still trivially testable (tests set/clear the snapshot).
3. **`src/contexts/EntitlementsContext.js`** (new, or fold into
   `AuthContext`): on auth session available/changed, call
   `fetchEntitlements()`, then `setEntitlementsSnapshot(result)` and expose
   `{ premium, tier, features, loading, refresh }` via context. On sign-out,
   clear both. Context state change re-renders subscribed components, which
   solves the "snapshot changed after NewGame already rendered" staleness:
   NewGame reads `premiumUnlocked` from the context hook (one-line change from
   `isPremium()`), while non-React code (inventorySystem, engine paths) reads
   the module snapshot through `isPremium()`.
   Refresh triggers: app mount, auth state change, window refocus after the
   upgrade redirect, and an explicit `refresh()` used by the success page.
4. **Dev override retained, dev-only:** keep `dungeongpt:premium` in
   localStorage but honor it only when `process.env.NODE_ENV !== 'production'`
   or `REACT_APP_ENABLE_DEBUG_ROUTES` is set (same gating as debug routes).
   In production it is harmless (server enforces), but tightening it keeps the
   client gate honest as UX.
5. **Guests:** no session → no fetch → snapshot null → free. Matches today.

### Upgrade UX

- **CTAs:** the existing locked "✨ Premium Adventures" section in
  `NewGame.js` swaps its "coming soon" copy/button for **Upgrade** once
  billing exists; same for the theme-picker `🔒 (Premium)` entries, the
  Narrative Style locked chips, and (later) locked models in the model picker.
  All CTAs route to one `UpgradeModal` (via `ModalContext`/`ModalShell`, per
  the modal-manager convention) that shows the pitch + price and a single
  "Continue to checkout" button.
- **Flow:** Upgrade → `POST /api/billing/checkout` → open LS hosted checkout →
  LS redirect to `dungeongpt.xyz/upgrade/success` → success page calls
  `refresh()` and polls `GET /api/me/entitlements` for a few seconds (webhook
  delivery is near-instant but not synchronous) → "You're Premium" and the
  locked UI unlocks live.
- **Account surface:** wherever account/settings UI lives, show current tier,
  renewal date, and "Manage subscription" (LS customer portal link).

## 7. (E) Relationship to usage accounting (#6)

**Recommendation (D6): keep premium binary first; defer the ledger.**

- Every existing gate (themes, templates, loot, narrative style) and both
  server enforcement targets (#7 models, #40 content) need only a boolean.
  Binary entitlements unblock all of it and are a week-scale project; the
  credit ledger + `ai_usage_events` + caps is the L-sized rest of #6.
- Metering only becomes *necessary* when premium users can burn real per-token
  money, i.e. when OpenRouter (#7) actually ships. Workers AI inference for
  free users is covered by the CF allotment and is a rate-limiting problem
  (#12), not a ledger problem.
- Design now, build later: the `user_entitlements` schema above already
  carries provider ids (join key for invoices) and the `/api/me` route group
  gives usage a natural future home (`GET /api/me/usage`). When metering
  lands, `ai_usage_events(user_id, model, tokens_in, tokens_out, cost_micros,
  created_at)` is written from `generateText`'s call site in `routes/ai.ts`,
  and a coarse per-day premium cap can precede any full credit ledger.

## 8. (F) Phased rollout

### Phase 0 (prerequisite): land the Hyperdrive WIP
The uncommitted `cf-worker/` migration must merge and stabilize first
(#39 notes this explicitly). Everything below builds on `getSql(env)`.

### Phase 1: entitlements read path end-to-end (manual grants)
*Goal: real premium for founders/testers with zero billing code. Ships alone.*

- **DB:** `user_entitlements` migration on the game Postgres. Grant testers
  manually: `INSERT INTO user_entitlements (user_id, tier, status, source)
  VALUES ('<sub>', 'premium', 'active', 'manual') ON CONFLICT (user_id) DO
  UPDATE ...`.
- **Worker:** `cf-worker/src/services/entitlements.ts` (helper + 60 s cache);
  new `/api/me` route group with `GET /api/me/entitlements` behind
  `requireAuth`; mount in `cf-worker/src/index.ts`.
  - Dev note: with `ALLOW_UNAUTHENTICATED_DEV=true` the middleware bypasses
    without setting `userId`; the new route must handle missing `userId` by
    returning the free shape (or a `DEV_PREMIUM=true` var for local testing),
    not by crashing.
- **Client:** `src/services/entitlementsService.js`;
  snapshot setter + new `isPremium()` body in `src/game/entitlements.js`;
  `EntitlementsContext` wired in `src/App.js`'s provider stack; `NewGame.js`
  switches `premiumUnlocked` to the context hook. Copy changes from
  "coming soon" wait for Phase 2.
- **Also wire the two recorded-intention client gates** now that a real signal
  exists: the `inventorySystem.js` very_rare cap (PREMIUM HOOK comment) and the
  Narrative Style chip lock (free = Moderate). Both read sync `isPremium()`.
- **Tests:** Jest for the new `entitlements.js` snapshot logic (extend
  `entitlements.test.js`); Worker-side test via the existing harness pattern
  (`scripts/test-cf-worker-auth.mjs` sibling, e.g.
  `scripts/test-cf-entitlements.mjs`: unauthenticated → 401, authed free →
  free shape, manually granted user → premium); Playwright spec: granted test
  user sees Premium Adventures unlocked.

### Phase 2: billing (Lemon Squeezy)
*Goal: self-serve become-premium.*

- **Worker:** `cf-worker/src/routes/billing.ts` with
  `POST /api/billing/checkout` (authed) and `POST /api/billing/webhook`
  (signature-verified, unauthed); `billing_events` table + idempotent upsert;
  secrets `LEMONSQUEEZY_API_KEY`/`LEMONSQUEEZY_WEBHOOK_SECRET` via
  `wrangler secret put`. Cache invalidation: webhook upsert deletes the
  user's entry from the in-isolate entitlements cache (best effort; other
  isolates age out within 60 s).
- **Client:** `UpgradeModal` (ModalContext registry), CTA copy swap in
  `NewGame.js`, `/upgrade/success` page with `refresh()` + short poll,
  account-area tier display + portal link.
- **Webhook testing locally:** (a) unit-level: replay captured/fixture LS
  payloads against `wrangler dev` with a locally computed HMAC
  (`scripts/test-billing-webhook.mjs` that signs the body with the dev
  secret and asserts the row upsert + idempotent replay); (b) end-to-end: LS
  **test mode** store + a `cloudflared`/ngrok tunnel to `wrangler dev` as the
  webhook URL, walk a real test checkout, cancel, and expiry. Keep the fixture
  payloads in `cf-worker/test/fixtures/` for regression.
- **Ops:** document webhook replay in a runbook note (LS dashboard can resend
  events; idempotency makes replay safe).

### Phase 3: server-enforced premium surface (#7 + #40)
*Goal: premium is worth paying for and cannot be reached by flipping the client.*

- **Models (#7):** OpenRouter provider in `cf-worker/src/services/ai.ts`
  (`OPENROUTER_API_KEY` secret), `premium: true` flags in `MODEL_REGISTRY`
  (`services/models.ts`), 403 `premium_required` check in
  `routes/ai.ts` `POST /generate`, flags surfaced by `GET /models`, lock icons
  in the client model picker keyed off `features.premiumModels`.
- **Content (#40):** `cf-worker/src/routes/content.ts` catalog + gated detail;
  next premium campaign authored as server-side JSON (never committed to the
  public repo); `NewGame.js` merges the catalog's locked stubs into the
  Ready-Made list. Desert/snow stay bundled/gated as-is (sunk, per
  LICENSING_OPTIONS.md).
- **Tests:** extend `scripts/test-cf-models*.mjs` for the 403 path and the
  entitled path; content-stub vs full-detail assertions.

### Phase 4: usage metering (#6 proper)
`ai_usage_events` writes in `routes/ai.ts`, per-day caps (coarse first),
`GET /api/me/usage`, and only then a credit ledger if a credits product is
ever wanted. Rate limiting (#12) can piggyback on the same counters.

## 9. Security notes

- **Never trust the client for tier.** The client never sends tier/premium in
  any request; the Worker derives it from `userId` (JWT `sub`) + table only.
  Client gates are UX.
- **Webhook verification:** verify the LS `X-Signature` HMAC-SHA256 over the
  **raw request body** with `crypto.subtle` (constant-time compare via
  `crypto.subtle.verify` or timing-safe equality), before any JSON parse.
  Reject missing/invalid signatures with 401 and log the event id only.
- **Idempotency + replay safety:** `billing_events.event_id` primary key;
  duplicate → 200 no-op. Makes provider retries and manual dashboard replays
  safe.
- **User binding:** entitle by the `userId` carried in checkout custom data,
  not by email matching; log and hold (do not auto-grant) webhooks that lack
  custom user data (e.g. purchases made outside the in-app flow).
- **Fail-closed:** entitlement read errors → free; webhook processing errors →
  5xx (so the provider retries) rather than dropping the event.
- **Secrets hygiene:** all LS/OpenRouter keys via `wrangler secret put` /
  `.dev.vars`, consistent with existing convention; webhook route excluded
  from `requireAuth` but nothing else on `/api/billing` is.
- **Don't brick saves:** no enforcement path may make an existing save
  unloadable (D5); this is a correctness rule as much as a UX one.
- **Rate-limit the webhook route** (small, static allowance) so it cannot be
  used as a DB-write amplifier; broader rate limiting stays #12.

## 10. (G) Open questions for the maintainer

1. **Price point** for monthly, and for the lifetime Founder unlock (and
   whether Founder is capped by count or by date).
2. **Trial or no trial?** (LS supports trials; a trial adds `on_trial`
   status handling. Alternative: the free tier *is* the trial, which is
   simpler and this doc's default.)
3. **Exact launch bundle (D4):** confirm desert/snow + Narrative Styles +
   very_rare loot + OpenRouter models; decide whether premium character
   creation (Advanced mode: point-buy, starting level) and RAG tiers
   (8 results/unlimited index) are in v1 or later.
4. **Grandfathering:** do manually granted Phase 1 founders/testers keep
   premium forever (`source='manual'`, `lifetime=true`) or convert at launch?
5. **Desert/snow long-term:** stay premium on the hosted service, or demote to
   free as the loss-leader once the first server-delivered premium campaign
   exists (open question carried from LICENSING_OPTIONS.md §5)?
6. **Hub-level premium:** is a cross-game "Octonion Premium" ever intended?
   (If yes soon, the entitlements *service* boundary should be revisited
   before Phase 2; this plan assumes per-game.)
7. **Downgrade edge case sign-off (D5):** confirm "gate creation, never
   continuation" (a lapsed subscriber keeps playing their desert save, keeps
   already-dropped very_rare items, but new premium drops/models/content
   stop).
8. **Where does the account/billing UI live** in the current page structure
   (settings modal vs a dedicated account page)?

---

*Files/routes this plan touches when implemented (summary):*
`cf-worker/src/services/entitlements.ts` (new), `cf-worker/src/routes/billing.ts`
(new), `cf-worker/src/routes/content.ts` (new, #40), `/api/me` route group (new),
`cf-worker/src/routes/ai.ts` + `cf-worker/src/services/models.ts` (#7 gating),
`cf-worker/src/index.ts` (mounts), `cf-worker/src/types.ts` (new secrets/vars),
DB migrations (`user_entitlements`, `billing_events`),
`src/game/entitlements.js` (snapshot + new `isPremium()` body),
`src/services/entitlementsService.js` (new), `src/contexts/EntitlementsContext.js`
(new), `src/pages/NewGame.js` (context hook + CTA copy),
`src/utils/inventorySystem.js` (documented loot hook), `UpgradeModal` (new, via
`ModalContext`), scripts `test-cf-entitlements.mjs` / `test-billing-webhook.mjs`
(new).
