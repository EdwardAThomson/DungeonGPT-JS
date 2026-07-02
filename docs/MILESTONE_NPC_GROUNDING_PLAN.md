# Milestone NPC Grounding Plan

Design memo for fixing the "militia captain" immersion problem in the campaign
milestone system. This is a design plan only. No source is changed by this doc.

Status: decisions made 2026-07-02 — implementing Option B (see below)
Scope: `heroic-fantasy-t1` milestone #2 is the worked example, but the fix is
generic to every `type: 'narrative'` milestone that defines a `spawn.type: 'npc'`.

## Decisions (2026-07-02)

- **Approach: Option B now, Option C (deterministic completion) deferred** to a
  follow-up. This pass places the authored NPC, grounds the prompt + journal, and
  fixes the verb, but leaves narrative-milestone completion as AI-marker-judged.
- **Objective verb: "Meet"**, not "Warn" — `heroic-fantasy-t1` milestone #2 text
  becomes "Meet the militia captain at Briarwood".
- **Procedural captain: REPLACE, not augment.** When a building is a milestone's
  authored building (e.g. the Briarwood Militia Hall barracks), place the canonical
  NPC (Captain Marta) *instead of* the procedural "Commander of…" captain; other
  barracks keep their procedural staff.
- Save impact accepted as **going-forward-only** for cached town NPCs; prompt +
  journal grounding are retroactive.

---

## 1. Problem statement

The `heroic-fantasy-t1` ("The Goblin Threat") campaign has milestone #2:

> "Warn the militia captain at Briarwood"
> (`src/data/storyTemplates.js:46-57`)

It is a canonical, hand-authored quest beat. The milestone data even names the
NPC and the venue:

```js
// src/data/storyTemplates.js:53-54
spawn:    { type: 'npc', id: 'militia_captain', name: 'Captain Marta',
            location: 'Briarwood', role: 'Guard',
            personality: 'gruff, practical, protective of her people' },
building: { type: 'barracks', name: 'Briarwood Militia Hall', location: 'Briarwood' },
```

Despite this authored intent, in play:

- The named NPC **Captain Marta is never placed in the world.** The player met a
  procedurally-named "Jorik" instead.
- The AI **invents lore** ("go see the mayor") that has no basis in the campaign.
- The player **can't tell what to do** or whether the objective is engine-tracked
  or AI-judged, and completion is fragile (depends entirely on the model emitting
  a marker).
