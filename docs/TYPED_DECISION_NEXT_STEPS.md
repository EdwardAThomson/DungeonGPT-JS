# Typed Decisions: Next Steps Checklist

Status: open, 2026-09-30
Context: [AI_DM_DESIGN_DIRECTION.md](AI_DM_DESIGN_DIRECTION.md) (the why),
[TYPED_DECISION_EVAL_PLAN.md](TYPED_DECISION_EVAL_PLAN.md),
[TYPED_DECISION_EVAL_RESULTS.md](TYPED_DECISION_EVAL_RESULTS.md)

The pilot showed that once a player's intent is known, code decides rolls more reliably than
any model tested (96% on the roll decision with perfect reading, against 79-83% for models
and today's narrator). The open question is how intent reaches the engine: buttons, free
text read by a model, or both. Most items below depend on that decision.

## Needed whichever way we go

- [ ] **Decide the input design.** Options: (a) button-only mechanics, free text narrated
      only; (b) buttons plus free text that *suggests* a button the player confirms;
      (c) buttons plus free text that can trigger checks directly ("two routes to the same
      answer"); (d) free text read by an adjudicator. Blocks most items below.
- [ ] **Review `src/pages/EnginePage.js` claims.** Step 1 ("the game reads your intent and the
      relevant skill"), step 2 ("a difficulty the encounter set") and "the model's whole job
      is prose" overclaim for free-text checks today: the narrator proposes the skill and
      tier via `[CHECK:]`. Either change the copy or change the behaviour.
- [ ] **Decide the quest-item roll policy:** searching where the story put a quest item is
      no roll, or a `trivial` roll that auto-passes (plan §6.1 rule 4).
- [ ] **Commit the open eval work:** prompt v3 (roll questions asked for `talk_to_npc`), the
      corrected results doc and index line, `roll-rules.mjs` and `rules-eval.mjs`.

## If free text keeps a role in mechanics (options b, c, d)

- [ ] Label Q4-Q6 for the 12 hand-written `talk_to_npc` turns:
      `node scripts/adjudication/label-turns.mjs --only a-020,a-021,a-022,a-023,a-024,a-025,a-026,a-027,a-029,a-031,a-055,a-060`
      (while there: `a-031`, the unnamed fisherman, is arguably `action`, not `talk_to_npc`).
- [ ] Spot-check 10 harness auto-labels: `node scripts/adjudication/label-turns.mjs --spot-check 10`.
- [ ] Second labelling pass for the agreement ceiling: `node scripts/adjudication/label-turns.mjs --pass2`.
- [ ] Collect 20-30 fresh turns nobody has tuned against (hand-written by the maintainer, or
      generated blind and then labelled) for a fair test of who reads free text: keyword
      rules, a small fast model, or a strong model.
- [ ] Fix the two known rule bugs ("climbs" does not match `climb`; "I ask around" hits the
      Insight rule first), checked against the fresh turns, not the pilot set.
- [ ] Optional: test Claude Opus 5.5 / Sonnet 5 / Haiku 4.5 on the roll questions only
      (about $1-2 via OpenRouter), including latency.
- [ ] If (c): make both routes resolve through one rulebook (see below) and share the
      failed-check lock ledger, so typing cannot retry what a button already failed.

## If button-only (option a)

- [ ] Design the button set per scene type (town, NPC present, site, wilderness), each with
      its skill and difficulty rule. `scripts/adjudication/roll-rules.mjs` is a first draft of
      that rule table; the encounter system already works this way.
- [ ] Decide what typed free text still does: narration only, or removed.

## Loose ends

- [ ] `@cf/meta/llama-3.1-8b-instruct-fast` is unlisted in the Workers AI catalog but still in
      `cf-worker/src/services/models.ts`; plan a replacement before it is retired (its listed
      `-fp8` sibling is ~7x slower).
- [ ] Workers AI eval runs share production's daily free allowance; run future evals on
      OpenRouter or a paid Workers plan.

## Design principle, whichever option wins

One rulebook, several doors. A button, a confirmed suggestion and (if allowed) a typed check
should all produce the same action object and go through the same rule, so the same intent
always yields the same check, difficulty and lock, however the player expressed it.
