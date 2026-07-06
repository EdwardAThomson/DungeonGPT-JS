# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

DungeonGPT-JS is a React web app for creating fantasy RPG characters and playing AI-narrated campaigns. It is the production rewrite of a Python prototype, deployed at dungeongpt.xyz on Cloudflare Pages + Workers backed by a self-hosted Postgres reached via Cloudflare Hyperdrive. `ROADMAP.md` is the high-level status; `docs/OUTSTANDING_ISSUES.md` is the master backlog; `docs/README.md` is the document map (index of every design doc); per-system design docs live in `docs/`.

## Commands

```bash
# Frontend (Create React App)
npm start                      # dev server on :3000
npm run build                  # CI=false react-scripts build -> build/ (deployed artifact)

# Local dev API server (Express + SQLite + direct LLM SDKs) — NOT used in production
node src/server.js             # serves on :5000 (REACT_APP_API_BASE_URL)

# Cloudflare Worker (production backend, cf-worker/)
cd cf-worker && npx wrangler dev     # worker on :8787 (REACT_APP_CF_WORKER_URL)
npm run deploy                       # build + wrangler deploy (run from repo root)
npm run preview                      # build + wrangler dev

# Tests
npm test                       # Jest (react-scripts) — *.test.js, watch mode
npm test -- --watchAll=false src/game/milestoneEngine   # single file, no watch
npm run test:e2e               # Playwright (all e2e specs in e2e/)
npm run test:e2e:headed        # Playwright headed
npm run test:e2e:express       # single spec: express-smoke-new-game-save-reload
npm run test:e2e:supabase      # single spec: supabase-hero-save
npm run test:supabase          # scripts/test-supabase-local.sh
```

Unit tests are colocated (`src/**/*.test.js`), heaviest in `src/game/` and `src/utils/`. There is no separate lint script; ESLint runs through `react-scripts` (config: `react-app`, `react-app/jest`).

## The two-backend split (most important architectural fact)

There are **two separate backends** and they are not interchangeable:

1. **`src/server.js`** — local-dev-only Express server. SQLite persistence (`src/game.db`) and **direct** LLM SDK calls (`src/llm/llmBackend.js` → OpenAI / Gemini / Claude using server-side env keys). This is a convenience harness for local development; **it is not deployed**.
2. **`cf-worker/`** — the real production backend. Hono + TypeScript on Cloudflare Workers (`dungeongpt-api`). Entry `cf-worker/src/index.ts` mounts four route groups: `/api/ai` (text gen via Workers AI binding), `/api/embed` (768-dim BGE embeddings), `/api/image`, and `/api/db/*` (Postgres CRUD proxy over the `HYPERDRIVE` binding, the only authed-by-default group). AI runs on the `[ai]` Workers AI binding — curated open-weights models (GPT-OSS, Llama, Gemma); **no API keys** needed for text/embeddings.

The frontend chooses at request time: provider `cf-workers` routes to `CF_WORKER_URL` (`src/services/llmService.js`); other providers route to `API_BASE_URL` (the Express server). In production only `cf-workers` is wired up. When changing AI behavior, know which path you're touching — `cf-worker/src/services/ai.ts` (prod) vs `src/llm/llmBackend.js` (dev) are independent implementations that must be kept in sync conceptually.

**Data never goes frontend→Postgres directly.** All DB access is proxied through `/api/db/*` so the Worker can enforce row-level ownership (the data Postgres is self-hosted, migrated off Supabase, and reached via Cloudflare Hyperdrive). Auth is an **Octonion hub** (octonion.io) issuing Supabase-format JWTs; `cf-worker/src/middleware/auth.ts` verifies them via JWKS (10-min cache), checking expiry/issuer/`role:authenticated` and extracting `sub` as `userId`. Locally the Worker fails closed unless `ALLOW_UNAUTHENTICATED_DEV=true`.

## Frontend architecture

State is layered through React Context providers (`src/contexts/`): `AuthContext`, `SettingsContext` (LLM provider/model selection, theme), `HeroContext`, `ApiKeysContext`, and `ModalContext`. `src/App.js` wires routing (React Router) and lazy-loads `DebugRoutes`. Debug pages (`/debug/*`, gated by `NODE_ENV !== production || REACT_APP_ENABLE_DEBUG_ROUTES`) are isolated test harnesses for individual systems — `src/pages/*Test.js` / `*Debug.js`.

