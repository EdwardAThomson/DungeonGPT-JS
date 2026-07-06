# Roadmap — DungeonGPT (JS)

_Status: active · updated 2026-07-06_

The production rewrite of DungeonGPT — a React web app for creating fantasy
characters and playing AI-narrated RPG campaigns. Deployed at dungeongpt.xyz on
Cloudflare Pages + Workers with a self-hosted Postgres database reached via
Cloudflare Hyperdrive. (Based on the Python
prototype in the `DungeonGPT` repo.) `docs/OUTSTANDING_ISSUES.md` is the master
backlog; see the `docs/` design docs for each system.

## Shipped

- [x] Hero creation (8 stats, 9 races, 12 classes, 9 alignments) + management (list / edit / delete)
- [x] Party formation + game session setup (world seed, story description, difficulty)
- [x] Procedurally generated world map (biomes, towns, POIs) with persistent town discovery
- [x] Party movement + sub-map exploration scaffolding
- [x] Encounter system (item / location / combat milestones) with d20 skill checks + combat rolls
- [x] Town NPC interactions (merchants, healers, bankers, …); defeated-hero handling + temple resurrection
- [x] Multi-provider LLM narration (CF Workers AI in prod; OpenAI / Gemini / Claude in dev)
- [x] Deterministic campaign-milestone engine (game-verifiable vs narrative milestones)
- [x] Multi-turn conversation memory + prompt composition (party / location / history)
- [x] Postgres persistence (heroes, sessions, conversations) with row ownership enforced by the CF Worker proxy (Supabase originally; self-hosted via Cloudflare Hyperdrive since 2026-07)
- [x] Manual save (with confirmation) + auto-save
- [x] Octonion hub centralized auth (cross-game SSO, JWT validation in Worker)
- [x] Responsive React UI (modals, dice roller, party sidebar, world/town maps, QR share)
- [x] Playwright E2E tests (new game, save/reload, hero save) + Worker health endpoint + error boundary
- [x] CF Pages auto-deploy; Apache 2.0 license; copyright/content review complete; asset provenance manifest
- [x] Narrative milestones (AI-judged quest outcomes via `[COMPLETE_MILESTONE]`) — completes the milestone engine
- [x] RAG memory: in-game retrieval + auto-sync/backfill of conversation embeddings (Workers-AI BGE, IndexedDB)
- [x] Local-first guest play: on-device hero roster + IndexedDB game saves, AI-free mechanical loop (explore / combat / progression), one-click sync to the cloud on sign-in, guest conversion banner (`docs/GUEST_MODE_PLAN.md`)
- [x] New-player onboarding: replayable guided tour (coachmarks), reworked hero creator (27-point-buy validation, gender↔name, portrait picker), simplified New Game, Journal redesign, map discoverability
- [x] Combat condition surfaced to the AI for believable wounds (deterministic combat stays AI-blind); hardened local-dev CLI task runner
- [x] Side-quest Journal tab with progress and derived how/where hints (#41/#42)
- [x] Combat-depth program (#43-#49): party boss fights (Lead + Support formation, multi-round, real enemy HP, bosses hit back), levels grant combat power (+1 per 2 levels), gear-ladder expansion incl. the t3 legendary shelf, revived site loot pools, Monte-Carlo balance-sim harness + progression lint
- [x] Side-quest pool tripled to 42 with load-time backfill into in-progress saves (#45); desert + frozen t2 sequels so every genre chains t1 → t2 (#50)
- [x] Adventure Book: unified tabbed modal hub (Campaign / Side Quests / Codex / Party / AI) with a discovered-only bestiary + item codex (#51/#52)
- [x] Campaign chaining: on completion, continue the next chapter inside the same save and world (`docs/QUEST_CHAINING_PLAN.md`)
- [x] Premium groundwork: entitlement-gated templates, local content slot for private campaigns, production AI pinned to the CF Workers pool (Free vs Premium pool selector)
- [x] Save sync Phases 1-3 (#54/#57): honest local fallback with save-status copy, local-first write-through, merged saved-games list with sync badges, auto-reconcile on auth restoration; rev-counter protocol with exact fork detection, Dropbox-style diverged-save parking, and hero-ledger union across forks (`docs/SAVE_SYNC_PLAN.md`)
- [x] Hero mechanics invariants + append-only grant ledger (#58): load-time checker heals stats upward from XP/formula; maxHP raises preserve damage taken
- [x] Explorable-site content wiring (#56): visible in-modal feedback, real harvesting, multi-quest injection, AI grounded on site contents; party-wide milestone XP + NPC naming/rehoming fixes (#55)
- [x] World-gen wave: lake taming with water budget + shape variety (#59), world-level lake cap (#63), seam-matched coast depth, desert mesa art; hub-and-spoke town path network (#62); large-world chunk-assembly prototype behind `/debug/large-world` (#61, debug-only, `docs/LARGER_WORLDS_PLAN.md`)
- [x] Data Postgres migrated off Supabase to a self-hosted box via Cloudflare Hyperdrive; worker DB routes rewritten to postgres.js (JWTs still verified against the Octonion hub)
- [x] Entitlements service (#39): account tiers (free / member / premium / elite) in Postgres behind a worker endpoint, tier-aware client gates, Membership badge on the profile page; server-delivered premium story templates to entitled accounts (#40) with per-template `minTier` (#70)
- [x] Water towns (#65, `docs/WATER_TOWNS_PLAN.md`): river-city and canal-city archetypes with directional canal tile art, estuary world-gen + once-per-save tier-gated stamping, boathouse/Boatwright, six dockside side quests; river doctrine wave (#67-69): water-biased settlement placement, riverside one-bank towns, coastal forks, open river mouths
- [x] Themed town building palettes (#64): desert adobe + snow timber with tier-2 details (flat roofs, chimney smoke, icicles, jetty docks); world-map viewport with stepped zoom + tile culling, shipped dark for worlds above 10x10 (#60 step 2)

## Next

- [ ] Fix magic-link email template (OTP token shown but no UI input) — critical quick fix
- [ ] Rate limiting on `/api/ai` and `/api/db/*` (abuse prevention)
- [ ] Add missing assets (building interiors incl. `workshop` — Henry #26; quest-item icons)
- [ ] Replace fragile keyword-based encounter-engagement detection
- [ ] Mobile UI fixes (sign-in/nav overlap, How-To-Play layout)
- [ ] Guest conversion: prompt at a high-intent moment (e.g. first milestone), beyond the persistent banner

## Backlog

- [ ] Billing + credit system (Lemon Squeezy) + AI usage tracking → unlocks OpenRouter premium tier
- [ ] Tiered narration — local templated prose for routine moves, AI for notable moments, as a cost/latency lever; subsumes guest movement narration / Guest Mode B3 (`docs/TIERED_NARRATION_PLAN.md`)
- [ ] Streaming AI responses
- [ ] Dungeon sub-maps (procedural caves / dungeons)
- [ ] Layered terrain generation (heightmaps, rivers, erosion) — prototype exists
- [ ] AI-generated world-map image tiles (AI loot narration de-scoped to a richer templated loot line, see OUTSTANDING_ISSUES #8)
- [ ] Cloudflare D1 / R2 / KV migration (data Postgres is already off Supabase, self-hosted via Hyperdrive)
- [ ] SSO expansion (Google, GitHub, Discord) + magic-link sign-in
- [ ] Monitoring (Sentry), structured logging, automated Worker deploy, ops runbook
- [ ] Graph-enhanced RAG for long-context quests (basic RAG shipped; see `docs/RAG_GRAPH_ENHANCEMENT_PLAN.md`)