- The objective verb ("warn") is ambiguous vs. the natural play action ("meet /
  talk to"), which hurts AI-marker robustness.

The authored NPC and building exist in data but are invisible to both the world
and the model. The milestone is a name on a checklist with no grounding.

---

## 2. Root causes (with file:line)

### RC1 — The canonical NPC is collected but never consumed

`getSpawnRequirements()` correctly buckets the `npc` spawn:

```js
// src/game/milestoneEngine.js:207
case 'npc': npcs.push({ ...m.spawn, milestoneId: m.id }); break;
```

But nothing ever reads `spawns.npcs`:

- `spawnWorldMapEntities()` destructures `getSpawnRequirements()` and loops over
  `spawns.pois`, `spawns.buildings`, `spawns.enemies`, `spawns.items` — there is
  **no `npcs` loop** (`src/game/milestoneSpawner.js:91-195`). Its return payload
  omits npcs entirely (`:195`).
- `NewGame.js` consumes only `requiredBuildings` and `enemySpawns` from the spawn
  result (`src/pages/NewGame.js:337, 410-411`); the npc list would be dropped even
  if present.
- `populateTown()` (`src/utils/npcGenerator.js:514`) generates town NPCs purely
  from building tiles and a seed. It has **no channel** to receive a canonical
  milestone NPC. So the barracks is staffed generically (see RC5).

Net: `Captain Marta` is defined, bucketed, and then discarded.

### RC2 — The AI prompt never sees the canonical NPC or building

Milestones reach the model as **text + type tag only**:

```js
// src/hooks/useGameInteraction.js:71-74  (formatMilestonePromptText)
text += '\nActive Milestones: ' + active.map(m => {
  const typeTag = m.type ? ` [${m.type}]` : '';
  ...
  return `${m.text}${typeTag}${levelTag}`;
```

Same shape in `promptComposer.js:17-20` (`formatCampaignMilestones`). Neither
path forwards `m.spawn.name`, `m.spawn.role`, `m.spawn.personality`, or
`m.building.name`. So the model is told "Warn the militia captain at Briarwood
[narrative]" with **no canonical name to reuse** — it fills the vacuum by
inventing one ("Jorik", "the mayor").

Worse, when the player is *inside a building*, `buildLocationContext()` lists
nearby **building names** but never lists the **NPCs present** in that building
(`src/hooks/useGameInteraction.js:196-211`). Town NPCs are stored on
`townMapData.npcs` (`src/hooks/useGameMap.js:229, 265`) but that array is never
surfaced into the narration prompt. The DM literally cannot know who is standing
in front of the party.

### RC3 — Narrative completion is AI-marker-only, with no fallback

Narrative milestones are explicitly skipped by the deterministic engine:

```js
// src/game/milestoneEngine.js:73
if (milestone.type === 'narrative') continue;
```

They complete only when the model emits `[COMPLETE_MILESTONE: <text>]`, which is
fuzzy-matched to milestone text (`src/hooks/useGameInteraction.js:31, 448-474`).
There is a `completeNarrativeMilestone()` engine helper
(`src/game/milestoneEngine.js:136`) but **nothing else calls it** — no building
entry, no NPC interaction, no UI button. If the model forgets the marker (common
with small open-weights models), the quest is unclearable. `trigger: null`
(`storyTemplates.js:52`) confirms there is no mechanical path.

### RC4 — The objective is under-communicated to the player

The Journal renders only `m.text` (`src/components/Modals.js:377`). No "who"
(Captain Marta), no "where" (Briarwood Militia Hall), no "how" (talk to her). The
player has no in-game way to learn the canonical target the designer intended.

### RC5 — Recent procedural barracks staffing now competes with the canonical NPC

`populateTown()` recently gained a `barracks` branch that staffs the militia hall
with a **procedurally-named** ranking officer:

```js
// src/utils/npcGenerator.js:740-748
} else if (b.type === 'barracks') {
  const captain = addNPC("Guard", b, b, { title: rng.pick(["Captain","Sergeant","Lieutenant"]) });
  captain.job = `Commander of ${b.name}`;
  ...
}
```

So `Briarwood Militia Hall` now *does* get a captain — but a random one (this is
"Jorik"). Any fix must **reconcile** the canonical Marta with this procedural
captain (replace it, or suppress procedural staffing when a canonical NPC is
assigned), not create a second duplicate captain.

---

## 3. Design options

Three coherent options along a cost/immersion spectrum. They are additive: B
builds on A, C builds on B.

### Option A — Prompt grounding only (cheapest)

Feed the canonical NPC + building into the AI prompt whenever the party is in the
milestone's town/building, and keep AI-judged completion.

- **What changes**
  - `formatMilestonePromptText` / `formatCampaignMilestones` include, for the
    *active* narrative milestone, a compact "Key NPC" line: name, role,
    personality, venue (`useGameInteraction.js:65-84`, `promptComposer.js:6-26`).
  - Optionally, `buildLocationContext()` surfaces the canonical NPC when the
    party is inside the matching town (`useGameInteraction.js:169-235`).
- **Files:** `useGameInteraction.js`, `promptComposer.js` (plus `prompts.js` if we
  reinforce "use only named NPCs from context").
- **Effort:** ~half a day. **Risk:** low.
- **Save/back-compat:** none. Pure prompt-shaping; retroactive for every save
  (the milestone data is already in the save's `settings.milestones`).
- **Handles "Jorik/mayor":** partially. The model now *has* Marta's name so it is
  far more likely to use it, but the town's procedural barracks captain (RC5)
  still physically exists in `townMapData.npcs`, so the BuildingModal will still
  show "Commander <random>" — the prose and the town data disagree.
- **Discoverability:** not addressed (Journal still shows bare text).
- **Verdict:** necessary but not sufficient. It reduces invention but leaves the
  data/prose mismatch and the fragile completion.

### Option B — Canonical NPC placement + grounding + journal (recommended core)

Actually place Captain Marta in the Briarwood Militia Hall, reconcile her with
the procedural captain, surface her in the Journal, and clarify the verb.

- **What changes**
  1. **Plumb the npc spawn through spawning.** `spawnWorldMapEntities()` collects
     `spawns.npcs` into a per-town `requiredNpcs` map (mirrors `requiredBuildings`,
     keyed by `building.location`), and returns it
     (`milestoneSpawner.js:86-196`). `NewGame.js` threads it into game
     settings/sub-map inputs alongside `requiredBuildings`
     (`NewGame.js:337, 410-411`), and `useGameMap` passes it to town generation
     (`useGameMap.js:13, 223-229, 258-265, 440-447`).
  2. **Bind the NPC to its building in `populateTown()`.** Add a `requiredNpcs`
     param. In the `barracks` branch (and generically), if a canonical NPC targets
     this building, **replace** the procedural commander with a `generateNPC`
     built from the spawn (`name: 'Captain Marta'`, `role: 'Guard'`, forced title
     "Captain", `personality` stored on the npc, plus a stable
     `milestoneNpcId: 'militia_captain'`). Keep the extra rank-and-file guards.
     This directly resolves RC5 (`npcGenerator.js:514-555, 740-748`).
  3. **Journal grounding.** In the milestone list (`Modals.js:304-385`), for the
     current narrative milestone show a sub-line: "Speak with **Captain Marta**
     (Guard) at the **Briarwood Militia Hall**." Pull from `m.spawn` / `m.building`.
  4. **Objective wording.** Change milestone #2 text to "Meet the militia captain
     at Briarwood" (or "Warn Captain Marta at the Briarwood Militia Hall"). "Meet"
     matches the natural player action and the AI marker fuzzy-match better than
     "warn". This is a `storyTemplates.js` data edit (`:48`).
  5. Includes all of Option A's prompt grounding (the model still narrates and
     still judges completion, but now with the *correct* canonical name that also
     matches what the BuildingModal shows).
- **Files:** `milestoneEngine.js` (optional: expose npc requirements helper),
  `milestoneSpawner.js`, `npcGenerator.js`, `useGameMap.js`, `pages/NewGame.js`,
  `useGameInteraction.js`, `promptComposer.js`, `components/Modals.js`,
  `data/storyTemplates.js`.
- **Effort:** ~2-3 days. **Risk:** medium (touches town-gen and the NewGame
  spawn plumbing).
- **Save/back-compat (important):**
  - Town maps + their `npcs` are generated **lazily and cached** in
    `sub_maps.townMapsCache` (`useGameMap.js:83, 228-229, 264-267`). Per the
    project's "generation changes are going-forward-only" rule, **existing saves
    that already cached Briarwood keep procedural Jorik** — the canonical NPC only
    appears in towns generated *after* the change. This is acceptable and
    consistent with map-gen policy; do **not** regenerate cached towns in place.
  - Milestone data shape: adding `requiredNpcs` plumbing is additive. The npc
    already exists on `m.spawn`, so no milestone schema change is required beyond
    the optional text edit. Renderers must tolerate milestones with no
    `spawn`/`building` (older/other templates) — guard every access.
  - Prompt/journal grounding is retroactive (reads live `settings.milestones`),
    so even old saves get better narration and a better Journal immediately; only
    the *placed NPC* is going-forward-only.
- **Handles "Jorik/mayor":** yes. The barracks now contains the real Marta (new
  towns), the prompt names her, and the Journal names her — data, prose, and UI
  agree. The "mayor" invention is curbed by prompt grounding + a protocol nudge.
- **Discoverability:** solved via the Journal sub-line.
- **Verdict:** the smallest change that makes the feature actually work as
  authored. Completion is still AI-marker-dependent (see Option C).

### Option C — B plus a deterministic completion fallback (most robust)

Everything in B, plus a non-AI path to complete the narrative milestone so it is
never stuck if the model forgets the marker.

- **What changes (on top of B)**
  - Introduce an interaction event, e.g. `{ type: 'npc_talked', npcId }` or
    `{ type: 'building_entered', buildingId }`, and extend `doesEventMatchTrigger`
    + `checkMilestoneCompletion` to honor a narrative milestone that opts in via a
    new optional trigger, e.g. `trigger: { npc: 'militia_captain', action: 'talk' }`
    (`milestoneEngine.js:69-128, 251-265`). Narrative milestones would no longer be
    unconditionally `continue`d if they carry such a trigger.
  - Fire the event when the player interacts with the canonical NPC. Two candidate
    hook points: a "Talk" affordance in `BuildingModal` (which currently only
    *lists* NPCs, no dialogue — `components/BuildingModal.js:142-146`), or on first
    entry into the milestone building. Either calls the existing
    `completeNarrativeMilestone()` (`milestoneEngine.js:136`) via
    `Game.js checkMilestoneEvent` (`pages/Game.js:330-360`).
  - Keep `[COMPLETE_MILESTONE]` as the **richer** path (a genuine roleplay
    resolution still completes it and reads better); the deterministic trigger is
    the **floor** so the quest is always clearable.
- **Files:** all of B, plus `milestoneEngine.js`, `pages/Game.js`, and whichever
  interaction surface fires the event (`components/BuildingModal.js` and/or the
  town-movement path).
- **Effort:** +1-2 days over B. **Risk:** medium-high (changes the meaning of
  `type: 'narrative'` and adds a new event type; needs care that the deterministic
  path and the AI marker don't double-complete/double-reward — dedupe by
  `milestone.completed` guard, already present in `completeNarrativeMilestone`).
- **Save/back-compat:** additive trigger field; milestones without the new trigger
  behave exactly as today (still AI-only). No schema break. Deterministic
  completion works even on old saves (it's engine logic), though the NPC placement
  caveat from B still applies to cached towns.
- **Handles "Jorik/mayor" + discoverability:** same as B, and additionally makes
  completion reliable on weak models.
- **Verdict:** the durable answer, but it opens a design question (below) about
  whether narrative milestones should be partly mechanical.

### Options at a glance

| | A: Prompt only | B: Place + ground + journal | C: B + deterministic completion |
|---|---|---|---|
| Names Marta in prose | Yes | Yes | Yes |
| Marta actually in the barracks | No | Yes (new towns) | Yes (new towns) |
| Reconciles procedural captain (RC5) | No | Yes | Yes |
| Journal shows who/where | No | Yes | Yes |
| "meet" vs "warn" verb | No | Yes | Yes |
| Completion robust w/o AI marker | No | No | Yes |
| Effort | ~0.5d | ~2-3d | ~3-5d |
| Risk | Low | Medium | Med-High |
| Save impact | None | NPC placement forward-only | Same as B |

---

## 4. Recommendation

**Ship a B / C hybrid, phased.** Do **B in full first** (it is the change that
makes the authored quest real and fixes the immersion break the player reported),
then add **C's deterministic fallback as a follow-up** once the shape of the new
`npc`/`talk` trigger is agreed.

Reasoning:

- B alone removes the visible bug: Marta exists, is named consistently across
  town data + prose + Journal, and the procedural-captain duplication (RC5) is
  resolved. That is the maximum immersion win for the effort.
- C is the right *durability* investment (small models drop the marker), but it
  changes the semantics of `type: 'narrative'` and warrants an explicit decision.
  Splitting it out keeps B low-risk and shippable, and lets C be validated on the
  `/debug/milestones` harness before it touches live completion logic.
- Option A is strictly a subset of B; there is no reason to ship A alone since it
  leaves the data/UI mismatch that caused the confusion.

---

## 5. Phased implementation plan

Each phase is independently shippable and testable.

### Phase 1 — Prompt + Journal grounding (subset of A/B, zero save impact)
1. `useGameInteraction.js` (`formatMilestonePromptText`, ~`:65-84`) and
   `promptComposer.js` (`formatCampaignMilestones`, ~`:6-26`): for the active
   narrative milestone, append a "Key NPC / venue" clause built from
   `m.spawn.name/role/personality` + `m.building.name`. Guard for missing fields.
2. `useGameInteraction.js buildLocationContext` (~`:169-235`): when inside the
   milestone's town, add the canonical NPC line even before the NPC is physically
   placed (so old saves benefit).
3. `components/Modals.js` (`:304-385`): render the who/where sub-line for the
   current narrative milestone.
4. Optional `prompts.js` (`DM_PROTOCOL`): one line — "Only use NPC names supplied
   in the context; do not invent named officials."
- **Testable:** unit test the formatter output; eyeball via `/debug/milestones`
  (`CampaignMilestoneTest.js`) and a manual play session; assert prose uses
  "Captain Marta" and does not mention a mayor.

### Phase 2 — Canonical NPC placement + verb fix (the B core; forward-only)
1. `milestoneSpawner.js`: build `requiredNpcs` (keyed by town) from
   `getSpawnRequirements().npcs`; return it (`:86-196`).
2. `pages/NewGame.js`: thread `requiredNpcs` into settings / sub-map inputs next
   to `requiredBuildings` (`:337, 410-411`), and into the pre-generated starting
   town population (`:350-356`).
3. `useGameMap.js`: accept and pass `requiredNpcs` to `populateTown` at all three
   town-generation sites (`:211-229, 255-265, 437-447`).
4. `npcGenerator.js populateTown` (`:514-555, 740-748`): accept `requiredNpcs`; in
   the `barracks` branch (and a generic pre-pass), if a canonical NPC targets this
   building, replace the procedural commander with one built from the spawn
   (forced name/role/title, `personality`, stable `milestoneNpcId`).
5. `data/storyTemplates.js:48`: retune the verb to "Meet the militia captain at
   Briarwood" (maintainer to confirm exact wording; see open questions).
- **Save caveat:** going-forward-only — cached Briarwood in existing saves keeps
  procedural Jorik; new games get Marta. Do not regenerate cached towns.
- **Testable:** unit test `populateTown` with a `requiredNpcs` fixture asserts one
  captain named "Captain Marta" and no duplicate commander; snapshot the spawn
  plumbing; `/debug/milestones` spawn preview.

### Phase 3 — Deterministic narrative completion (Option C; opt-in)
1. `milestoneEngine.js`: define the interaction event (`npc_talked` /
   `building_entered`) and let `type: 'narrative'` milestones with an
   `interaction` trigger be honored by `checkMilestoneCompletion` /
   `doesEventMatchTrigger` (`:69-128, 251-265`); reuse `completeNarrativeMilestone`
   for rewards/dedupe.
2. Interaction surface: add a "Talk / Warn" action to the canonical NPC in
   `BuildingModal` (`components/BuildingModal.js:142-146`) OR fire on entry to the
   milestone building; route through `Game.js checkMilestoneEvent` (`:330-360`).
3. Keep `[COMPLETE_MILESTONE]` as the richer path; ensure the `.completed` guard
   prevents double-reward.
4. `data/storyTemplates.js`: add the opt-in trigger to milestone #2 only (leave
   other narrative milestones AI-only until reviewed).
- **Testable:** engine unit tests for the new event → completion; integration via
  `/debug/milestones` event simulation; verify no double-complete when both the
  marker and the trigger fire.

### Phase 4 (optional) — RAG entity seeding for name persistence
- On session start, seed the RAG index with a canonical-entity note (e.g.
  "Captain Marta is the gruff militia captain at the Briarwood Militia Hall") via
  `embedAndStore` (`ragEngine.js:27`) so later turns recall her consistently even
  after she scrolls out of the recent-context window. Low effort, additive, no
  schema change; nice-to-have after Phases 1-3.

---

## 6. Open questions for the maintainer

1. **Verb:** "Meet", "Warn", or "Warn Captain Marta at the Briarwood Militia
   Hall"? Wording affects both player clarity and AI-marker fuzzy matching
   (`storyTemplates.js:48`, `useGameInteraction.js:455-458`).
2. **Should `type: 'narrative'` be allowed a mechanical trigger at all (Phase 3),
   or do we prefer a new milestone type (e.g. `type: 'talk'`) so narrative stays
   purely AI-judged?** This is the core semantic decision behind Option C.
3. **Replace vs. augment the procedural barracks captain:** replace outright
   (recommended — avoids two captains) or keep procedural guards and only rename
   the commander to Marta?
4. **Completion trigger point for Phase 3:** entering the milestone building, or
   an explicit "Talk" action in `BuildingModal` (which currently has no dialogue
   flow at all)?
5. **Cached-town caveat:** accept forward-only (existing saves keep Jorik), or is
   a one-time migration desired for the `heroic-fantasy-t1` starter campaign
   specifically? (Migration would break the "never regenerate a loaded map" rule
   and is not recommended.)
6. **Generalization:** do we want the npc-placement plumbing (Phase 2) applied to
   *every* template's narrative NPC spawns now, or scoped to `heroic-fantasy-t1`
   first and rolled out per template after review?