Game logic is split:
- **`src/game/`** — controllers and pure engines: `milestoneEngine.js`, `milestoneSpawner.js`, `encounterController.js`, `movementController.js` / `worldMoveController.js`, `saveController.js`, `promptComposer.js`, `ragEngine.js`, `questEngine.js` / `questHints.js` (side quests, load-time backfill, derived hints), `campaignLauncher.js` / `campaignChain.js` / `prologueComposer.js` (in-save campaign continuation), `codexEngine.js` (discovered-only bestiary/items), `sitePopulator.js` (explorable-site content + loot), `balanceSim.js` (Monte-Carlo balance harness), `heroInvariants.js` / `heroLedger.js` (load-time mechanics healing + append-only grant ledger).
- **`src/hooks/`** — orchestration hooks: `useGameSession`, `useGameMap`, `useGameInteraction` (drives AI generation + narrative detection), `useGamePersistence`, `useRagSync`.
- **`src/utils/`** — stateless helpers: `mapGenerator.js` (seeded procedural world), `townMapGenerator.js`, `dice.js`, `healthSystem.js`, `inventorySystem.js`, `progressionSystem.js`, `promptBuilder.js`, `pathfinding.js`, `encounterResolver.js` / `multiRoundEncounter.js` (deterministic d20 resolution; multi-round boss fights with Lead + Support).
- **`src/llm/`** — provider abstraction: `modelResolver.js` (resolve provider+model, validate against available list), `llm_constants.js` (`AVAILABLE_MODELS`/`DEFAULT_MODELS`), plus a CLI-provider `runner/` for codex/claude-cli/gemini-cli.

## Milestone system (active development area)

The campaign-progression system spans many files; treat it as one subsystem:
- **`milestoneEngine.js`** — pure functions (`checkMilestoneCompletion`, `completeNarrativeMilestone`, `getCampaignProgress`, `getMilestoneEncounter`, `getMilestoneLocationNames`, `getSpawnRequirements`, …).
- **`milestoneSpawner.js`** — `spawnWorldMapEntities()` (at map-gen time) and `injectQuestBuildings()` (lazy town gen).
- **`Game.js`** — `checkMilestoneEvent()` fires on movement, combat, and item acquisition.
- **`useGameInteraction.js`** — `MILESTONE_COMPLETE_REGEX` detects AI-judged narrative completions.

