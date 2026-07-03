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
| 5 | **Layered terrain generation.** Noise-based heightmaps with biome quantiser, rivers, erosion. Prototype at `src/experimental/mapGen/layeredGenerator.js` exists but not wired to production. | [TERRAIN_ROADMAP.md](TERRAIN_ROADMAP.md) | L | |
| 6 | **Billing + usage accounting.** No credit ledger, no `ai_usage_events` table, no Lemon Squeezy (or alternative) integration. AI generation ungated beyond auth. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | L | |
| 7 | **OpenRouter premium tier.** Planned in README; not wired into `cf-worker/src/routes/ai.ts`. Depends on #6 (billing) for tier gating. | [CF_WORKER_GUIDE.md](CF_WORKER_GUIDE.md), [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) | M-L | |
| 30 | **Admin dashboard — read/inspect the Supabase database.** *(Flagged HIGH PRIORITY.)* No way today to view player saves / heroes / conversations for support or debugging. Triggered by a player who lost a hero to the duplicate-hero bug and asked whether their character still exists in the DB — which we cannot currently confirm. Needs a read view over conversations/saves (auth-gated to an admin), at minimum read-only. | Session 2026-06-28 | M-L | Soon | 
| 43 | ~~**Combat-depth program: bosses hit back + party boss fights.**~~ **SHIPPED 2026-07-03.** Lead + Support (Phase 5) is live for multi-round fights (support bonus in the roll, lead KO auto-swap, crit-fail splash, party XP split); enemy damage is FLAT per outcome with HP-scaled `maxRounds` (enemy HP is a real knob); all 10 template bosses carry explicit `dealsDamage`/`damage` profiles (keyword matching deprecated, kept as old-data fallback); the three deadly t2 bosses retuned to sim-validated `dc` 19-20. All boss pins in `progressionLint.test.js` healed (bands: t1 solo / t2+ 3-hero mid-gear). Shipped note in [ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md) Phase 5; #3 shipped with it. | Design session 2026-07-03 | L | Done |

> ~~#4: Narrative milestones — conversation-gated quest outcomes not built.~~ — **SHIPPED (verified 2026-07-03 audit).** Both halves now exist end-to-end: AI-judged `type: 'narrative'` milestones complete via the `[COMPLETE_MILESTONE]` marker in `useGameInteraction.js` (guarded so a stray marker can never complete a mechanical milestone; 5 narrative milestones live in `storyTemplates.js`), and the 2026-07-02 milestone NPC-grounding work added a deterministic **`talk` mechanical type** (`npc_talked` events, Option C) with authored, placed NPCs (Captain Marta / Ulric) — the conversation-gated outcome the row asked for. Design record: [MILESTONE_NPC_GROUNDING_PLAN.md](MILESTONE_NPC_GROUNDING_PLAN.md).

---

