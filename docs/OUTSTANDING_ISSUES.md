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
| 30 | **Admin dashboard — read/inspect the Supabase database.** *(Flagged HIGH PRIORITY.)* No way today to view player saves / heroes / conversations for support or debugging. Triggered by a player who lost a hero to the duplicate-hero bug and asked whether their character still exists in the DB — which we cannot currently confirm. Needs a read view over conversations/saves (auth-gated to an admin), at minimum read-only. | Session 2026-06-28 | M-L | Soon | 

---

## Medium — scoped features, asset generation, integrations

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 8 | **AI loot narration.** Encounter rewards applied silently ("+50 XP, +12 gold" text). Phase 4 deferred. AI should narrate discovery. | [ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md) Phase 4 | M | |
| 9 | **AI image tiles for world map.** Phase 1: 7 easy tiles (features + towns, no edge-matching). Prompts written in [IMAGE_GENERATION_PROMPTS.md](IMAGE_GENERATION_PROMPTS.md); generation not run. | [TERRAIN_ROADMAP.md](TERRAIN_ROADMAP.md) | M (generation + wiring) | |
| 10 | **9 missing building interior images.** Alchemist, Market, Archives, Library, Foundry, Warehouse, Keep, Barn, Barracks. | [MISSING_BUILDING_IMAGES.md](MISSING_BUILDING_IMAGES.md) | S-M (asset gen) | |
| 11 | **Automated CF Worker deploy.** Frontend auto-deploys via Pages; Worker deploy is manual (`wrangler deploy`). Needs `.github/workflows/deploy.yml` + post-deploy smoke test. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S-M | |
| 12 | **Rate limiting on Worker.** No throttling on `/api/ai`, `/api/db/*`, `/api/embed`. Any authed user can spam. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5, [LOCAL_RAG_PLAN.md](LOCAL_RAG_PLAN.md) Q6 | S-M | |
> ~~#34: New Game custom-game options are drop-down heavy; player suggested collapsible accordion sections.~~ — **RESOLVED 2026-07-02 (Skip the accordion).** The real complaint ("a lot of drop-downs" / overload) was addressed by replacing the 5 tone dials (Grimness/Darkness/Magic/Tech/Narrative Style) with segmented **chip rows** (every option visible, one tap) plus sticky theme defaults + a "reset to theme" link. An accordion was evaluated and rejected: it would hide the main quest-builder behind clicks and broke the live preview. The quest-slot pickers keep dropdowns (many options each, where a dropdown is the right control). No further work planned. (The same feedback floated portrait-matches-race, already out of scope: race selector is hidden / human-only.)

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