Two milestone kinds: **mechanical** (item/combat/location/talk) are engine-detected deterministically; **narrative** are AI-judged and only completed via the `[COMPLETE_MILESTONE]` marker (guarded to narrative/legacy-untyped milestones via `findMarkerMilestoneIndex`). The `talk` type completes through a "Talk" button on the milestone NPC (`npc_talked` event); authored milestone NPCs (e.g. Captain Ulric) are placed into their quest building by `populateTown` via `getMilestoneNpcsForTown`, and milestone boss fights launch from the POI arrival modal via `getMilestoneBossForTile`. Milestone POI names are injected into the map generator via `customNames` (entries may be size-tagged: `{ name, size }` pins the settlement size), and POIs stay hidden until prerequisites are met (`visibleMilestonePois`). Story templates carrying `customNames` + `milestones` live in `src/data/storyTemplates.js`; premium templates are gated through `src/game/entitlements.js` (tier ladder free < member < premium < elite, fetched once per session from the worker's entitlements endpoint; templates may carry a per-template `minTier`), and server-delivered premium templates are fetched per session via `src/services/premiumContentApi.js` and registered idempotently alongside built-ins.

## AI prompt system

`src/data/prompts.js` defines `DM_PROTOCOL` (strict Dungeon Master rules) which wraps every AI prompt; `useGameInteraction.js`'s `generateResponse()` prepends it. `promptComposer.js` builds movement/location narratives. Both backends sanitize responses to strip leaked prompt markers (`[STRICT DUNGEON MASTER PROTOCOL]`, `[TASK]`, etc.) — see `sanitizeResponse` in `src/services/llmService.js` and the equivalent in `cf-worker/src/services/ai.ts`. Milestone context is passed to the model as Active/Completed/Locked with `[item/combat/location/talk/narrative]` type tags, and the model is told mechanical milestones (including `talk`) are handled by the engine; active NPC objectives are grounded with the authored NPC's name/venue/personality, and the location context lists the NPCs actually present with a do-not-invent-names instruction.

## CF Worker model handling

`cf-worker/src/services/models.ts` holds `MODEL_REGISTRY`, `DEFAULT_MODEL_ID`, and a `FALLBACK_MAP`. Unknown model IDs silently fall back to the default; on generation failure `ai.ts` retries down a fallback chain. Reasoning models need special handling. Model test harnesses: `scripts/test-cf-models*.mjs` (incl. a 10-turn multi-turn scenario) and `scripts/test-cf-worker-auth.mjs`. `docs/CF_WORKER_GUIDE.md` is the detailed reference (code wins over the doc when they disagree).

## Environment

Copy `.env.example` to `.env`. Frontend keys are `REACT_APP_*` (notably `REACT_APP_API_BASE_URL`, `REACT_APP_CF_WORKER_URL`, `REACT_APP_OCTONION_SUPABASE_URL`/`_ANON_KEY` for the auth hub, `REACT_APP_ENABLE_DEBUG_ROUTES`). Server-side keys (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`) are only consumed by the local Express server. Worker secrets (`CF_API_TOKEN`) are set via `wrangler secret put` / `.dev.vars`, never `.env`; the data Postgres is reached through the `HYPERDRIVE` binding (local dev tunnels to the box and sets `WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, see `cf-worker/wrangler.toml`). The worker's `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` vars are legacy, kept only for rollback.

## Procedural maps, tile art & backwards compatibility

Two strictly separated layers — keep them separate:

- **Map data** (the generated grids) is **persisted in saves**: the world map lives in the
  conversation row (`worldMap` → `world_map`); town maps are generated lazily on first
  visit and cached in `sub_maps.townMapsCache`. Maps are generated **once and never
  regenerated** — on load they come straight from the save.
- **Tile art** is a pure **view layer** over that data: `src/utils/townTileArt.js`
  (town tiles, autotiled walls, building shapes) and `src/utils/worldTileArt.js`
  (biomes + POI sprites). Both emit programmatic **SVG `url(data:image/svg+xml,...)`**
  backgrounds — no raster assets — keyed only by tile fields, memoised, and
  deterministic per coordinate (seed from `x,y`). Generators: `townMapGenerator.js`
  (`generateTownMap`, hub-and-spoke path network), `mapGenerator.js` (`generateMapData`,
  currently fixed 10×10 in production; a chunk-assembly prototype for larger worlds,
  `worldAssembler.js`, is debug-only behind `/debug/large-world`).
  Preview/iterate at `/debug/tileset` (towns) and `/debug/world-map-art` (world) before
  touching the live `TownMapDisplay` / `WorldMapDisplay`.

**The backwards-compatibility rules (do not break these):**

1. **Art changes are retroactive and safe.** Because art is a pure view, improving
   `townTileArt`/`worldTileArt` re-skins every existing save with no data migration.
2. **Generation changes are going-forward-only.** Changing a generator (dimensions,
   density, lake size, layout) affects **new** maps only; existing saves keep their
   stored grid. Never mutate/regenerate a loaded map in place.
3. **Renderers must tolerate missing/unknown fields** — always fall back (unknown biome
   → plains, no POI → null, etc.) so older saves lacking a newer field still render.
4. **Always leave room for future upgrades.** When a generation change adds/relies on a
   new tile field, stamp new maps with a `mapVersion` (on the save payload / game
   settings, *not* inside the bare map array) so future code can detect old maps and
   branch-render or run a one-time migration. Prefer additive, optional fields.

## Conventions

- Contributions require DCO sign-off (`git commit -s`) and signed commits (see `CONTRIBUTING.md`).
- Retired docs move to `docs/archive/` rather than being deleted. Business-sensitive planning docs (pricing, monetization strategy, revenue) go in `docs/private/` — both are gitignored, local-only. Technical design docs stay public.
- Styling is feature-based modular CSS under `src/styles/`; modals go through `src/contexts/ModalContext.js` + `ModalShell.js` (migration from boolean modal state is in progress).
