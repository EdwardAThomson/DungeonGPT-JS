# Tiered Narration Plan — local templated prose + AI for the moments that matter

Status: **Design / not started.** Generalizes Phase B3 of `GUEST_MODE_PLAN.md` (local
movement narration for guests) into an app-wide narration-cost lever for all players.

## Problem

Every tile move can fire an LLM request via `composeMovementNarrativePrompt`
(`src/game/promptComposer.js`) → `/api/ai`. Most of those moments are low-value:
crossing the third grassland tile in a row produces a paragraph nobody needed,
costs a Workers-AI call, adds rate-limit pressure, and shows an "AI is thinking…"
spinner for a non-event. Meanwhile guests (no AI) get *nothing* on movement.

We already have the opposite pattern working: **combat narration is fully local and
templated** (`encounterController.js` / `encounterResolver.js`, zero LLM). This plan
extends that proven approach from combat to movement/location prose, and adds a
routing policy so the LLM is spent only where it earns its keep.

## Goal

Route each narration moment to the cheapest tier that does it justice:

- **Local (templated, instant, free)** for routine, repetitive narration.
- **AI (LLM)** for the beats that carry weight — new places, encounters, story
  moments, and player free-text actions.

Wins: fewer/cheaper AI calls, lower latency on routine moves, graceful degradation
when AI is unavailable, and a richer guest experience for free. The AI also *feels*
more impactful because it's reserved for moments that matter.

## The three tiers (a setting, replacing the boolean `aiNarrativeEnabled`)

Today there's a binary `aiNarrativeEnabled` toggle. Replace it with a three-way mode:

| Mode | Movement/location prose | Encounter & free-text |
|------|------------------------|-----------------------|
| **Full AI** | always LLM | LLM |
| **Smart** (proposed default) | local for routine, LLM for *notable* moments | LLM |
| **Local only** | always templated, no `/api/ai` | encounters already local; free-text gated |

- Guests are effectively pinned to **Local only** for movement (the B3 case), with
  free-text actions still behind the sign-in gate.
- Signed-in users default to **Smart**; **Full AI** stays available for purists.

## The routing decision: "is this moment worth an API call?"

A pure scorer — `shouldUseAiNarration(tile, context) -> boolean` — decides the tier in
**Smart** mode. It runs before narration in the `Game.js` movement handler. Candidate
signals (all already available locally):

- **Novelty** — first visit to this tile/area; a *new* biome vs. the last one; a named
  POI or town entered for the first time. (High weight — newness is what reads as
  worth describing.)
- **Milestone proximity** — tile is at/adjacent to an active milestone POI
  (`milestoneEngine` / `getMilestoneLocationNames`). (High weight.)
- **Narrative momentum** — steps (or time) since the last AI narration; allow an
  occasional AI "flourish" on a long routine trek so it doesn't feel flat.
- **Party state change** — someone newly wounded/critical since last narration.
- **Major transition** — biome change, entering/leaving a settlement, day/night flip
  (if/when modeled).

Score the signals, compare to a threshold, spend the call if it clears. Start with a
hand-tuned weighting; tune later with telemetry (see Phasing). Encounters and
player free-text actions **always** route to AI regardless of score (they're the core
DM experience and carry `[COMPLETE_MILESTONE]` judging).

## The local narrator

A new pure module, e.g. `src/game/localNarrator.js`:

- **Inputs:** the same data `buildMovementPrompt` (`src/utils/promptBuilder.js`) and
  `buildLocationInfo` already assemble — `tile.biome`, `tile.poi`, `tile.townName`,
  `tile.descriptionSeed`, neighbor tiles (for "mountains rise to the east"), party
  HP bands, first-visit vs. revisit.
- **Composition:** template fragments combined as *intro clause* (biome) + *feature
  clause* (POI / landmark / neighbor) + *ambient detail* + *transition*. Fragment
  pools keyed by biome / POI type / first-vs-revisit, large enough to avoid
  "You enter the forest. You enter the forest."
