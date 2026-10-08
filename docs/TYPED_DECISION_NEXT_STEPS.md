# Typed Decisions: Next Steps Checklist

Status: open; revised 2026-10-08 after the #84/#91 workspace work (first version 2026-09-30)
Context: [AI_DM_DESIGN_DIRECTION.md](AI_DM_DESIGN_DIRECTION.md) (the why),
[SUGGESTED_ACTIONS_PLAN.md](SUGGESTED_ACTIONS_PLAN.md) (what is built),
[TYPED_DECISION_EVAL_PLAN.md](TYPED_DECISION_EVAL_PLAN.md),
[TYPED_DECISION_EVAL_RESULTS.md](TYPED_DECISION_EVAL_RESULTS.md)

## Where things stand

The pilot showed that once a player's intent is known, code decides rolls more reliably than
any model tested (96% on the roll decision with perfect reading, against 79-83% for models
and today's narrator).

Since then the workspace (#84) shipped **engine-derived suggested-action chips** (#91): travel,
enter, talk to the objective NPC, search / confront / gather on objective tiles, rest, leave,
explore and levelling hunts, from fixed rules over game state with no model call. Encounter
hooks already offer chips that carry their skill. So the original "buttons or free text?"
question is largely settled for progression: buttons guarantee it.

**What is still open is narrow: skill checks outside encounters** (persuading an NPC,
sneaking past a guard, searching for something that is not an objective). No chip covers
them, so they still run through typed text and the narrator's `[CHECK: skill, tier]`, the
one place a model still makes a ruling.

## The open decision

- [ ] **How skill checks outside encounters reach the engine.** Options:
      (a) add engine chips for them ("Persuade Warden Sigrun" when she is present, "Sneak
      past" when a guard blocks the way), each with a code-defined skill and difficulty, as
      encounter chips do; typed text narrates only;
      (b) typed text is matched to one of the scene's actions (engine chips plus candidate
      skill actions) and the player confirms; the matched action's code rule decides the
      check (see the chip-matching experiment below);
      (c) keep today's narrator `[CHECK:]` for typed text;
      (a) and (b) combine naturally: chips for the common cases, matching for improvisation.
- [ ] **Phase 2 AI chips (SUGGESTED_ACTIONS_PLAN.md):** as planned, a model-proposed chip is
      sent as a typed action, so the narrator still rules on any check. Consider mapping a
      model chip that matches an engine action ("Persuade Sigrun") to that engine action, so
      it goes through the same code rule (one rulebook).

## Needed whichever way we go

- [ ] **Review `src/pages/EnginePage.js` copy.** Still says "the game reads your intent and the
      relevant skill"; with "a difficulty the encounter set" and "the model's whole job is
      prose", that overclaims for typed checks, where the narrator proposes skill and tier.
      True for chips and encounters; either scope the copy or close the gap.
- [ ] **Decide the quest-item roll policy:** searching where the story put a quest item is no
      roll, or a `trivial` roll that auto-passes (plan §6.1 rule 4). The objective
      Search chip already resolves without a free-text roll.

## Experiment: chip matching (Jev-like, closed choice)

The pilot asked open questions about a turn. The workspace makes a narrower, better-posed
question available: **"which of this scene's actions, if any, does the player's text mean?"**,
where the options are the engine's own chips plus a few candidate skill actions and
"none (just roleplay)". This is exactly the typed-question shape Jev and OpenAI's Decisions
API are built for, and errors are cheap if the player confirms the match.

- [ ] Build ~10 scenes with their engine chip lists (from `getSuggestedActions` on real game
      state where possible) plus candidate skill actions, and ~30-40 typed turns written
      without looking at the matcher; label the intended action or "none".
- [ ] Compare: keyword matching, small fast models (llama-3.1-8b, gemma-4-26b), gpt-6-luna,
      and a logprob readout where available. Measure accuracy, **"none" precision** (a
      matcher must not hijack plain roleplay into a mechanic), and latency.
- [ ] Decide from it whether option (b) needs a model at all, and how small it can be.

## Labelling left from the pilot (only if typed checks stay, options b or c)

- [ ] Q4-Q6 for the 12 hand-written `talk_to_npc` turns:
      `node scripts/adjudication/label-turns.mjs --only a-020,a-021,a-022,a-023,a-024,a-025,a-026,a-027,a-029,a-031,a-055,a-060`
      (`a-031`, the unnamed fisherman, is arguably `action`).
- [ ] Spot-check 10 harness auto-labels: `node scripts/adjudication/label-turns.mjs --spot-check 10`.
- [ ] Second pass for the agreement ceiling: `node scripts/adjudication/label-turns.mjs --pass2`.
- [ ] Fix the two known rule bugs ("climbs" vs `climb`; "I ask around" hits Insight first),
      checked against fresh turns, not the pilot set.
- [ ] Optional: Claude Opus 5.5 / Sonnet 5 / Haiku 4.5 on the roll questions only (~$1-2).

## Loose ends

- [ ] `@cf/meta/llama-3.1-8b-instruct-fast` is unlisted in the Workers AI catalog but still in
      `cf-worker/src/services/models.ts`; plan a replacement (its `-fp8` sibling is ~7x slower).
- [ ] Eval runs on Workers AI share production's daily allowance (allocation exhaustion is
      now handled in code, `9634717`); run evals on OpenRouter or a paid plan.

## Design principle

One rulebook, several doors. A chip, a confirmed match and (if allowed) a typed check all
produce the same action object and go through the same code rule, so the same intent always
yields the same check, difficulty and lock, however the player expressed it.

## Done

- [x] Input design for progression: engine chips (#91), 2026-10-03 onwards.
- [x] Eval work committed (prompt v3, corrected results, roll rules), `2effef5`.
