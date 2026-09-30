# Typed Decision Eval: Pilot Results

Status: pilot, 2026-09-30
Plan: [TYPED_DECISION_EVAL_PLAN.md](TYPED_DECISION_EVAL_PLAN.md)
Tooling: `scripts/adjudication/` (raw rows and per-run summaries are local-only under the
gitignored `harness-transcripts/eval/`; this page holds aggregates only)

## What was tested

A separate "adjudicator" call answers seven typed questions about each player turn (Q1
message type, Q2 action category, Q3 target, Q4 roll needed, Q5 skill, Q6 difficulty, Q7
impossible given the scene), choosing from fixed option lists and replying in JSON. Answers
were scored against human labels.

- **Turns:** 148 labelled pilot turns. 60 are hand-written to be awkward (out-of-character
  questions, typing at an absent NPC, impossible actions, ambiguous references, terse
  input), labelled by the maintainer, 28 of them with Claude-suggested answers accepted or
  overridden (2 overridden). 88 are scripted quest-harness turns, auto-labelled from their
  pattern and **not yet spot-checked**. The hand-written 60 are the meaningful set.
- **Prompt:** v1 for pilot-1; v2 for pilot-2 adds a precedence rule (a message addressed to
  a named NPC is `talk_to_npc` even when it is also an acceptance or includes a move) and
  worked `unclear` examples written fresh, not taken from the fixtures.
- **Order check:** pilot-2 also ran every option list reversed; "order consistency" is the
  share of turns whose Q1 answer did not change.
- **Baseline:** today's narrator (`gpt-oss-120b`, the real `DM_PROTOCOL` prompt, production
  sampling) on the 60 hand-written turns, with `[CHECK:]` parsed by the game's own
  `parseCheckMarker`. Only skill-check decisions are comparable: the narrator does not
  classify messages.

## Pilot-2 (OpenRouter, prompt v2), the main result

| Model | Q1 all | Q1 balanced | Q1 hand-written | `unclear` recall | `talk_to_npc` recall | Q7 | Order consistency | p50 / p95 latency | $ / turn |
|---|---|---|---|---|---|---|---|---|---|
| gpt-6-luna (OpenAI) | **97%** | **96%** | **95%** | 80% | **98%** | **93%** | 97% | 3.1 s / 5.4 s | 0.00018 |
| gemma-4-26b (Cloudflare) | 91% | 85% | 90% | 80% | 79% | 84% | 97% | 1.8 s / 2.4 s | 0.00020 |
| gpt-oss-20b (CoreWeave) | 81% | 71% | 83% | 20% | 52% | 89% | 83% | 1.4 s / 2.5 s | 0.00007 |
| glm-4.7-flash (Cloudflare) | 90% | 73% | 80% | 0% | 88% | 66% | 89% | 1.6 s / 6.6 s | 0.00013 |
| llama-3.1-8b (CoreWeave) | 78% | 69% | 75% | 0% | 52% | 86% | 84% | 0.8 s / 1.0 s | 0.00040 |

Q1 balanced is mean per-class recall (the classes are very imbalanced). Hosts are pinned per
model; "Cloudflare" is Workers AI resold through OpenRouter, so those rows match production
inference. GPT-6 Luna ran as a plain chat model, not through OpenAI's Decisions API.

## Skill checks vs today's narrator (same 24 action turns, 11 with a labelled roll)

| | Q4 roll needed | Q5 skill | Q6 within one tier | Rolls proposed on non-action turns |
|---|---|---|---|---|
| Today's narrator (gpt-oss-120b) | **83%** | 73% | 91% | 6 of 36 |
| gpt-6-luna | 79% | 73% | 88% | **0** |
| gpt-oss-20b | 79% | 45% | 88% | 0 |
| gemma-4-26b | 67% | 73% | 100% | 2 |

## Pilot-1 (Workers AI, prompt v1), for reference

Q1 on the hand-written turns: gemma-4-26b 88%, glm-4.7-flash 83%, gpt-oss-20b 78%,
llama-3.1-8b-fast 73%, llama-3.2-3b 52%, granite-4.0-h-micro 40%. `unclear` recall was 0-40%
for every model. Prompt v2 raised gemma's `unclear` recall from 40% to 80% and its
`talk_to_npc` recall from 55% to 79%; the other models barely moved.

## Findings

1. **Classifying player messages works with a strong model.** GPT-6 Luna reaches 95-97% on
   Q1, handles the awkward categories (`unclear`, `talk_to_npc`, out-of-character), and is
   insensitive to option order. gemma-4-26b is a faster second at 90%. Today's game does no
   classification at all, so this is new capability rather than an improvement on something.
2. **Skill checks: no accuracy gain over the narrator.** The narrator is slightly better at
   deciding when to roll (83% vs 79%). What the adjudicator adds is discipline: the
   narrator proposed rolls on 6 of 36 non-action turns (e.g. an out-of-character question),
   Luna on none.
3. **Q4 scores are depressed by a labelling policy, not only by models.** Most "extra" roll
   calls are on auto-labelled harness item searches, labelled "no roll" because the engine
   grants quest items; the models call them Investigation checks. Open decision: keep "no
   roll", or allow a `trivial` roll that auto-passes (plan §6.1 rule 4).
4. **Model confidence is not usable as-is.** gemma assigns ~99% to nearly every answer;
   Luna exposes no logprobs on OpenRouter. The ask-instead-of-guess behaviour currently has
   to come from the explicit `unclear` answer, which works for Luna and gemma under v2.
5. **Latency is the constraint.** Only llama-3.1-8b meets the 1.5 s target, and it is the
   weakest viable model. Luna (3.1 s median) would need to run in parallel with narration,
   or only on some turns.
6. **Small models are out:** granite and llama-3.2-3b, and llama/GLM lose accuracy when the
   options are reordered.

## Cost

Adjudication is negligible at any scale tested: $0.07-0.40 per 1,000 turns. The whole pilot
cost about $0.30 on OpenRouter plus roughly $0.20 at list price on Workers AI. Note that the
Workers AI runs exhausted the account's Free-plan daily allowance (10,000 neurons), which
production shares; later runs moved to OpenRouter for that reason.

## Limits of this pilot

- 60 meaningful turns; one turn moves a hand-written score by ~1.7 points.
- Harness labels are unverified auto-labels; no second-pass (`--pass2`) agreement yet.
- Many hand-written labels began as Claude suggestions (anchoring risk).
- Skill-check comparisons rest on 24 turns (11 with a roll).
- The narrator baseline is the free-pool model only; the member pool (DeepSeek V3.2 via
  OpenRouter) is untested.
- Scenes come from July harness transcripts (no NPC roster, no inventory in the state).

## Next

- Decide the quest-item roll policy; spot-check the harness labels; run `--pass2`.
- Baseline the member-pool narrator (DeepSeek V3.2) on the same turns.
- Design question before more testing: which decisions should be code, which a typed LLM
  question, and which left to the narrator (see plan §6.1).
