# AI Quest & Campaign Generation Plan

Status: **Proposed** (design note, 2026-07-16). No code beyond the existing Freeform
generator. Tracks `OUTSTANDING_ISSUES.md` #77. Tightly coupled to #76
([AI_NARRATION_CONTRACT.md](AI_NARRATION_CONTRACT.md)): both rest on the same rule,
**the engine referees, the LLM only writes words.**

---

## 1. Goal

Lean harder into AI as a *content author* for campaigns and quests, while keeping every
*mechanic* engine-refereed and deterministic. The product target is "ready-made quests
where most of the content is pre-written": the AI fills authored, validated slots with
prose and flavor, it never invents the mechanics that decide completion, rewards, or
combat.

Two surfaces:

- **A. New Game campaign authoring** (exists today in weak form): generate a full,
  playable campaign from a theme/prompt before the game starts. Members+ only.
- **B. Dynamic in-world quest generation** (new): generate side quests (and eventually
  quest chains) at runtime inside a live world, still emitting engine-typed milestones.

Non-goal: AI deciding outcomes. Milestone completion, loot, DCs, and damage stay in the
engine, per #76.

---

## 2. Current state (what exists, and the gap)

`src/pages/NewGame.js` → `handleAiGenerateStory()` (Freeform tab only; **not** the Custom
tab). One **zero-shot** prompt returns JSON:

```
shortDescription, campaignGoal,
milestones: [{ text, location }]   // 3 of them, UNTYPED
grimnessLevel, darknessLevel, magicLevel, technologyLevel, responseVerbosity,
customNames: { towns: [...], mountains: [...] }
```

Gating (as of 2026-07-16): the "Generate with AI" button is **Members+** (`aiGenLocked =
!user || !premiumUnlocked`, greyed out with a "🔒 Members feature" prompt otherwise; the
handler also fails closed). It was previously gated only on sign-in.

**The gap that makes this feel unfinished:** the generated milestones are untyped
`{ text, location }` objects. Authored campaigns in `src/data/storyTemplates.js` carry a
much richer, deterministic shape (see §3), so AI milestones cannot complete the way
authored ones do: no engine trigger, no placed NPC, no quest item, no boss profile, no
POI art. In practice the Freeform world reads as flavor text with no mechanical spine,
and it has not been exercised recently (needs a re-test regardless of this work).

---

## 3. The deterministic target shape (what AI output must become)

Every generated milestone has to land on the authored data model. Reference milestone
(`heroic-fantasy-t1`, milestone 4):

```js
{
  id: 4,
  text: 'Defeat the Goblin Chieftain',
  location: 'Greenridge Hills',          // must be a real town/POI/mountain name on the map
  type: 'combat',                        // item | combat | talk | location | narrative
  requires: [3],                         // gates POI reveal + Talk/boss affordances
  trigger: { enemy: 'goblin_chieftain', action: 'defeat' },
  spawn: { type: 'enemy', id: 'goblin_chieftain', name: '...', location: 'Greenridge Hills' },
  building: null,                        // { type, name, location } for item/talk venues
  encounter: { /* boss block: encounterTier, enemyHP, dealsDamage, damage{}, DCs,
                  suggestedActions, consequences, rewards */ },
  rewards: { xp, gold: '2d10', items: [] },
  minLevel: null
}
```

Milestone types and how each completes (engine-deterministic, from `milestoneEngine.js`):

