# Roadmap — DungeonGPT (JS)

_Status: active · updated 2026-05-31_

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

## Next

- [ ] Fix magic-link email template (OTP token shown but no UI input) — critical quick fix
- [ ] Narrative milestones (conversation-gated quest outcomes) — designed, not yet coded
- [ ] Rate limiting on `/api/ai` and `/api/db/*` (abuse prevention)
- [ ] Add missing assets (9 building interiors, 4 quest-item icons)
- [ ] Replace fragile keyword-based encounter-engagement detection
- [ ] Mobile UI fixes (sign-in/nav overlap, How-To-Play layout)

## Backlog

- [ ] Billing + credit system (Lemon Squeezy) + AI usage tracking → unlocks OpenRouter premium tier
- [ ] Streaming AI responses
- [ ] Team / turn-based tactical combat (party Lead + Support roles)
- [ ] Dungeon sub-maps (procedural caves / dungeons)
- [ ] Layered terrain generation (heightmaps, rivers, erosion) — prototype exists
- [ ] AI loot narration + AI-generated world-map image tiles
- [ ] Cloudflare D1 / R2 / KV migration (off Supabase)
- [ ] SSO expansion (Google, GitHub, Discord) + magic-link sign-in
- [ ] Monitoring (Sentry), structured logging, automated Worker deploy, ops runbook
- [ ] RAG + conversation summarization for long-context quests
