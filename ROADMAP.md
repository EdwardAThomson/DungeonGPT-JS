# Roadmap — DungeonGPT (JS)

_Status: active · updated 2026-07-04_

The production rewrite of DungeonGPT — a React web app for creating fantasy
characters and playing AI-narrated RPG campaigns. Deployed at dungeongpt.xyz on
Cloudflare Pages + Workers with a Supabase database. (Based on the Python
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
- [x] Supabase Postgres persistence (heroes, sessions, conversations) with RLS via CF Worker proxy
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
- [ ] Cloudflare D1 / R2 / KV migration (off Supabase)
- [ ] SSO expansion (Google, GitHub, Discord) + magic-link sign-in
- [ ] Monitoring (Sentry), structured logging, automated Worker deploy, ops runbook
- [ ] Graph-enhanced RAG for long-context quests (basic RAG shipped; see `docs/RAG_GRAPH_ENHANCEMENT_PLAN.md`)
