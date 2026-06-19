# Outstanding Issues

Triage doc consolidating every known open item across the `docs/` folder and session discussions. Items removed when done. Decisions column (`Soon / Defer / Skip`) is blank — to be filled in during prioritization.

Source audits: roadmap survey (2026-04-19), auth verification (2026-04-19), docs consolidation (2026-04-17 through 2026-04-19). Auth system and RAG system were surveyed and confirmed shipped — removed from this list.

---

## Critical — data loss or deployment blockers

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 1 | **Supabase magic-link email includes an OTP code but UI has no input for it.** Users who try to enter the code are stuck. Fix: edit Supabase email template to remove `{{ .Token }}` (5 min dashboard change) — don't build OTP UI, since auth is centralized at Octonion. | Session 2026-04-19 | XS (dashboard) | |

> ~~Previously listed: Supabase conversations schema gaps~~ — **verified 2026-04-19 as RESOLVED.** All 6 fields (`game_settings`, `selected_heroes`, `summary`, `world_map`, `player_position`, `sub_maps`) are in the schema, saved, and hydrated. AI_PROMPT_ANALYSIS.md §5 is stale.

---

## Large initiatives — multi-day / multi-week features

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 3 | **Team encounter system (Lead + Support).** Full party combat for multi-hero parties. Design complete, zero code. | [ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md) Phase 5 | L | |
| 4 | **Narrative milestones.** Mechanical types (item/combat/location) shipped; conversation-gated quest outcomes not built. | [CAMPAIGN_MILESTONE_SYSTEM.md](CAMPAIGN_MILESTONE_SYSTEM.md) Phase 4 | L | |
| 5 | **Layered terrain generation.** Noise-based heightmaps with biome quantiser, rivers, erosion. Prototype at `src/experimental/mapGen/layeredGenerator.js` exists but not wired to production. | [TERRAIN_ROADMAP.md](TERRAIN_ROADMAP.md) | L | |
| 6 | **Billing + usage accounting.** No credit ledger, no `ai_usage_events` table, no Lemon Squeezy (or alternative) integration. AI generation ungated beyond auth. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | L | |
| 7 | **OpenRouter premium tier.** Planned in README; not wired into `cf-worker/src/routes/ai.ts`. Depends on #6 (billing) for tier gating. | [CF_WORKER_GUIDE.md](CF_WORKER_GUIDE.md), [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) | M-L | |

---

## Medium — scoped features, asset generation, integrations

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 8 | **AI loot narration.** Encounter rewards applied silently ("+50 XP, +12 gold" text). Phase 4 deferred. AI should narrate discovery. | [ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md) Phase 4 | M | |
| 9 | **AI image tiles for world map.** Phase 1: 7 easy tiles (features + towns, no edge-matching). Prompts written in [IMAGE_GENERATION_PROMPTS.md](IMAGE_GENERATION_PROMPTS.md); generation not run. | [TERRAIN_ROADMAP.md](TERRAIN_ROADMAP.md) | M (generation + wiring) | |
| 10 | **9 missing building interior images.** Alchemist, Market, Archives, Library, Foundry, Warehouse, Keep, Barn, Barracks. | [MISSING_BUILDING_IMAGES.md](MISSING_BUILDING_IMAGES.md) | S-M (asset gen) | |
| 11 | **Automated CF Worker deploy.** Frontend auto-deploys via Pages; Worker deploy is manual (`wrangler deploy`). Needs `.github/workflows/deploy.yml` + post-deploy smoke test. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S-M | |
| 12 | **Rate limiting on Worker.** No throttling on `/api/ai`, `/api/db/*`, `/api/embed`. Any authed user can spam. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5, [LOCAL_RAG_PLAN.md](LOCAL_RAG_PLAN.md) Q6 | S-M | |

---

## Small — polish, loose ends, decisions

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 13 | **Narrative encounter engagement detection.** Movement-triggered narrative encounters use fragile keyword matching ("approach", "investigate"). Design open. | [ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md) Phase 2.4 Q1 | S | |
| 14 | **Immediate vs narrative encounter prompt suppression.** When immediate encounter fires, suppress AI movement prompt fully or show brief transition? Decision pending. | [ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md) Phase 2.4 Q2 | XS (decision) | |
| 15 | **4 missing quest item icons.** `medical_journal`, `medicine_kit`, `uncovered_ruins`, `nature_blessing` — in registry, no icons. | [items_list.md](items_list.md), [entity_audit.md](entity_audit.md) | XS (asset gen) | |
| 16 | **Structured logging + request correlation IDs.** Worker uses `console.error`; no request-ID middleware, no log aggregation verified. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S | |
| 17 | **RAG index cleanup on save delete.** IndexedDB bloat is a slow problem; worth adding when convenient. | [LOCAL_RAG_PLAN.md](LOCAL_RAG_PLAN.md) Q5 | XS | |
| 18 | **Embedding model migration strategy.** If CF Workers AI embedding model changes, old vectors become incompatible. Need versioning or forced re-index plan. | [LOCAL_RAG_PLAN.md](LOCAL_RAG_PLAN.md) Q7 | S (design) | |
| 19 | **Ops runbook.** No `docs/ops_runbook.md` for incidents, rollback, webhook replay. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S | |
| 20 | **Backup restore drill.** Supabase provides backups; documented restore test not recorded. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S | |
| 21 | **Smoke-test-on-deploy.** Playwright runs on PR/push but not gated against post-deploy production. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S | |

---

## Playtest feedback — Henry (2026-06-19)

Raw notes captured during a play session. Two items already fixed: hero cards stretched full-width when only one hero was present (now capped/card-sized), and the Arcane Renaissance setting text named only Cogsworth while the first objective is in Tinker-Row (setting now points to the Tinker-Row workshop).

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 22 | **Quest-blocking: workshop / quest building missing on some maps.** In Arcane Renaissance the control rod + workshop are injected at `location: 'Tinker-Row'` via `injectQuestBuildings()`; if that town isn't generated or injection is flaky the objective is uncompletable. Needs investigation in `milestoneSpawner.js` / town gen. | Playtest (Henry) | M | |
| 23 | **Post-creation dead end ("once a character is created, then what?").** No guidance/next-step prompt after hero creation; player is unsure how to proceed. Onboarding gap. | Playtest (Henry) | S | |
| 24 | **Character selection process not obvious.** Selection affordance on the hero selection page is unclear (how to pick / that you can pick multiple). UX clarity. | Playtest (Henry) | S | |
| 25 | **Map discoverability.** Accessing the map is not obvious; consider clearer affordance or making it visible at all times. Open design question. | Playtest (Henry) | S | |
| 26 | **Missing `workshop` building interior image** ("the place where I should search" had no picture). Extends #10 (missing building images), which does not currently list `workshop`. | Playtest (Henry) | XS-S (asset gen) | |

---

## Recommended prioritization (my take — subject to your call)

**Do soon:**
- #2 (OTP email template) — 5 minutes, removes user confusion
- #1 (Supabase schema) — data loss risk; affects every save/load

**Next wave:**
- #12 (rate limiting) — cheap guardrail before scale
- #11 (auto deploy) — reduces friction, quick win
- #15 (quest icons) + #10 (building images) — polish, parallelizable asset work

**Hold for dedicated sprints:**
- #3 (team encounters), #4 (narrative milestones), #5 (layered terrain) — each is a multi-week feature
- #6 (billing) + #7 (OpenRouter) — launch-gating; do together when ready to monetize

**Back-burner until needed:**
- #8 (loot narration), #13, #14, #16–#21 — all small but not urgent