- **Seeded & deterministic:** seed fragment selection by `worldSeed + tile coords`
  (we already seed map gen in `mapGenerator.js`). This gives variety *between* tiles
  but the *same* text on reload — essential so reloading a save doesn't rewrite the
  log. No `Math.random()`.
- **Templates** live in `src/data/` alongside `prompts.js` / `storyTemplates.js`.

`composeMovementNarrativePrompt` stays unchanged for the AI path; the two paths are
siblings selected by the scorer. Both consume the same assembled context.

## Architecture fit

- `src/game/localNarrator.js` — new pure module (templated, seeded). Unit-testable
  with no backend (assert determinism + biome/POI coverage).
- `src/game/narrationPolicy.js` (or a fn in the narrator) — `shouldUseAiNarration`.
- `Game.js` movement handler — call the policy, then either the local narrator
  (push text straight into the log) or the existing AI path.
- `SettingsContext` — replace `aiNarrativeEnabled` boolean with the three-way mode;
  migrate existing saved settings (`true` → Smart or Full AI; `false` → Local only).
- RAG: locally-narrated moves produce no embeddings (same as guest play today). AI
  moments still embed. Acceptable — routine tiles aren't memory-worthy anyway.

## Risks & things to watch

- **Template quality is the whole ballgame.** Canned prose makes Smart read as a
  downgrade and users flip back to Full AI. Phase 1 (guest-only) is the quality gate
  before Smart becomes a default.
- **Voice mismatch.** Templated and AI prose share one log; divergent tone reads
  oddly. Keep templates terse and DM-flavored; consider a subtle visual marker for
  ambient/local lines (or deliberately *not* marking them — decide after seeing it).
- **Continuity.** Templates can't reference recent events (no summary/RAG awareness).
  That's *why* continuity-heavy beats must score high enough to route to AI.
- **Determinism vs. saves.** Must seed by world+coords; a non-deterministic narrator
  would rewrite history on every reload.
- **Scorer mis-tuning.** Too strict → world feels mute; too loose → no savings.
  Make weights/threshold easy to adjust and instrument them.

## Roadmap (phases)

Sequenced so each phase ships value and de-risks the next. **Phase 1 is the quality
gate for Phase 2** — Smart mode must not promote until the local prose is proven good.

### Phase 0 — Foundations (no user-visible change)
- **Goal:** make "which tier narrates this move" a single routing decision, and stand
  up the local narrator skeleton, before changing any behavior.
- **Deliverables:**
  - Refactor the movement/location narration call in `Game.js` so both paths flow
    through one seam, e.g. `narrateMovement(tile, context)`, that internally picks a tier.
  - `src/game/localNarrator.js` skeleton + `src/data/narrationTemplates.js` with an
    initial fragment pool (core biomes + common POIs).
  - Seeded selection (`worldSeed` + tile coords) + unit tests for determinism and
    biome/POI coverage.
- **Exit criteria:** tests green; with the seam defaulting to today's behavior
  (signed-in → always AI, guest → nothing), prod output is byte-for-byte unchanged.
- **Depends on:** nothing.

### Phase 1 — Guest-only local narrator (was B3a)
- **Goal:** guests get templated movement prose instead of silence. The quality gate.
- **Deliverables:**
  - Route the guest (Local-only) path through `localNarrator`.
  - Expand template pools to cover all biomes, POI types, first-visit vs. revisit, and
    a party-wounded variant.
  - Playtest pass for repetition and DM-voice fit.
- **Exit criteria:** a guest can traverse the map and every move yields varied, on-tone
  prose (no "You enter the forest. You enter the forest." within a session); reloading
  a save reproduces identical text.
- **Depends on:** Phase 0. *(This is the original `GUEST_MODE_PLAN.md` B3.)*