| type | completes when | needs |
|---|---|---|
| `item` | `event.itemId === trigger.item` (no location scope) | **unique** quest-item id, NOT in any loot table (`src/data/encounters/*.js`); `spawn.location` on the map |
| `talk` | `npc_talked` event on `trigger.npc` | authored `spawn` NPC (name/role/gender/personality) placed in a `building` |
| `location` | party visits `trigger.location` | a `poi` spawn + POI art (`worldTileArt.js` sprite + `POI_IMAGES` in `worldMoveController.js`) |
| `combat` | `trigger.enemy` defeated | full `encounter` block with an explicit `dealsDamage`/`damage` profile |
| `narrative` | AI marker today (**being removed by #76** → engine-derived) | avoid for generated content; prefer mechanical types |

The **story-template authoring invariants** (CLAUDE.md) apply identically to generated
content, and they fail *silently* at runtime:

1. Quest-item ids unique and absent from every loot table.
2. Every `poi` id has a sprite + `POI_IMAGES` entry, or explicitly accepts generic art.
3. `requires: []` makes a milestone co-active from turn 1 (confirm intent).
4. Every milestone `location` must resolve to a settlement/POI the map generator will
   actually place (`customNames` injection; `findMissingMilestoneLocations` is the
   existing validator, see #74).

This is why generation cannot be free-form: the output space is a narrow, typed schema
with cross-references that must all resolve.

---

## 4. Design principles

1. **Engine referees, AI narrates/authors.** AI produces text and picks among
   *enumerated* structural choices; the engine owns triggers, rewards, DCs, damage,
   completion. Same contract as #76.
2. **Scaffold structure deterministically, let AI fill slots.** Do not ask the model for
   raw milestone JSON. Generate (or constrain) the structural skeleton in code, then have
   the AI write only the prose and pick from validated option sets (which town, which
   venue type, which boss archetype).
3. **No zero-shot.** Multi-step pipeline with few-shot exemplars and a repair loop (§5).
4. **Validate like a human author would.** Run every generated campaign through the same
   content-integrity gate as hand-authored templates (`npm run audit` /
   `scripts/content-audit.mjs`, plus the `campaign-author` skill's checks) before it is
   ever playable. Reject or auto-repair on failure; never ship a silent break.
5. **Reuse, don't reinvent.** Draw quest items from `ITEM_CATALOG`, enemies from
   `QUEST_ENEMIES`/encounter tables, venues from real building types, boss profiles from
   the sim-tuned bands. Generation is mostly *selection + naming + prose*, not invention
   of new mechanical entities.

---

## 5. Prompt architecture (multi-step, not zero-shot)

A staged pipeline. Each stage has a tight JSON schema and few-shot exemplars drawn from
the real `storyTemplates.js` campaigns. Stages can run as separate LLM calls (better
grounding, cheaper repair) or as one guided call with intermediate reasoning; separate
calls are preferred for validatability.

1. **Premise.** Theme + tone dials → `shortDescription`, `campaignGoal`, `customNames`
   (towns/mountains). (This is roughly today's output, kept.)
2. **Beat outline.** Premise → an ordered list of 3-5 beats, each tagged with an
   *intended* milestone `type` and a target settlement from `customNames`. Model chooses
   from the enumerated type set only.
3. **Structural binding (mostly code).** For each beat, the scaffolder in code:
   - assigns a fresh **unique** quest-item id (checked against loot tables + prior beats)
     for `item` beats,
   - picks a venue `building.type` from the real building set for `item`/`talk`,
   - selects an enemy + boss profile from the tuned bands for `combat` (AI picks a
     *name/skin*, code picks the numbers),
   - assigns a `poi` id with existing art (or flags generic) for `location`,
   - sets `requires` as a linear chain by default (parallel only on explicit intent).
4. **Prose fill.** AI writes `text`, NPC `personality`, `encounter.consequences`,
   `suggestedActions`, reward flavor, grounded in the bound structure. Names only, no new
   mechanics.
5. **Validate + repair.** Run the content audit over the assembled template. On failure,
   feed the specific violations back for a bounded repair pass (e.g. "item id X collides
   with loot table Y, choose another"). Cap retries; fall back to a safe templated
   campaign if it will not converge.

Prompt hygiene: strict JSON schema per stage, exemplars from shipped campaigns, explicit
"do not invent ids / mechanics / numbers" instruction, temperature high on prose stages
and low/zero on structural ones.

---

## 6. Mode B: dynamic in-world quests

Extends the pattern to runtime side-quest generation (relates to `FEATURE_QUEST_GIVERS.md`
and the existing discoverable side-quest pool, `questEngine.js`/`questPickerData.js`).

- The engine scaffolds a side-quest of a known kind (fetch / clear / talk / escort) with
  real ids, venues, and reward bands, exactly as the current pool does.
- The AI writes only the quest's prose (giver line, objective description, turn-in text),
  bound to the already-decided structure.
- Same validation gate applies before the quest is offered.
- Cost control: generate lazily and cache into the save; do not regenerate on load.

This keeps `pickOfferableSideQuest`'s guardrails and the deterministic completion path
intact while making the *writing* feel bespoke to the world.

---

## 7. Entitlements, cost & safety

- **Gating:** Mode A generation is Members+ (shipped for the Freeform button 2026-07-16).
  Mode B generation, if it calls the premium pool, gates the same way and respects the
  daily premium allowance (#7) and rate limits (#12).
- **Cost:** multi-step generation is several LLM calls; run on the premium pool
  (`pool: 'premium'`) with free-pool fallback, cache aggressively into the save.
- **Safety:** the content audit is the hard gate. A generated campaign that fails
  validation is never playable; it is repaired or discarded, so a bad generation can
  never soft-lock a run the way a silent authoring bug would.

---

## 8. Phasing

- **Phase 0 (done 2026-07-16):** Members+ gate on the existing Freeform button.
- **Phase 1:** Re-test and harden the current single-shot generator; add JSON-schema
  validation + the control-char repair already present; surface honest errors.
- **Phase 2:** Split into the staged pipeline (§5) and emit **typed** milestones with
  real quest-item ids, placed NPCs, and POI art. Wire the content audit as the gate.
- **Phase 3:** Combat beats select from the sim-tuned boss bands; rewards drawn from
  `ITEM_CATALOG`. Generated campaigns become mechanically first-class.
- **Phase 4:** Mode B dynamic in-world side quests (§6).
- **Phase 5:** Optional, generated campaigns registered like premium templates so they
  chain (`campaignChain.js`) and appear on the tiered picker.

---

## 9. Open questions

- Reconcile with #76: once narrative milestones are engine-derived, generated content
  should avoid `type: 'narrative'` entirely and lean on mechanical types.
- Legacy Freeform saves carrying untyped milestones: heal on load, or leave as-is?
- How much structure to let the model choose vs pin in code (the more code-pinned, the
  more reliable but less varied).
- Do generated campaigns need art (bespoke boss/POI images), or do they ride the generic
  fallbacks until curated? (Invariant 2 forces an explicit decision per POI.)
- Where the audit runs for Mode B: pre-offer per quest, at acceptable latency.
