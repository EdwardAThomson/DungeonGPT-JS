# AI Narration Contract: engine referees, LLM narrates

Status: **Phase 1 SHIPPED 2026-07-19 (PR #152):** markers retired, client parsing removed,
both sanitize passes strip leaked markers, NewGame's narrative slot became `talk`, campaign
completion is engine-derived, and legacy saves' narrative milestones migrate on load
(`migrateNarrativeMilestones`). **Phase 2 (exemplar bank, length targets, scripted beats,
renderer-mode model re-eval, dead-helper cleanup) not yet scheduled.**
Backlog row #76 in [OUTSTANDING_ISSUES.md](OUTSTANDING_ISSUES.md). This is a design record;
no source is changed by this doc. When the code and this doc disagree, the code wins.

## The decision

All game outcomes, **including milestone completion**, are decided deterministically by the
engine. The LLM is told what happened and narrates it. LLM-side milestone judgment is
abolished. Maintainer, 2026-07-15:

> having a model misfire on a milestone isn't great; to mitigate we remove LLM judgement
> entirely: LLM for storytelling only.

The player-perceived magic (narration acknowledging an achievement at exactly the right
moment) is fully preserved: the engine completes the milestone, the completion is noted in
the model's context, and the model narrates it with flair, which is already how mechanical
milestones work today. Only the misfire class dies: a model can no longer complete (or fail
to complete) anything.

This is the completion of a split the codebase has been converging on for a year: combat
resolution is deterministic with fully local narration (`encounterResolver.js`, zero LLM
calls); routine movement narration is local and templated
([TIERED_NARRATION_PLAN.md](TIERED_NARRATION_PLAN.md)); reward lines are seeded templates
(`rewardNarrator.js`); the adventure opening became authored text with a tightly-bounded
LLM polish pass (playtest fix, 2026-07-07, `useGameInteraction.js` / `introComposer.js`).
The one place the LLM still referees is narrative/talk milestone completion via the
`[COMPLETE_MILESTONE]` marker. This decision removes that last judgment surface.

## Why now: the model-trial evidence

The 2026-07-15 premium-model trial (`scripts/eval-premium-models.mjs`, 18 live calls per
model against real DM_PROTOCOL prompts mined from `harness-transcripts/`; results recorded
in the private infra repo's cost analysis, transcripts in `temp/model-trial/`, gitignored)
measured milestone discipline directly:

- **Every candidate, including the incumbent, emitted premature milestone markers.** The
  strongest value candidate (DeepSeek V3.2) beat the incumbent (Claude Haiku 4.5) on
  grounding, milestones-hit, format, and speed at roughly a ninth of the cost, and its
  *only* blemish was 4 premature `[COMPLETE_MILESTONE]` markers.
- The incumbent itself scored 1 premature marker (and the run's only place-as-person
  error), so this is not a "cheap models misfire" problem; it is a "judgment via
  free-text marker is inherently flaky" problem. No prompt-guard iteration fixes the
  class; removing the judgment does.
- GLM 5.2 posted the run's best grounding (99%) but was verbose enough that its per-call
  cost landed at Haiku parity purely from output length, which motivates the explicit
  length targets in the prompt rewrite below.

Consequence for model selection: under this contract a model's milestone-marker
discipline stops mattering entirely, so V3.2's one blemish becomes irrelevant. A
renderer-mode re-evaluation (`scripts/eval-premium-models.mjs --mode=renderer`, being
built in parallel) will produce the decision data; the model verdict is still pending the
maintainer's narrative-quality read of the transcripts.

## The determinism ladder

Uniqueness lives in the prose, not in who referees. The game's purpose (unique narration
every playthrough) survives at every rung:

1. **Scripted (hand-authored) text** for structural, high-stakes beats: adventure
   openings, quest/campaign completions, deaths. First impressions and emotional peaks are
   where flaky text costs most. Key insight: most players may only play once; a player who
   never replays gets zero value from a generated opening, only risk. The opening already
   moved here (authored `composeIntro` + bounded polish); drafted messages for the other
   key moments extend the same pattern.
2. **Engine-decided, LLM-narrated** for the core loop. The player presses the button, the
   action resolves in code (deterministic), and the LLM response is unique every time.
   This is the rung this decision moves milestone completion onto.
3. **Fully generative** only where variety is the whole point: look-around prose,
   free-text player actions, NPC color.

## Current behavior → target behavior

Today's prompt contract is `DM_PROTOCOL` in `src/data/prompts.js`, prepended to every AI
prompt by `generateResponse()` (`useGameInteraction.js`). What changes:

| Surface | Today | Target (renderer contract) |
|---|---|---|
| Narrative milestones | AI judges completion and emits `[COMPLETE_MILESTONE: text]`; parsed by `MILESTONE_COMPLETE_REGEX`, guarded to narrative/legacy-untyped via `findMarkerMilestoneIndex` | No LLM judgment. Milestones complete only through engine events. The marker instruction leaves the prompt; the parsing path is removed |
| Talk milestones | Dual completion: engine Talk button (`npc_talked`) OR the AI marker via the fail-closed `resolveTalkMarkerMilestone`, plus a long SHOULD/MUST-NOT instruction block in DM_PROTOCOL | Engine Talk button only. The dual-completion path and its protocol block are removed |
| Campaign completion | AI judges and emits `[COMPLETE_CAMPAIGN]` (`CAMPAIGN_COMPLETE_REGEX`) | Engine-derived (all milestones complete is already computed by `getCampaignProgress`); exact rule to confirm per template, see open questions |
| Mechanical milestones (item/combat/location) | Engine-detected; completion noted in context; model told to narrate with flair, never mark | Unchanged; becomes the universal model for ALL milestones |
| Marker hygiene | `sanitizeResponse` (both `cf-worker/src/services/ai.ts`, shared with the premium pool, and `src/services/llmService.js`) strips leaked prompt markers (`[STRICT DUNGEON MASTER PROTOCOL]`, `[TASK]`, ...) but passes completion markers through because the client consumes them | Server strips any `[COMPLETE_MILESTONE...]` / `[COMPLETE_CAMPAIGN]` a model emits anyway (defense in depth; models trained on old transcripts or few-shot exemplars may still produce them) |
| Turn prompt | DM_PROTOCOL rule 8: model must ALWAYS conclude by asking "What do you do?" or presenting options | Appended in code where the narration message is assembled, never requested from the model; stripped from model output if emitted |
| Prompt style | Zero-shot rule list (9 numbered rules + NAMES + MILESTONE TRACKING + CAMPAIGN COMPLETION blocks) | Few-shot: worked exemplars of good turns with explicit length targets, to chisel output length and format (the GLM 5.2 verbosity lesson). Removing the judgment blocks pays for the exemplar tokens |
| High-stakes beats | Opening: authored + bounded polish (shipped 2026-07-07). Campaign completion: templated system line, but surrounding narration generative. Deaths: local combat narration + `FEATURE_HERO_RECOVERY.md` flow | Hand-authored messages for adventure openings (done) and the other emotional peaks: quest/campaign completion beats, death/defeat beats |

## Work items

Direction is decided; none of this is scheduled. Sequencing is roughly as listed since
each item reduces risk for the next.

1. **DM_PROTOCOL rewrite** (`src/data/prompts.js`): remove the MILESTONE TRACKING and
   CAMPAIGN COMPLETION blocks and rule 8; reframe the model's job as narrating
   engine-reported events; move to few-shot with explicit length targets. The
   `harness-transcripts/` corpus (already mined by the eval harness) is the natural
   source of exemplar candidates.
2. **Server-side marker stripping**: add the completion-marker patterns to
   `sanitizeResponse` in `cf-worker/src/services/ai.ts` (the premium pool reuses the same
   exported pass) and mirror in `src/services/llmService.js` for the local dev path.
3. **Remove client marker parsing** (`useGameInteraction.js`): `MILESTONE_COMPLETE_REGEX`,
   `CAMPAIGN_COMPLETE_REGEX`, the `resolveTalkMarkerMilestone` dual-completion branch;
   retire `findMarkerMilestoneIndex` and the narrative-marker helpers in
   `milestoneEngine.js` once nothing depends on them (legacy-save policy first, see open
   questions).
4. **Code-appended turn prompt**: append "What do you do?" (or an options affordance)
   where the narration message is assembled, and strip a model-emitted duplicate.
5. **Deterministic replacements for the remaining `type: 'narrative'` producers.** The
   built-in `storyTemplates.js` campaigns no longer author narrative milestones (all
   converted to `talk`/mechanical during the NPC-grounding work), but the custom-game
   builder still does: NewGame's slot-2 "Speak with the {role} at {town}" milestone is
   `type: 'narrative'` with `trigger: null` (`src/pages/NewGame.js`), completable only by
   the marker. Convert it to `type: 'talk'` (the engine path, Talk button and spawned NPC
   included, already exists). Audit server-delivered premium templates for narrative
   types before their next authoring pass.
6. **Engine-derived campaign completion** replacing `[COMPLETE_CAMPAIGN]`.
7. **Scripted-beat authoring list**: drafted messages for the opening of a new adventure
   (shipped as `composeIntro`) and the other key moments: quest completion, campaign
   completion, hero death/party defeat. Which beats first is an open question below.
8. **Few-shot exemplar bank** with length targets; validate against the renderer-mode
   eval before shipping.
9. **Renderer-mode model re-evaluation** (`--mode=renderer`, in progress in parallel) to
   settle the premium default-model question under the new contract.

## What this does NOT change

- Combat narration stays fully local and templated (confirmed intentional, see
  OUTSTANDING_ISSUES combat notes); this decision extends that philosophy, it does not
  revisit it.
- The tiered narration routing (local templated movement lines, AI on look-around and
  free-text) is untouched.
- Engine reward paths, the hero ledger, celebration system lines, and save formats are
  untouched: the marker was only ever a *trigger*, and the triggers that remain are all
  engine events already.
- Guests (no AI) see no difference; they already live entirely on the deterministic rungs.

## Future: NPC direct-talk uses bounded judgment

A direct-talk NPC feature (free conversation with an NPC, e.g. persuasion) does not exist
yet. When it arrives it uses the same referee/narrator split one level deeper: the
**engine rolls the persuasion outcome** (or runs a tiny, constrained classification), and
the LLM **roleplays the NPC's response given that outcome**. The LLM never decides whether
the persuasion succeeded; it performs the success or the failure it is handed. Any future
design for quest-giver conversations ([FEATURE_QUEST_GIVERS.md](FEATURE_QUEST_GIVERS.md))
should inherit this constraint.

## Open questions

1. **Which beats get scripted first?** Candidate order: campaign completion (highest
   emotional peak, currently a bare templated line), then death/party defeat (interacts
   with [FEATURE_HERO_RECOVERY.md](FEATURE_HERO_RECOVERY.md)), then per-quest completion
   beats. Not decided.
2. **Exact length target for the few-shot contract.** The trial's typical-generation
   assumption is ~600 output tokens; the right narrative target (and whether it differs
   per moment type, e.g. look-around vs milestone celebration) should come from the
   maintainer's transcript read plus the renderer-mode eval.
3. **Does talk-milestone narration need special casing?** Today the Talk button fires the
   completion and a meeting beat follows (one AI narration signed-in, `composeNpcMeeting`
   for guests). But a player can also *type* a conversation at the milestone NPC; with
   the marker gone, the model may narrate a conversation that reads as fulfilling the
   objective while the engine still waits for the button. Options include leaning on the
   existing button-first UX, or narration that gently steers to the affordance. Unresolved.
4. **Legacy saves carrying `type: 'narrative'` milestones.** Old saves' narrative
   milestones complete only via the marker today. Removing the marker path strands them
   unless we (a) keep a legacy-only parser for old saves, (b) migrate narrative-typed
   rows to `talk`/`location` on load (the load-time normalization + invariants machinery
   exists), or (c) accept Talk-button-style fallbacks. Needs a decision before work item
   3 lands.
5. **`[CHECK/ROLL]` triggers.** `TRIGGER_REGEX` lets the model request a skill check
   (`setCheckRequest`). That is a smaller LLM-judgment surface (it proposes, the engine
   still rolls), close in spirit to the bounded-judgment pattern. In or out of scope for
   this pass: undecided. *Update 2026-07-16: [SKILL_CHECK_PLAN.md](SKILL_CHECK_PLAN.md)
   (#83) proposes the answer: the trigger stays as a bounded proposal marker and is
   upgraded into a full engine-rolled check loop; its Phase 1 rides this contract's
   DM_PROTOCOL rewrite.*
6. **Campaign-completion derivation.** Confirm all-milestones-complete matches every
   template's `campaignGoal` semantics, including chained campaigns
   (`campaignChain.js`) and server-delivered flagships, before deleting the marker.

## Related docs

- [CAMPAIGN_MILESTONE_SYSTEM.md](CAMPAIGN_MILESTONE_SYSTEM.md): the milestone engine.
  Its "Narrative Milestones (Guided Flexibility)" section (marker system retained as the
  lower-priority path) is superseded by this decision.
- [MILESTONE_NPC_GROUNDING_PLAN.md](MILESTONE_NPC_GROUNDING_PLAN.md): created the `talk`
  type and the Talk button. Its later talk-marker dual-completion addendum
  (`resolveTalkMarkerMilestone`) is superseded by this decision; the button becomes the
  only path.
- [TIERED_NARRATION_PLAN.md](TIERED_NARRATION_PLAN.md): the cost/quality routing this
  ladder generalizes.
- [CF_WORKER_GUIDE.md](CF_WORKER_GUIDE.md): AI pools, `sanitizeResponse`, model registry,
  and the eval/test harnesses this touches.
