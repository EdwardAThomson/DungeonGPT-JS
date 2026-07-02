# Documentation map

Index of the docs in this folder. High-level status lives in `../ROADMAP.md`; the master
backlog is `OUTSTANDING_ISSUES.md`. Retired docs move to `docs/archive/` (gitignored), not
deleted. When the code and a doc disagree, the code wins.

## Planning & status
- `OUTSTANDING_ISSUES.md` — master backlog
- `../ROADMAP.md` — high-level project status
- `LICENSING_OPTIONS.md` — licensing decision memo (decided: stay Apache-2.0; premium via engineering)

## Architecture & deployment
- `DEPLOYMENT_ARCHITECTURE.md` — current prod stack (CF Pages + Worker + Supabase)
- `CF_WORKER_GUIDE.md` — production Worker reference (model lineup: code wins over the doc)
- `authentication_plan.md` — Octonion-hub auth / JWT verification

## System references (shipped, live systems)
- `CAMPAIGN_MILESTONE_SYSTEM.md` — milestone/campaign engine
- `MILESTONE_NPC_GROUNDING_PLAN.md` — authored-NPC grounding + `talk` milestones (Options B+C shipped 2026-07-02)
- `ENCOUNTER_SYSTEM.md` — encounter system
- `EQUIPMENT_ITEMS.md` — equipment stat model, item ladder, deferred work
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
- `FEATURE_SIDEQUEST_BACKFILL.md` — backfilling the discoverable side-quest pool
- `RAG_GRAPH_ENHANCEMENT_PLAN.md` — graph-enhanced RAG (proposed)
- `TERRAIN_ROADMAP.md` — experimental layered/noise terrain (debug-only)
- `GUEST_MODE_PLAN.md` — guest mode (core shipped; conversion-prompt follow-up open)

## Art & assets
- `IMAGE_GENERATION_PROMPTS.md` — art-gen prompt library + style guide
- `BUILDING_IMAGE_PROMPTS.md` — building interior prompts
- `MISSING_BUILDING_IMAGES.md` — outstanding building art tracker

## Shipped (historical) — in `docs/archive/`
Design/plan docs kept for the record after their feature shipped, or stale snapshots:
equipment, shops, explorable POIs, quests & sites, side-quest pool, wilderness sites,
world biomes, local RAG, the entity/refactor audits, and the dated prompt/items/summarization
notes. See `docs/archive/`.
