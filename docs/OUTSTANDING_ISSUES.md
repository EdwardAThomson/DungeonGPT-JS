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
| 3 | **Team encounter system (Lead + Support).** Full party combat for multi-hero parties. Design complete, zero code. Now the core of the combat-depth program (#43, [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §7). | [ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md) Phase 5 | L | |
| 4 | **Narrative milestones.** Mechanical types (item/combat/location) shipped; conversation-gated quest outcomes not built. | [CAMPAIGN_MILESTONE_SYSTEM.md](CAMPAIGN_MILESTONE_SYSTEM.md) Phase 4 | L | |
| 5 | **Layered terrain generation.** Noise-based heightmaps with biome quantiser, rivers, erosion. Prototype at `src/experimental/mapGen/layeredGenerator.js` exists but not wired to production. | [TERRAIN_ROADMAP.md](TERRAIN_ROADMAP.md) | L | |
| 6 | **Billing + usage accounting.** No credit ledger, no `ai_usage_events` table, no Lemon Squeezy (or alternative) integration. AI generation ungated beyond auth. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | L | |
| 7 | **OpenRouter premium tier.** Planned in README; not wired into `cf-worker/src/routes/ai.ts`. Depends on #6 (billing) for tier gating. | [CF_WORKER_GUIDE.md](CF_WORKER_GUIDE.md), [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) | M-L | |
| 30 | **Admin dashboard — read/inspect the Supabase database.** *(Flagged HIGH PRIORITY.)* No way today to view player saves / heroes / conversations for support or debugging. Triggered by a player who lost a hero to the duplicate-hero bug and asked whether their character still exists in the DB — which we cannot currently confirm. Needs a read view over conversations/saves (auth-gated to an admin), at minimum read-only. | Session 2026-06-28 | M-L | Soon | 
| 43 | **Combat-depth program: bosses hit back + party boss fights.** Implement #3 (Lead + Support) for multi-round boss fights and add explicit boss damage profiles on encounter data, replacing `shouldDealDamage` keyword matching; includes the flat-vs-percent enemy-damage decision. Step 2 of [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §9. | Design session 2026-07-03 | L | |

---

## Medium — scoped features, asset generation, integrations

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 8 | **AI loot narration.** Encounter rewards applied silently ("+50 XP, +12 gold" text). Phase 4 deferred. AI should narrate discovery. | [ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md) Phase 4 | M | |
| 9 | **AI image tiles for world map.** Phase 1: 7 easy tiles (features + towns, no edge-matching). Prompts written in [IMAGE_GENERATION_PROMPTS.md](IMAGE_GENERATION_PROMPTS.md); generation not run. | [TERRAIN_ROADMAP.md](TERRAIN_ROADMAP.md) | M (generation + wiring) | |
| 10 | **9 missing building interior images.** Alchemist, Market, Archives, Library, Foundry, Warehouse, Keep, Barn, Barracks. | [MISSING_BUILDING_IMAGES.md](MISSING_BUILDING_IMAGES.md) | S-M (asset gen) | |
| 11 | **Automated CF Worker deploy.** Frontend auto-deploys via Pages; Worker deploy is manual (`wrangler deploy`). Needs `.github/workflows/deploy.yml` + post-deploy smoke test. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S-M | |
| 12 | **Rate limiting on Worker.** No throttling on `/api/ai`, `/api/db/*`, `/api/embed`. Any authed user can spam. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5, [LOCAL_RAG_PLAN.md](LOCAL_RAG_PLAN.md) Q6 | S-M | |
| 44 | **Gear-ladder expansion.** Fill the empty very_rare weapon rung and thin armor ladder (no legendary armor), add the t3 legendary shelf, shift the top end from quest artifacts to findable loot; bonuses sim-tuned, depends on #43 making defense matter. [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §5. | Design session 2026-07-03 | S-M + icon art | |
| 45 | **XP economy / content expansion.** Worlds pay ~1,700-3,200 XP vs 6,500 for Lv 5: expand the 30-quest side-quest pool (only 2-4 picked per world), backfill quests into in-progress saves, same-world sequels, and decide the t3 entry range. [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §2.1, [FEATURE_SIDEQUEST_BACKFILL.md](FEATURE_SIDEQUEST_BACKFILL.md), [QUEST_CHAINING_PLAN.md](QUEST_CHAINING_PLAN.md) | Design session 2026-07-03 | M | |
| 46 | **Balance-sim harness.** Pure-JS Monte-Carlo over the real resolver (`balanceSim.js` + test guard with KNOWN_UNBALANCED baseline), extended from day one to model party size, Lead/Support bonuses, boss damage profiles, and an XP-budget audit per world. Build first; step 1 of [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §4/§9. Now also carries the progression-lint guards (band coverage, gear obtainability, leveling-power delta) per §16. | Design session 2026-07-03 | M | |
| 47 | **Leveling grants zero combat power.** Measured win-rate delta per level = 0.0pp (sim of the real resolver): stats are frozen at creation (point-buy cap 15; the ASI system in `progressionSystem.js:126-139` is consumed only by the debug page `ProgressionTest.js`), and the check modifier (`encounterResolver.js:39-50`) has no level term. Level buys only maxHP (which 9/10 bosses never touch) and content gates, while DCs stay static, so the game never gets easier with level and grinding can't beat a DC wall. Decide and ship a leveling-power mechanic (apply ASI at Lv 4, or a proficiency-style +1 per 2 levels), sim-tuned together with the DC ladder (#43/#46). [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §11. | Progression audit 2026-07-03 | M | |
| 48 | **Level-up can LOWER max HP.** `awardXP` recalculates maxHP via `progressionSystem.calculateMaxHP(character.characterClass, …)` but heroes store the class as `heroClass` (`HeroCreation.js:121`), so every class levels as a d8; and that formula disagrees with the creation-time `healthSystem.calculateMaxHP` (10 + Con×5, cap 30). Verified: a Con-14 hero goes 20 maxHP at Lv 1 → **17** at Lv 2 → 24 at Lv 3. Fix: unify on one maxHP formula and the field name. [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §11.3. | Progression audit 2026-07-03 | S | |
| 49 | **Unobtainable gear, dead site-loot pools, wrong quest hints.** `legendary_weapon` (the only +2 weapon; its sole drop is tier-gated to nonexistent t3), `dragonscale_plate`, `hide_armor`, and `ring_protection` have NO live source (no shop, no reachable drop, no reward). Cause of two of them: `sitePopulator.js:128` coerces forest/hills/mountain sites to 'cave', so their themed `LOOT`/`HOARD_BONUS` pools never roll, and `questHints.describeItemSources` (which reads those pools) tells players sources that don't exist. Also: the 25g shortsword, 100-125g daggers, and 500g Enchanted Blade are ALL +1 (a flat price ladder). Repair before/with #44; lint guard in #46. [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §12. | Progression audit 2026-07-03 | S-M | |
| 50 | **Mid/top band content coverage.** Desert-expedition and frozen-frontier genres dead-end at t1 (no t2 sequel, stranding parties at Lv 2-3); only 8/30 side quests have `minLevel ≥ 3` (and `effectivePartyLevel` = lead + party/2 lets a 4-hero Lv-1 party see 28/30 on day one); random encounters have no level/tier input so nothing new appears after Lv 2; bands Lv 6-7 have zero campaigns, quests, bosses, or gear. Overlaps #45 (may merge at prioritization). [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §13.3-15. | Progression audit 2026-07-03 | M-L | |
> ~~#41/#42: Journal side-quest tab + objective clarity.~~ — **SHIPPED 2026-07-03.** Journal has 📜 Campaign | 🗺️ Side Quests tabs; quest cards sort ready→active→completed with per-step progress and derived how/where hints (questHints.js), plus the accept-time site-reveal toast. Design record: [SIDEQUEST_UX_PLAN.md](SIDEQUEST_UX_PLAN.md).

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
| 35 | **Narrative-tier encounter hooks have no visible affordance (signed-in).** Non-hostile encounters (e.g. Hidden Cache treasure) never open the action modal: the hook is woven into Look-around AI narration and relies on the player *typing* a follow-up ("I dig it out"), which nothing teaches. Their `rewards` are only rollable via the modal flow, so an un-acted hook forfeits them silently. Consider action chips under the narration, or opening the modal after the AI beat. (Guests now get the fallback modal — fixed 2026-07-02.) | Playtest 2026-07-02 (hills treasure) | S-M (design + UI) | |
| 36 | **Parked Look-around encounter silently discarded on next move.** `pendingLookEncounter` is cleared when the player moves without Looking around, so a rolled narrative encounter (and its rewards) vanishes with no trace. Consider persisting it for N moves or surfacing a hint ("something glints nearby"). | Playtest 2026-07-02 | XS-S | |
| 37 | **Encounter presentation note: narrative-tier hooks show no encounter image.** All 46 encounter images exist and every catalog entry has an `image:` field, but images only render in the action modal, text-woven hooks are image-less by design. If hooks gain an affordance (#35), consider showing the image alongside. | Playtest 2026-07-02 | XS (note) | |
| 39 | **Server-side entitlements (prerequisite for charging money).** `isPremium()` is a client-side localStorage placeholder — one console line unlocks everything. Design: user tier in Supabase (or an auth-JWT claim once billing exists); CF Worker enforces tier on premium endpoints (OpenRouter models, premium content #40) and exposes the tier to the client (e.g. `/api/me/entitlements` or with auth responses); swap the body of `src/game/entitlements.js isPremium()` to read it — every existing gate then just works, client gating stays as UX only. Blocked on the current `cf-worker/` WIP landing first. | [LICENSING_OPTIONS.md](LICENSING_OPTIONS.md) decision 2026-07-02 | M | Soon |
| 40 | **Server-delivered premium content channel.** Future premium campaigns/music must NOT ship in the public repo or client bundle (anything bundled is public regardless of license). Design: story templates are pure JSON — store premium ones Worker/Supabase-side; a catalog endpoint lists premium entries as locked stubs (name/icon/description for the storefront) and serves full template data only to entitled users (#39); music via gated R2/CDN URLs. The already-published desert/snow campaigns stay gated in-product as-is (JSON is irrevocably Apache — treat as free marketing). Needed before the NEXT premium campaign is authored. | [LICENSING_OPTIONS.md](LICENSING_OPTIONS.md) decision 2026-07-02 | M | |

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