Raw notes captured during a play session. Three items already fixed: hero cards stretched full-width when only one hero was present (now capped/card-sized); the Arcane Renaissance setting text named only Cogsworth while the first objective is in Tinker-Row (setting now points to the Tinker-Row workshop); and the missing-workshop bug (#22).

> ~~#22 Quest-blocking: workshop / quest building missing on some maps~~ — **fixed 2026-06-19.** Root cause: world-map town count was a random 2-4 independent of how many named towns the campaign requires, so milestone towns (Tinker-Row/Brasswick/Gear-End) and their quest buildings were silently dropped. `generateMapData` now guarantees at least as many towns as the campaign's named-town count (relaxing spacing on crowded maps), and `spawnWorldMapEntities` warns when a quest building targets a town that isn't on the map. Covered by a new `mapGenerator.test.js` case.

> ~~#23 Post-creation dead end~~ — **fixed 2026-06-20.** Added a guided onboarding flow: a shared `OnboardingSteps` indicator (Create Hero → Start a Game → Begin Quest) across the setup pages (marking a step done only when truly complete, e.g. step 1 only once a hero exists); an honest HeroSummary button label; a "Start a New Game →" next-step banner + real empty state on the roster (spotlighted right after adding a hero); a dismissible "New here?" prompt on the home page (auto-hidden once the player has saved games); and an empty-state CTA on Saved Games. Also fixed a misleading new-game validation message and renamed the "Templates" tab to "Ready-Made".

> ~~#24 Character selection process not obvious~~ — **fixed 2026-06-21.** Hero Selection now has a clear instruction line, a live "Party: N of 4 selected" counter, a per-card Add / "✓ In party" pill (with hover state and a dimmed "Party full" state at the 4-hero limit), and the cards are keyboard-operable buttons (role/tabindex/aria-pressed, Enter/Space, focus ring).

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 25 | **Map discoverability.** Accessing the map is not obvious; consider clearer affordance or making it visible at all times. Open design question. | Playtest (Henry) | S | |
| 26 | **Missing `workshop` building interior image** ("the place where I should search" had no picture). Extends #10 (missing building images), which does not currently list `workshop`. | Playtest (Henry) | XS-S (asset gen) | |

---

## Combat-system depth (competitor-analysis gaps, 2026-06-20)

Surfaced while positioning DungeonGPT against group-2 ("real mechanics") AI-GM competitors — see [ai-game-master-competitor-analysis.md](../ai-game-master-competitor-analysis.md). Combat is already on the defensible *deterministic* side (rolls/damage computed in code, AI does not decide outcomes), but the rules layer is thinner than the combat-fidelity leaders (LoreKeeper, Friends & Fables). Each item below is "fix, or do a thorough check of current behaviour and decide deliberately" — not all are wanted.

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 27 | **No attack-roll / AC / saving-throw loop.** Resolution is a single d20-vs-DC check (`encounterResolver.js`), not attack-roll-vs-armor-class + saving throws. Adds the biggest fidelity gap vs 5e-style competitors. | Competitor analysis | L | |
| 28 | **No conditions / status effects.** No buffs/debuffs, concentration, poison/stun/ongoing effects — only direct HP damage (`healthSystem.js`). | Competitor analysis | M-L | |
| 29 | **No real initiative / turn order.** Only a ~15% fumble check on action confirmation (`EncounterActionModal.js`); no initiative roll or turn sequencing. | Competitor analysis | M | |
| 30 | **No death saves / downed state.** HP ≤ 0 flips `isDefeated: true` and ends the encounter — no stabilisation, revival, or party-rescue mechanics. | Competitor analysis | M | |
| 31 | **No tactical positioning / battlemaps.** Encounters are abstract, not spatial; no token-on-grid layer (Friends & Fables has one). | Competitor analysis | L | |
| 32 | **No real-time multiplayer.** Single-player only. Flagged in the analysis as the largest strategic moat (Whitespace #1) and the most expensive gap to close on our stack. | Competitor analysis | XL (strategic) | |
| 33 | **Combat state only partially visible to the AI for later narrative.** Verify/decide what to pass. Today: encounter narration goes into conversation history + RAG, and defeated heroes show `[DEFEATED]` in the party list — but exact HP numbers, per-round damage dealt, and loot gained are **not** put in later prompts, so the AI is blind to tactical detail when narrating subsequent movement/location/story. | Session 2026-06-20 | S-M (design/check) | Partially done |

> **#33 — partially addressed 2026-06-21.** `formatPartyInfo` (`promptComposer.js`) now appends a coarse condition band for wounded heroes — `[injured]` (≤75%), `[badly wounded]` (≤50%), `[critically wounded - near death]` (≤25%) — reusing `getHPStatus`; full-health heroes stay plain and **no raw HP numbers** reach the AI. Also consolidated the two inline party formatters in `useGameInteraction.js` (adventure-start + player-action prompts) onto `formatPartyInfo`; these previously omitted even the `[DEFEATED]` flag, so an unconscious hero could be narrated as acting. Unit tests added to `promptComposer.test.js`. **Still open:** per-round damage and loot-gained (loot = #8) are still not surfaced; no integration/hook-level test proves the band reaches the live prompt; deeper "what combat detail should the AI see" remains a design call.

> **Not a deficiency — confirmed intentional:** combat narration is fully local/templated with **zero LLM calls** (`encounterResolver.js:53` — "Use base consequence for narration (fully local, no AI calls)"). This is a deliberate cost/latency win and should be preserved; the open question (#33) is only how much resolved *state* to surface to the AI for later actions, not whether to have the AI narrate combat itself.

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