### Phase 2 — Smart routing for signed-in users (was B3b)
- **Goal:** cut routine AI calls without hurting feel.
- **Deliverables:**
  - `src/game/narrationPolicy.js` — `shouldUseAiNarration(tile, context)` with the
    weighted novelty / milestone / momentum / party-state / transition signals.
  - Three-way mode in `SettingsContext` (Full AI / Smart / Local only) + migration of
    the old `aiNarrativeEnabled` boolean.
  - Default new signed-in users to **Smart**; existing users per the rollout decision
    (see Open questions).
- **Exit criteria:** new areas/towns/encounters/milestone tiles reliably route to AI;
  repeated terrain routes local; a representative traversal shows a meaningful AI-call
  reduction (initial target ~50–70% fewer movement calls) with no quality regressions
  in playtest.
- **Depends on:** Phases 0–1 (narrator quality proven first).

### Phase 3 — Instrument & tune (was B3c)
- **Goal:** replace hand-tuned weights with data-driven ones.
- **Deliverables:**
  - Lightweight telemetry: per-move tier chosen + signal scores; mode-override events
    (user flips Smart → Full AI).
  - A tuning pass on weights/threshold; document the final policy in this doc.
- **Exit criteria:** tier mix and override rate are visible; threshold tuned; override
  rate stays low (users rarely abandon Smart).
- **Depends on:** Phase 2 running in the wild.

### Phase 4 — Polish & expansion (optional)
- Broaden template variety (weather, time-of-day if modeled, regional flavor tied to
  the active story template).
- Resolve the voice-marking question; optional subtle styling for ambient/local lines.
- Revisit the "occasional AI flourish on a long routine trek" momentum signal.

### Phasing at a glance

| Phase | Ships | Risk bought down | Gate to next |
|-------|-------|------------------|--------------|
| 0 | routing seam + narrator scaffold (no behavior change) | integration risk | tests green, output unchanged |
| 1 | guest movement prose | template/voice quality | prose proven good |
| 2 | Smart mode + 3-way setting | cost without quality loss | measured savings, no regressions |
| 3 | telemetry + tuned thresholds | mis-tuned scorer | low override rate |
| 4 | richer templates, voice polish | staleness over time | — |

## Revisited (2026-06-26) — fit with themed maps & guest mode
- **Biome/theme-aware templates.** Phase 2b adds per-map themes (desert/snow/…). The local
  narrator should key its template pools on `tile.biome` + `settings.theme`, so a desert
  crossing reads as desert. This gives the narrator far more material and makes **Smart**
  mode coherent on a themed map (the biome is consistent across the region).
- **Reuse existing precedents.** Combat narration is already local/templated, and
  `src/game/introComposer.js` (the guest templated intro) is a working local-narration
  pattern — `localNarrator.js` should generalize it and copy its conventions (markdown
  `*italics*`, not `_`; deterministic, no `Math.random()`).
- **First slice = B3a (guest-only) — and it's the lowest-risk seam.** It's essentially a new
  `localNarrator.js` plus one hook in the guest movement path; it needs neither the 3-way
  setting nor the scorer yet. Ship it as the quality gate before promoting Smart mode.
- **Sequencing / conflict note.** Smart-mode wiring touches `Game.js` movement narration,
  `useGameInteraction.js`, `promptComposer.js`, and `SettingsContext` — the same files the
  in-flight WorldMapDisplay-migration and Phase-2b agents are editing. **Don't start the
  code until those land and merge**, or expect conflicts. Refining these notes is safe.
- **Why it matters (cost/latency/scale).** This is the lever that keeps AI spend and latency
  sane as play scales, and it's what makes richer guest play possible — reserve LLM calls
  for novel/notable beats, template the routine.

## Open questions

- Default for **existing** signed-in users on rollout: Smart (cost win, slight
  behavior change) or leave them Full AI and only default *new* users to Smart?
- Do we visually distinguish local vs. AI lines, or keep them indistinguishable?
- Should a long routine trek occasionally get an AI flourish (momentum signal), or is
  strict novelty-only cleaner/cheaper?
- Is "Local only" worth exposing to signed-in users as a deliberate zero-cost mode,
  or only as the implicit guest state?