## Medium — scoped features, asset generation, integrations

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 8 | **AI loot narration.** Encounter rewards applied silently ("+50 XP, +12 gold" text). Phase 4 deferred. AI should narrate discovery. *(Re-scoped 2026-07-03 audit: combat narration is deliberately zero-LLM — see the #33 note — so this must be a post-encounter beat, either an AI call after resolution or a richer local template, not in-combat AI narration.)* | [ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md) Phase 4 | M | |
| 9 | **AI image tiles for world map.** Phase 1: 7 easy tiles (features + towns, no edge-matching). Prompts written in [IMAGE_GENERATION_PROMPTS.md](IMAGE_GENERATION_PROMPTS.md); generation not run. | [TERRAIN_ROADMAP.md](TERRAIN_ROADMAP.md) | M (generation + wiring) | |
| 11 | **Automated CF Worker deploy.** Frontend auto-deploys via Pages; Worker deploy is manual (`wrangler deploy`). Needs `.github/workflows/deploy.yml` + post-deploy smoke test. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S-M | |
| 12 | **Rate limiting on Worker.** No throttling on `/api/ai`, `/api/db/*`, `/api/embed`. Any authed user can spam. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5, [LOCAL_RAG_PLAN.md](LOCAL_RAG_PLAN.md) Q6 | S-M | |
| 44 | **Gear-ladder expansion.** Fill the empty very_rare weapon rung and thin armor ladder (no legendary armor), add the t3 legendary shelf, shift the top end from quest artifacts to findable loot; bonuses sim-tuned, depends on #43 making defense matter. [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §5. | Design session 2026-07-03 | S-M + icon art | |
| 45 | **XP economy / content expansion.** Worlds pay ~1,700-3,200 XP vs 6,500 for Lv 5: expand the 30-quest side-quest pool (only 2-4 picked per world), backfill quests into in-progress saves, same-world sequels, and decide the t3 entry range. [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §2.1, [FEATURE_SIDEQUEST_BACKFILL.md](FEATURE_SIDEQUEST_BACKFILL.md), [QUEST_CHAINING_PLAN.md](QUEST_CHAINING_PLAN.md) | Design session 2026-07-03 | M | |
| 50 | **Mid/top band content coverage.** Desert-expedition and frozen-frontier genres dead-end at t1 (no t2 sequel, stranding parties at Lv 2-3); only 8/30 side quests have `minLevel ≥ 3` (and `effectivePartyLevel` = lead + party/2 lets a 4-hero Lv-1 party see 28/30 on day one); random encounters have no level/tier input so nothing new appears after Lv 2; bands Lv 6-7 have zero campaigns, quests, bosses, or gear. Overlaps #45 (may merge at prioritization). [T3_CAMPAIGNS_PLAN.md](T3_CAMPAIGNS_PLAN.md) §13.3-15. | Progression audit 2026-07-03 | M-L | |
| 51 | **In-game codex: item compendium + bestiary (discovered-only).** Auto-generated from ITEM_CATALOG/enemy data (zero authoring); entries unlock on encounter/defeat — silhouettes + "???" until discovered, preserving mystery while giving players a reference. Public-facing docs stay spoiler-light (mechanics, classes); no official drop tables/DCs/boss stats — the open repo remains the soft ceiling on secrecy, premium content stays server-side and genuinely hidden. | Design chat 2026-07-03 | M | |
> ~~#10: 9 missing building interior images (Alchemist, Market, Archives, Library, Foundry, Warehouse, Keep, Barn, Barracks).~~ — **SHIPPED 2026-06-28** (equipment-items pass + towns/buildings pass). All nine exist in `public/assets/buildings/`, plus ten newly-added building types (apothecary, fletcher, harbormaster, jail, magetower, mill, shrine, stables, tailor, townhall). Coverage is now enforced by `src/utils/buildingArt.test.js` (every placeable building must have an icon + interior image). [MISSING_BUILDING_IMAGES.md](MISSING_BUILDING_IMAGES.md) already records this.

> ~~#46: Balance-sim harness.~~ — **SHIPPED 2026-07-03** (`75bbdc6`). `src/game/balanceSim.js` + `balanceSim.test.js` (Monte-Carlo over the real resolver, KNOWN_UNBALANCED guard, Lead/Support + boss-profile modeling) and the six-guard progression lint (`src/game/progressionLint.test.js`).

> ~~#47: Leveling grants zero combat power.~~ — **SHIPPED 2026-07-03** (`fb7515f`, decision in `2fa4d09`): Option A, a level term of +1 per 2 levels (capped +3) on every check in `encounterResolver.js`, derived from level so it applies retroactively to existing saves. The ASI-at-Lv-4 modal was considered and **deferred** as a possible later layer, not part of this row.

> ~~#48: Level-up can LOWER max HP.~~ — **FIXED 2026-07-03** (`17f33bc`). `progressionSystem.js` now resolves `heroClass` (with `characterClass` fallback via `resolveClass`), unifies the maxHP formula, and clamps recalculated maxHP with `Math.max(recalc, current)` so older already-lowered saves heal forward.

> ~~#49: Unobtainable gear, dead site-loot pools, wrong quest hints.~~ — **FIXED 2026-07-03** (`b9a23a4`). `sitePopulator.js` no longer coerces forest/hills/mountain sites to 'cave' for loot (`LOOT[site.type]` used directly; only combat templates legitimately borrow cave/ruins mobs); themed pools + `HOARD_BONUS` now roll, gear made obtainable, and the obtainability lint guard landed with #46. Loot rarity is additionally tier/level-gated in `encounterResolver.js`.

> ~~#41/#42: Journal side-quest tab + objective clarity.~~ — **SHIPPED 2026-07-03.** Journal has 📜 Campaign | 🗺️ Side Quests tabs; quest cards sort ready→active→completed with per-step progress and derived how/where hints (questHints.js), plus the accept-time site-reveal toast. Design record: [SIDEQUEST_UX_PLAN.md](SIDEQUEST_UX_PLAN.md).

> ~~#34: New Game custom-game options are drop-down heavy; player suggested collapsible accordion sections.~~ — **RESOLVED 2026-07-02 (Skip the accordion).** The real complaint ("a lot of drop-downs" / overload) was addressed by replacing the 5 tone dials (Grimness/Darkness/Magic/Tech/Narrative Style) with segmented **chip rows** (every option visible, one tap) plus sticky theme defaults + a "reset to theme" link. An accordion was evaluated and rejected: it would hide the main quest-builder behind clicks and broke the live preview. The quest-slot pickers keep dropdowns (many options each, where a dropdown is the right control). No further work planned. (The same feedback floated portrait-matches-race, already out of scope: race selector is hidden / human-only.)

---

## Small — polish, loose ends, decisions

| # | Issue | Source | Size | Decision |
|---|---|---|---|---|
| 16 | **Structured logging + request correlation IDs.** Worker uses `console.error`; no request-ID middleware, no log aggregation verified. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S | |
| 17 | **RAG index cleanup on save delete.** IndexedDB bloat is a slow problem; worth adding when convenient. | [LOCAL_RAG_PLAN.md](LOCAL_RAG_PLAN.md) Q5 | XS | |
| 18 | **Embedding model migration strategy.** If CF Workers AI embedding model changes, old vectors become incompatible. Need versioning or forced re-index plan. | [LOCAL_RAG_PLAN.md](LOCAL_RAG_PLAN.md) Q7 | S (design) | |
| 19 | **Ops runbook.** No `docs/ops_runbook.md` for incidents, rollback, webhook replay. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S | |
| 20 | **Backup restore drill.** Supabase provides backups; documented restore test not recorded. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S | |
| 21 | **Smoke-test-on-deploy.** Playwright runs on PR/push but not gated against post-deploy production. | [DEPLOYMENT_ARCHITECTURE.md](DEPLOYMENT_ARCHITECTURE.md) §5 | S | |
| ~~35~~ | ~~**Narrative-tier encounter hooks have no visible affordance (signed-in).**~~ **SHIPPED 2026-07-03.** After a Look-around narration consumes a parked hook, the encounter's `suggestedActions` render as tappable chips (+ an Ignore chip) under that narration message (`NarrativeHookChips.js`); tapping one opens the real action modal, so skill rolls and rewards are reachable without typing. Chip state is transient (message-identity keyed in `Game.js`), never persisted into saved conversations. Guests keep the 2026-07-02 fallback modal. | Playtest 2026-07-02 (hills treasure) | S-M (design + UI) | Shipped |
| ~~36~~ | ~~**Parked Look-around encounter silently discarded on next move.**~~ **SHIPPED 2026-07-03.** `pendingLookEncounter` now survives `NARRATIVE_HOOK_PERSIST_MOVES` (3) world moves (`ageNarrativeHook` in `encounterController.js`): one subtle reminder line on the first move away, then silent expiry so stale hooks can't teleport. A failed/empty Look-around re-parks the hook instead of losing it. Offered chips (#35) expire on the same window. | Playtest 2026-07-02 | XS-S | Shipped |
| ~~37~~ | ~~**Encounter presentation note: narrative-tier hooks show no encounter image.**~~ **SHIPPED 2026-07-03.** The #35 chips block shows a modest encounter image preview (max-height 90px) above the chip row when the template has `image:`; the action modal still carries the full art. | Playtest 2026-07-02 | XS (note) | Shipped |
| 39 | **Server-side entitlements (prerequisite for charging money).** `isPremium()` is a client-side localStorage placeholder — one console line unlocks everything. Design: user tier in Supabase (or an auth-JWT claim once billing exists); CF Worker enforces tier on premium endpoints (OpenRouter models, premium content #40) and exposes the tier to the client (e.g. `/api/me/entitlements` or with auth responses); swap the body of `src/game/entitlements.js isPremium()` to read it — every existing gate then just works, client gating stays as UX only. Blocked on the current `cf-worker/` WIP landing first. *(Audit 2026-07-03: that WIP is the Supabase→Hetzner-Postgres migration via Hyperdrive, in flight uncommitted in `cf-worker/`; tier storage should land in the data Postgres, not Supabase.)* | [LICENSING_OPTIONS.md](LICENSING_OPTIONS.md) decision 2026-07-02 | M | Soon |
| 40 | **Server-delivered premium content channel.** Future premium campaigns/music must NOT ship in the public repo or client bundle (anything bundled is public regardless of license). Design: story templates are pure JSON — store premium ones Worker/Supabase-side (post-migration: data Postgres); a catalog endpoint lists premium entries as locked stubs (name/icon/description for the storefront) and serves full template data only to entitled users (#39); music via gated R2/CDN URLs. The already-published desert/snow campaigns stay gated in-product as-is (JSON is irrevocably Apache — treat as free marketing). Needed before the NEXT premium campaign is authored. | [LICENSING_OPTIONS.md](LICENSING_OPTIONS.md) decision 2026-07-02 | M | |

> ~~#13: Narrative encounter engagement detection (fragile "approach"/"investigate" keyword matching).~~ — **SUPERSEDED (verified 2026-07-03 audit).** The keyword matching no longer exists. Encounter delivery was redesigned into two tiers ([TIERED_NARRATION_PLAN.md](TIERED_NARRATION_PLAN.md) B3b): immediate-tier opens the action modal; narrative-tier is parked as `pendingLookEncounter` and consumed by the Look-around prompt. The *remaining* engagement gap (no affordance to act on a woven hook, hook lost on move) is exactly #35-#37 — track it there.

> ~~#14: Immediate vs narrative encounter prompt suppression (decision pending).~~ — **DECIDED & SHIPPED (verified 2026-07-03 audit).** Movement no longer auto-fires AI narration at all (B3b "smart" narration: local templated lines per move; AI only on Look-around / free-text). When an immediate encounter fires, the flow returns early and local narration resumes after resolution (`Game.js` `flowType === 'immediate'`), so the old question is moot.

> ~~#15: 4 missing quest item icons (`medical_journal`, `medicine_kit`, `uncovered_ruins`, `nature_blessing`).~~ — **SHIPPED by 2026-06-28** (equipment-items pass `9782920`). All four exist in `public/assets/icons/items/`.

---

## Playtest feedback — Henry (2026-06-19)

Raw notes captured during a play session. Three items already fixed: hero cards stretched full-width when only one hero was present (now capped/card-sized); the Arcane Renaissance setting text named only Cogsworth while the first objective is in Tinker-Row (setting now points to the Tinker-Row workshop); and the missing-workshop bug (#22).

> ~~#22 Quest-blocking: workshop / quest building missing on some maps~~ — **fixed 2026-06-19.** Root cause: world-map town count was a random 2-4 independent of how many named towns the campaign requires, so milestone towns (Tinker-Row/Brasswick/Gear-End) and their quest buildings were silently dropped. `generateMapData` now guarantees at least as many towns as the campaign's named-town count (relaxing spacing on crowded maps), and `spawnWorldMapEntities` warns when a quest building targets a town that isn't on the map. Covered by a new `mapGenerator.test.js` case.

> ~~#23 Post-creation dead end~~ — **fixed 2026-06-20.** Added a guided onboarding flow: a shared `OnboardingSteps` indicator (Create Hero → Start a Game → Begin Quest) across the setup pages (marking a step done only when truly complete, e.g. step 1 only once a hero exists); an honest HeroSummary button label; a "Start a New Game →" next-step banner + real empty state on the roster (spotlighted right after adding a hero); a dismissible "New here?" prompt on the home page (auto-hidden once the player has saved games); and an empty-state CTA on Saved Games. Also fixed a misleading new-game validation message and renamed the "Templates" tab to "Ready-Made".

> ~~#24 Character selection process not obvious~~ — **fixed 2026-06-21.** Hero Selection now has a clear instruction line, a live "Party: N of 4 selected" counter, a per-card Add / "✓ In party" pill (with hover state and a dimmed "Party full" state at the 4-hero limit), and the cards are keyboard-operable buttons (role/tabindex/aria-pressed, Enter/Space, focus ring).

> ~~#25 Map discoverability~~ — **addressed 2026-06-21** (guided-tour commit `bc317d4`) and verified 2026-07-03: the onboarding tour has an explicit `open-map` step spotlighting the always-visible header Map button ("Open the map and click a tile to move. It stays open as you explore"), the map stays open while travelling, and it auto-reopens after encounters (`reopenMapAfterEncounterRef`). The "visible at all times" (minimap) alternative was not built; reopen as a new row if playtests still show confusion.

> ~~#26 Missing `workshop` building interior image~~ — **SHIPPED 2026-06-28** (buildings pass `85a027f`/`9782920`): `public/assets/buildings/workshop.webp` exists, and `buildingArt.test.js` now enforces icon+interior coverage for every placeable building type, so this class of bug can't silently recur. All Henry playtest items are now closed.

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

## Parallelization map (audit 2026-07-03)

*(Replaces the stale "Recommended prioritization" section, which referenced already-resolved rows.)* Groups the remaining open items into clusters by file/system ownership, the same wave model used for #46-#49. Items in different clusters can run as parallel agent-sized packages; items inside a "serialize" cluster must land in order. Numbering caveat: **#30 is used twice** in this doc (admin dashboard, and no-death-saves in the combat table) — do not renumber; qualify references as "#30 (admin)" vs "#30 (combat)".

**A. Combat core — SERIALIZE (owns `encounterResolver.js`, `EncounterActionModal.js`, encounter data, `balanceSim.js`):**
- #43 (in progress) → #44 (gear-ladder tuning; needs #43 so defense matters) → t3 authoring parts of #45/#50.
- #27, #28, #29, #30 (combat), and the remainder of #33 are all reshaped by #43's outcome (boss damage profiles, multi-round fights); re-triage them after #43 lands rather than starting any now.

**B. Content / data-only — PARALLEL-SAFE (owns `src/data/` quests/templates; no engine files):**
- #45 side-quest pool expansion + backfill, #50 mid-band quests/sequels/random-encounter tiers (the two may merge). Data authoring can start now; the t3 entry-range and DC-ladder *decisions* wait on cluster A. The #46 lint guards keep this cluster honest.
- #9 world-map AI tiles (asset generation + `worldTileArt` wiring) — fully independent.

**C. Worker / backend — BLOCKED on the Hyperdrive migration WIP (uncommitted in `cf-worker/`) landing:**
- #39 entitlements → #40 premium content channel → #6 billing → #7 OpenRouter (strict chain; #40 needed before the next premium campaign is authored).
- #12 rate limiting, #16 structured logging, #30 (admin) dashboard — each independent of the other two, but all touch the worker/DB layer, so start only after the migration lands (or they get built twice).

**D. Encounter-UX package — PARALLEL to everything else (owns `Game.js` encounter flow + modal):**
- #35 + #36 + #37 as one package (#37 explicitly depends on #35's affordance; #36 shares the `pendingLookEncounter` lifecycle). #8 (loot narration) also lives in this surface and can ride along or follow.
- Caveat: if #35's fix opens the action modal, it touches `EncounterActionModal.js`, which cluster A (#43) is actively rewriting — sequence that specific piece after #43 lands, or scope #35 to chips-under-narration only.

**E. Ops / infra — PARALLEL-SAFE, each independent:**
- #11 auto-deploy, #19 runbook, #20 restore drill, #21 smoke-on-deploy, #17 RAG cleanup, #18 embedding migration design, #1 (Supabase dashboard template edit, 5 min, no code).

**F. Big bets — own tracks, not scheduled:**
- #3 (absorbed into #43), #5 layered terrain (map-gen only; safe alongside all clusters but not with other world-gen changes), #31 battlemaps, #32 multiplayer.
