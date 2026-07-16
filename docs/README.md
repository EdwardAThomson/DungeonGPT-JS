# Documentation map

Index of the docs in this folder. High-level status lives in `../ROADMAP.md`; the master
backlog is `OUTSTANDING_ISSUES.md`. Retired docs move to `docs/archive/` (gitignored), not
deleted. When the code and a doc disagree, the code wins.

## Planning & status
- `OUTSTANDING_ISSUES.md` — master backlog
- `../ROADMAP.md` — high-level project status
- `LICENSING_OPTIONS.md` — licensing decision memo (decided: stay Apache-2.0; premium via engineering)
- Business-sensitive plans (pricing/monetization strategy) live in `docs/private/` — gitignored, local only

## Architecture & deployment
- `OPS_RUNBOOK.md` — incidents, rollbacks, BACKUPS (post-cutover: self-hosted PG), deploy CI, drills
- `CF_WORKER_GUIDE.md`: production Worker reference, incl. Octonion-hub auth / JWT verification (model lineup: code wins over the doc)
- `REDEMPTION_CODES.md` — redemption codes: schema, redeem endpoint, effective-tier rule, code lifecycle (#6 first slice)

## System references (shipped, live systems)
- `CAMPAIGN_MILESTONE_SYSTEM.md` — milestone/campaign engine
- `CAMPAIGN_MILESTONES.md`: generated at-a-glance overview of every campaign's milestones (run `npm run docs:campaigns` to regenerate; do not hand-edit)
- `MILESTONE_NPC_GROUNDING_PLAN.md` — authored-NPC grounding + `talk` milestones (Options B+C shipped 2026-07-02)
- `ENCOUNTER_SYSTEM.md` — encounter system
- `EQUIPMENT_ITEMS.md` — equipment stat model, item ladder, deferred work
- `CONTENT_AUDIT.md`: content-integrity audit harness (`npm run audit` report + a Jest CI gate) that cross-checks authored data against code capability tables
- `TIERED_NARRATION_PLAN.md` — "smart-by-default" narration tiers (localNarrator)

## Active feature plans (not yet built / in progress)
- `FEATURE_CRAFTING.md` — crafting/alchemy at blacksmith + alchemist
- `FEATURE_SPELLS_ABILITIES.md` — class spells/abilities (MP model), deterministic combat
- `FEATURE_FACTIONS.md` — reputation; finishes the dangling `affectedFactions` hook
- `FEATURE_COMPANIONS.md` — recruit/manage party companions
- `FEATURE_INVENTORY_AND_GEAR.md` — ranged weapons/bows + inventory/equip UI + starter gear
- `FEATURE_FAST_TRAVEL.md` — horses (land) + boats (water)
- `FEATURE_HERO_RECOVERY.md` — downed-hero recovery / revival flow
- `FEATURE_QUEST_GIVERS.md` — quest-giver NPCs handing out side-quests
- `FEATURE_SIDEQUEST_BACKFILL.md` — backfilling the discoverable side-quest pool (shipped 2026-07-04, #45, incl. top-up from the grown pool)
- `QUEST_CHAINING_PLAN.md`: quest chaining after campaign completion (shipped 2026-07-04 as same-save continuation: next chapter spawns additively into the existing world; the linked-save Phase 1 was superseded)
- `SIDEQUEST_UX_PLAN.md`: side-quest objective clarity and a Journal side-quest tab (shipped 2026-07-03, issues #41/#42)
- `RAG_GRAPH_ENHANCEMENT_PLAN.md` — graph-enhanced RAG (proposed)
- `TERRAIN_ROADMAP.md` — experimental layered/noise terrain (debug-only)
- `GUEST_MODE_PLAN.md` — guest mode (core shipped; conversion-prompt follow-up open)
- `SAVE_SYNC_PLAN.md` — local-first saves, honest offline fallback, divergence-safe multi-device reconcile (#54; Phases 1-3 shipped 2026-07-04/05, incl. the Phase 3 rev protocol with fork detection + ledger-union merge)
- `LARGER_WORLDS_PLAN.md` — chunked generation, flat storage, growable saves for paid tiers (#60; step 2 viewport shipped dark 2026-07-05, step 3 chunk-assembly prototype shipped debug-only behind `/debug/large-world`)
- `WATER_TOWNS_PLAN.md`: canal city + river city as water-typed hub-and-spoke variants, premium (#65; Phases 1-4 + 6 shipped 2026-07-05/06 along with the #67-69 river doctrine wave, Phase 5 packaging remains)
- `T3_CAMPAIGNS_PLAN.md` — Tier 3 campaign program (implemented in waves 2026-07-03/04; body kept as the planning record, per-row status in `OUTSTANDING_ISSUES.md`)
- `ARC_CARDS_AND_NARRATIVE_PLAN.md`: overarching arc cards + narrative framing (#73; Phase 1 shipped 2026-07-07, phases 2-4 future work)
- `AI_NARRATION_CONTRACT.md`: "engine referees, LLM narrates" (#76; decided 2026-07-15, not yet scheduled): abolish LLM milestone judgment, server-stripped markers, code-appended turn prompt, scripted high-stakes beats, few-shot renderer prompt
- `AI_QUEST_GENERATION_PLAN.md`: AI-authored campaigns/quests with engine-typed deterministic milestones (#77; proposed 2026-07-16). AI fills validated authored slots via a staged pipeline (no zero-shot), gated by the content audit; Members+ gate on the Freeform generator shipped 2026-07-16. Rests on the #76 "engine referees" contract
- `GAME_FEEL_PLAN.md`: audio + visual juice as a pure presentation layer (#78; brainstorm 2026-07-16). Music (Members+), reactive SFX, light particles, reactive button glow/border; maps each game surface to the effects that fit. Living idea doc, no code yet
- `COMBAT_UX_PLAN.md`: combat presentation rework (#79; brainstorm 2026-07-16). Combat animations (slice of #78), refining the clunky ~1440-line encounter modal, and an optional inline "open-play" rework; keystone is extracting the fight flow into a `useEncounterFight` hook. Mechanics unchanged (owned by `ENCOUNTER_SYSTEM.md`)
- `MOOD_THEMING_PLAN.md`: grimdark & eldritch map visuals (#80; brainstorm 2026-07-16). A mood layer (darker palette + decay/spirit motifs) applied on top of any biome for the grimdark-survival/eldritch-horror genres, keyed off the existing grimness/darkness dials so it's retroactive. Extends #64 (themed tilesets) and #78 (ambient effects)
- `SKILL_CHECK_PLAN.md`: engine-rolled skill checks for narrative actions, BG3-style (#83; proposed 2026-07-16, HIGH PRIORITY). Model proposes `[CHECK: skill, tier]` (bounded judgment), engine rolls vs the `DIFFICULTY_DC` ladder with full modifier parity, LLM narrates the handed result; failure always changes world state (fail-forward / complication / persisted lockout / escalation) and never dead-ends the golden path. Extends #76 and resolves its open question 5
- `dungeongpt-tts-notes.md`: TTS / dynamic voice narration research (#81; 2026-07-16). Recommends Workers AI (Deepgram Aura) from the Worker + R2 cache keyed by text hash (Phase 1), then client-side `kokoro-js` for dynamic synthesis (Phase 2); caching leans on the deterministic-vs-LLM split. Pairs with #78 audio

## Art & assets
- `IMAGE_GENERATION_PROMPTS.md` — art-gen prompt library + style guide
- `BUILDING_IMAGE_PROMPTS.md` — building interior prompts
- `MISSING_BUILDING_IMAGES.md` — outstanding building art tracker

## Shipped (historical) — in `docs/archive/`
Design/plan docs kept for the record after their feature shipped, or stale snapshots:
equipment, shops, explorable POIs, quests & sites, side-quest pool, wilderness sites,
world biomes, local RAG, the entity/refactor audits, and the dated prompt/items/summarization
notes. See `docs/archive/`.
