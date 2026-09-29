# Typed Decision Eval Plan (Jev / Jev-like adjudication)

Status: draft, 2026-09-29 (revised same day against the local tree)
Related: `AI_NARRATION_CONTRACT.md` (open questions 3 and 5, "Future: NPC direct-talk uses
bounded judgment"), `SKILL_CHECK_PLAN.md`, `TIERED_NARRATION_PLAN.md`,
`scripts/quest-harness.mjs`, `scripts/eval-premium-models.mjs` (local, gitignored)

This plan is the next step of the contract's bounded-judgment direction: the direct-talk
section already anticipates "a tiny, constrained classification" in place of LLM judgment,
and open question 5 is where the `[CHECK:]` proposal marker was scoped as an interim.

## 1. Why

The narration contract already keeps outcomes in code: combat, milestones, rewards and
movement make no LLM calls, and the narrator is told "outcomes are decided by the game".
Two judgments are still made by the narrator, inside a prose generation call:

1. **Skill-check proposal.** The model emits `[CHECK: skill, tier, target]` and the engine
   rolls (`useGameInteraction.js` handleSubmit → `parseCheckMarker` in `skillCheck.js`).
   Whether a check is needed, which skill, and how hard are all model decisions.
2. **Message routing.** Nothing classifies player input. `[PLAYER ACTION]` is the raw text,
   so OOC questions, chatter, and dialogue aimed at a milestone NPC (contract open question
   Q3) all reach the narrator.

Observed problems (DEVLOG 2026-07-07, 07-17, 07-19): premature completion markers on every
model tested, invented towns/NPCs, place names treated as people. The workaround so far has
been a large default narrator (gpt-oss-120b on Workers AI; DeepSeek V3.2 on OpenRouter for
members, chosen for prose quality). Smaller free-pool models fail the contract; the large ones
cost more per neuron / per token than the game can sustain at scale.

**Hypothesis.** If the two judgments above are moved into a separate, cheap, typed-question
pass (the "Jev pattern": fixed option sets, probabilities out, nothing generated), and the
narrator receives every fact already resolved, then (a) adjudication becomes measurable and
consistent, and (b) a smaller narrator becomes acceptable, because it is no longer asked to
judge anything.

**What "Jev-like" means here.** A call that takes the current game state plus a small set of
typed questions and returns, per question, a distribution over the declared options. Three
ways to get that, all tested against the same questions:

| Backend | How | Cost profile |
|---|---|---|
| Generative JSON | Free-pool Workers AI model asked the questions with a JSON answer schema | Neurons per call, no new infra |
| Logit readout | Read option-token probabilities from one forward pass (OpenJev pattern). Via OpenRouter `logprobs`/`top_logprobs` on a supporting provider, or self-hosted vLLM `prompt_logprobs` | Input tokens only, near-zero output |
| Jev | TypeSafe hosted service, when early access opens | $0.042 / MTok input, output free (unverified, from public announcements) |

External details in this plan (Jev pricing and API shape, the OpenJev pattern, the SemIf
README's pinned Qwen revision) were not verified from this repo; confirm them before relying
on any of them in a decision.

## 2. Decisions to be typed

All questions are evaluated against the same state block the narrator already gets
(`gameContext` built in `useGameInteraction.js`: setting, goal, milestones, side quests,
location + NPC roster, party, active locks, resolved check) plus the player's message.

| # | Question | Type | Options | Consumer |
|---|---|---|---|---|
| Q1 | What kind of message is this? | Choice | `action`, `npc_dialogue`, `world_question`, `ooc`, `clarification` | Router (new) |
| Q2 | Action category | Choice | `move`, `attack`, `interact`, `persuade`, `stealth`, `investigate`, `other` | Engine |
| Q3 | Target | Choice | entity IDs from the id-bearing roster (§3.0) + `none` | Engine; fixes contract Q3 |
| Q4 | Does this need a skill check? | Yes/No | — | Replaces `[CHECK:]` |
| Q5 | Which skill | Choice | keys of `SKILLS` (`utils/rules.js`) | Replaces `[CHECK:]` |
| Q6 | Difficulty | Score | `CHECK_TIERS` = trivial … deadly | Replaces `[CHECK:]` |
| Q7 | Is the player attempting something impossible given the state? | Yes/No | — | Narrator instruction |

Q2–Q7 are only *used* when Q1 = `action`, but are always *asked*. On the logit and Jev
backends adding a question is nearly free, because prefill of the shared state dominates cost
(each question still needs its own answer position, but with prefix caching the state is
paid once). On gen-json every answered question costs output tokens, so measure whether
asking Q2–Q7 conditionally is cheaper there.

Option lists are fixed and ordered at build time. Ordering sensitivity is one of the things
under test (see §4.2–4.3), so the eval permutes them deliberately; production never does.

## 3. Phase 0 — capture a corpus

**Goal:** a few hundred real player turns with labels. Real inputs matter; harness
playthroughs are too well-behaved to be the benchmark. Target: 200 labelled turns minimum,
500 preferred.

**Pilot set first.** The local `harness-transcripts/` directory (gitignored; ~50
`quest-harness` playthroughs across 7 templates) is enough to build and debug the labeller
and the eval script before `turn_log` has collected anything. Treat it as a dev set only;
never report headline metrics from it.

### 3.0 Prerequisites (refactors)

- **Extract the prompt builders.** *Done 2026-09-29:* `getMilestoneStatus`,
  `formatMilestonePromptText`, `formatSideQuestPromptText` and `buildLocationContext` moved
  from `useGameInteraction.js` into `src/game/turnContext.js` (`formatPartyInfo` was already
  exported from `promptComposer.js`). `quest-harness.mjs` playthroughs now use the real
  milestone builders; its replica had drifted and was still emitting the pre-#76
  "you may mark this complete" talk cue.
- **Id-bearing NPC roster.** *Done 2026-09-29:* `buildNpcRoster(locationCtx)` in
  `turnContext.js` returns `[{ id, name, role, here, milestoneNpcId?, milestoneId? }]`.
  No new data was needed: `populateTown` already stamps a persisted uuid `id` on every NPC.
  Town only for now; explorable sites have no roster yet.

### 3.1 Turn log

The worker cannot build the structured state itself: `/api/ai/generate` receives only the
rendered prompt, and `gameContext` is assembled on the client in `useGameInteraction.js`.
So the client attaches an optional `turnMeta` object to free-text generate requests
(`{ sessionId, playerText, state, checkMarker? }`, where `state` is the output of the §3.0
builders' inputs). Add it to `generateAiRequestSchema` as optional with a size cap; older
clients that omit it simply produce no log row. `turnMeta` is client-supplied and
untrusted: fine for eval data, never used to make an authoritative decision.

Add a `turn_log` table, written from `cf-worker/src/routes/ai.ts` after a successful
generate when `turnMeta` is present (fire-and-forget via `waitUntil`, never on the request
path):

```sql
create table turn_log (
  id            bigserial primary key,
  ts            timestamptz not null default now(),
  session_id    uuid,           -- per-play-session id; no user id, no IP
  pool          text not null,  -- free | premium
  model         text not null,
  prompt_hash   text not null,  -- sha256 of full prompt; dedupe + drift detection
  player_text   text not null,  -- the [PLAYER ACTION] block
  state_json    jsonb not null, -- compact snapshot: location, npcs, milestones, party, locks
  raw_output    text not null,
  check_marker  jsonb,          -- parsed {skill, tier, target} or null
  latency_ms    int,
  input_tokens  int,
  output_tokens int
);
```

Notes:
- `state_json` should be the *structured* inputs to the prompt builders, not the rendered
  prompt, so questions can be re-asked later against the same state with a different
  serialisation.
- Privacy posture matches the #86 product-analytics events: no user id column and no IP.
  Only signed-in players reach `/api/ai/generate` (guests get the no-AI templated paths),
  but the log still does not need to know who they are.
- Retention: rows older than 90 days are deleted by a scheduled job; labelled exports are
  the only long-lived copy.
- Add a line to the site's privacy note before enabling the write: player turn text is
  stored for up to 90 days to improve the game. Gate the write behind a worker flag so it
  can be switched off without a deploy of the client.
- Export helper: `scripts/export-turns.mjs` → JSONL, one turn per line, matching the
  fixture format in §4.2.

### 3.2 Labelling

`scripts/label-turns.mjs`: a minimal terminal labeller (or a Claude Code session) that shows
state + player text and prompts for Q1–Q7. Label rules to keep consistent:

- Q1 `npc_dialogue` = speech directed at a named NPC in the roster; generic "I ask around" is
  `action`/`persuade`.
- Q4 = "would a human DM call for a roll here": obvious/trivial actions = no, contested or
  uncertain = yes. When unsure, label yes with tier trivial.
- Q7 = physically impossible or contradicts state (attacking an NPC not present, casting
  without a class ability). Not "unwise".

Also label 10–20% of turns twice (self or a second person) to get inter-annotator agreement.
That number is the ceiling any backend can be expected to reach.

Output: `harness-transcripts/turns/labelled.jsonl` (gitignored). This repo is public, and
"stored to improve the game" does not cover publishing real player text, so the labelled
corpus is never committed. Commit only the scripts, the label rules above, and aggregate
stats.

## 4. Phase 1 — offline adjudication eval

### 4.1 Backends and models

| Backend | Model | Route | Notes |
|---|---|---|---|
| gen-json | `@cf/meta/llama-3.1-8b-instruct-fast` | Workers AI | cheapest |
| gen-json | `@cf/google/gemma-4-26b-a4b-it` | Workers AI | replaces gemma-3-12b (no longer accessible, see §7) |
| gen-json | `@cf/openai/gpt-oss-20b` | Workers AI | likely sweet spot |
| gen-json | `@cf/openai/gpt-oss-120b` | Workers AI | current free default |
| logit | `@cf/meta/llama-3.1-8b-instruct-fast` | Workers AI logprobs (confirmed, §7) | first logit row: non-reasoning, ~300 ms |
| logit | Qwen3.5-4B (pinned rev from SemIf README) | vLLM, rented L4/A10 or OpenRouter logprobs | OpenJev pattern; only if the Workers AI rows fall short |
| reference | `deepseek/deepseek-v3.2` | OpenRouter premium pool | strong-model comparison |
| reference | `anthropic/claude-haiku-4.5` | OpenRouter | second reference |
| jev | Jev | TypeSafe API | when access is granted |

**Provider pinning.** Follow the policy already in `eval-premium-models.mjs`: Chinese-origin
models (Qwen, DeepSeek) are called through OpenRouter with `provider.only` set to US
inference hosts and `allow_fallbacks: false`, and each response's `provider` field is
recorded to confirm the pin held. A self-hosted vLLM run of Qwen on rented US hardware
satisfies this by construction.

**Catalog snapshot (2026-09-29, `wrangler ai models list`).** 31 text-generation models.
What matters for adjudication is whether reasoning can be turned off, because only then are
the answer logprobs informative (§7):

| Group | Models | Reasoning |
|---|---|---|
| Non-reasoning, cheap | `granite-4.0-h-micro` ($0.017/M in), `llama-3.2-1b`/`-3b`, `llama-3.1-8b-instruct-fp8`, `mistral-small-3.1-24b` | none |
| Reasoning, can be switched off (free plan) | `gemma-4-26b-a4b-it`, `glm-4.7-flash` | optional |
| Reasoning, mandatory | `gpt-oss-20b`, `gpt-oss-120b` (lowest: `low`), `qwen3.8-27b` (lowest: `low`) | always |
| Paid plan only | `deepseek-v4-flash` / `-pro` (reasoning optional), `kimi-k2.6`, `glm-5.2`/`5.3`/`5.3-flash` | varies |

Not in the catalog: `gemma-3-12b-it` (access refused; removed from the registry
2026-09-29) and `llama-3.1-8b-instruct-fast` (still callable, so probably unlisted ahead of
retirement). Its listed sibling `-fp8` is not a drop-in: on a narration probe it took
11–14 s against ~1.8 s for `-fast`. Add `granite-4.0-h-micro` and `llama-3.2-3b` as
gen-json and logit rows, and rerun `gemma-4` / `glm-4.7-flash` with reasoning off.

### 4.2 Script: `scripts/adjudication-eval.mjs`

Reuse the guard framework and OpenRouter client from `quest-harness.mjs` (per-run USD ceiling,
TPM/RPM windows, dry-run default, key handling) and the provider-pinning and cost-recording
code from `eval-premium-models.mjs`. Add a Workers AI client that goes through the deployed
worker's `/api/ai/generate` with a dev token, so the prompt path is the production one.

Input fixture (one per line):

```json
{"id":"t-0001","state":{...},"player_text":"I try to sneak past the guard",
 "labels":{"q1":"action","q2":"stealth","q3":"npc:guard_02","q4":true,"q5":"Stealth","q6":"medium","q7":false}}
```

Per backend, per turn:
1. Serialise `state` with the builders extracted in §3.0 (`formatMilestonePromptText`,
   `buildLocationContext`, `formatPartyInfo`, the roster) so the eval cannot drift from
   `handleSubmit`.
2. Ask Q1–Q7 in one call (JSON schema for gen-json; option-token readout for logit).
3. Record answers, per-question probability if available, latency, tokens, cost.
4. Repeat with (a) option order reversed, (b) player text lightly paraphrased (a fixed
   paraphrase column in the fixture, hand-written for ~50 turns).

Output: `results/adjudication/<backend>-<model>-<date>.jsonl` + `summary.json`.

### 4.3 Metrics

Per backend and per question:

- **Accuracy vs labels**, balanced by class (Q1 and Q4 are imbalanced).
- **Agreement with reference** (DeepSeek) — tells you whether a disagreement with labels is
  the cheap model being wrong or the label being debatable.
- **Order consistency**: fraction of turns whose argmax survives option reversal.
- **Paraphrase consistency**: fraction whose argmax survives the paraphrase.
- **Schema validity** (gen-json only): fraction of calls producing parseable, in-range JSON.
- **Latency** p50/p95, **cost per turn**.
- **Calibration** (logit and Jev; gen-json only if it returns a confidence): reliability
  diagram and ECE per question; then choose an abstain threshold τ such that precision above
  τ ≥ 0.95 and report coverage at τ. Coverage is the number that matters: it is the fraction
  of turns the engine can act on without asking the player to clarify.

Pass criteria to move to Phase 2 (per question): accuracy within 5 points of the reference
model, order consistency ≥ 0.9, schema validity ≥ 0.99, p95 latency ≤ 1.5 s.

### 4.4 Cost envelope

Upper bound: ~500 turns × ~2.5k input tokens × 3 variants × 8 configs ≈ 30M input tokens,
most of it on the free pool. This over-counts, since the paraphrase variant covers only ~50
turns; realistically ~20M. OpenRouter share (two references + logit) ≈ 7–11M tokens ≈ $5–15.
Fits under the harness guards with `--max-usd` raised per run.

### 4.5 Per-turn cost vs Jev

List prices per million tokens from the catalog above; Jev's from its announcement
(unverified). Assumes ~2.5k input tokens of state per turn; output is ~60 tokens of JSON for
non-reasoning gen-json, and an *estimated* ~300 tokens for gpt-oss at low reasoning effort.
Logit readout has near-zero output, so its cost is the input column alone.

| Adjudicator | $/M in | $/M out | ≈ $ per turn | ≈ $ per 100k turns |
|---|---|---|---|---|
| `granite-4.0-h-micro` | 0.017 | 0.112 | 0.00005 | 5 |
| Jev | 0.042 | 0 | 0.00011 | 11 |
| `llama-3.2-3b` | 0.051 | 0.335 | 0.00015 | 15 |
| `glm-4.7-flash` (reasoning off) | 0.061 | 0.40 | 0.00018 | 18 |
| `gemma-4-26b` (reasoning off) | 0.10 | 0.30 | 0.00027 | 27 |
| `llama-3.1-8b-fp8` | 0.152 | 0.287 | 0.0004 | 40 |
| `gpt-oss-20b` | 0.20 | 0.30 | 0.0006 | 60 |
| `gpt-oss-120b` | 0.35 | 0.75 | 0.0011 | 110 |
| *Narrator today: gpt-oss-120b, ~4k in + ~500 out* | | | *~0.0018* | *~180* |

Reading: Jev is cheap but not uniquely so; small Workers AI models sit in the same band,
and every option except the gpt-oss pair adds under ~15% to the narration cost of a turn.
Price will not decide this. Accuracy, calibration (usable confidence for the abstain path)
and latency will, and those are what Phase 1 measures. The real saving in the hypothesis is
§6 step 4, downgrading the narrator, which dwarfs any adjudicator cost difference.

Workers AI also has a daily free neuron allowance; check the current figure against
expected turn volume before Phase 2, since that (not list price) decides whether the paid
plan is needed.

## 5. Phase 2 — shadow mode in production

Run the winning adjudicator in the worker on every real free-text turn, alongside the
existing flow. Store its verdicts in `turn_log` (new column `adjudication jsonb`). Act on
nothing yet.

Analyse after ~1–2 weeks:
- Adjudicator Q4–Q6 vs the narrator's actual `[CHECK:]` marker: disagreement rate and a
  hand-review of 50 disagreements.
- Q1 = `ooc` / `world_question` rate: how much narrator spend is being wasted on non-actions.
- Q3 hits on milestone NPCs while the engine was waiting for the Talk button: size of the
  contract Q3 problem.
- Latency added to the request path if run inline (target: hide it by running adjudication in
  parallel with the narration call during shadow mode).

## 6. Phase 3 — switch over, one decision at a time

Each step is behind a feature flag in `cf-worker` and reversible.

**Where the pieces run.** The adjudicator runs in the worker, but the roll
(`resolveSkillCheck`, with the hero modifier stack) and the check-lock ledger
(`settings.checkLocks`) live on the client. So the switched-over turn is two client calls:
`POST /api/ai/adjudicate` (new route; takes the same `turnMeta` as §3.1, returns the typed
verdicts and per-question confidence), then the client resolves locally and calls
`/api/ai/generate` with the resolved facts. This is the "sequential" option in §7; Phase 2
measures its latency cost. Moving the roll server-side is out of scope.

1. **Check decision.** The client takes Q4–Q6 from the adjudicate response, applies the
   existing lock rules, rolls with `resolveSkillCheck`, and injects `[RESOLVED CHECK]` into
   the narration prompt *before* generation. The `[CHECK:]` marker path remains as a
   fallback when the adjudicator abstains (confidence < τ). `skillCheck.test.js` and the
   `[CHECK:]` regex checks in `test-cf-models-multiturn.mjs` must stay green while both
   paths coexist. Remove "SKILL CHECKS (you propose, the game rolls)" from `DM_PROTOCOL`
   once stable.
2. **Routing.** Q1 = `ooc`/`world_question` → the assistant path (`AiAssistantPanel` prompt,
   short answer, no narration). Q1 = `npc_dialogue` with Q3 = milestone NPC → the talk-milestone
   path (`handleTalkToNpc`), which fixes contract Q3.
3. **Impossible actions.** Q7 = yes → narrator is told to narrate the attempt failing for a
   stated reason; no roll, no state change.
4. **Narrator downgrade.** With every fact resolved up front, re-run
   `scripts/test-cf-models-multiturn.mjs` (regex contract checks + consistency/tone scorers)
   across the free pool. Promote the smallest model that passes to free default. Re-evaluate
   whether the premium pool is now a prose-quality tier only.

## 7. Open questions

- Does Workers AI expose logprobs? *Answered 2026-09-29 by a live probe through the
  `env.AI.run()` binding (`logprobs: true, top_logprobs: 5`), one OOC test question per model:*
  - Returned OpenAI-shaped `choices[0].logprobs.content[]`: `llama-3.1-8b-instruct-fast`,
    `gpt-oss-20b`, `qwen3.8-27b`, `gemma-4-26b-a4b-it`, `glm-4.7-flash`. So the logit
    backend can stay entirely on Cloudflare.
  - Reasoning models (gpt-oss, Qwen 3.8, GLM) emit their reasoning first, so the answer
    token comes after it and its logprob is near-certain (gpt-oss: `ooc` at p≈1.0): the
    confidence was spent in the reasoning. Useful calibration needs a non-reasoning model,
    or reading the option logprobs at a forced answer position with reasoning off.
  - `llama-3.1-8b-instruct-fast` (non-reasoning, ~300 ms) gave a real distribution:
    `o[oc]` 52%, `npc[_dialogue]` 31%, `action` 7%, yet the *sampled* answer was
    `npc_dialogue`. Argmax over logprobs would have been right where the generated text
    was wrong; a small concrete case for the logit backend.
  - Latency on this one short prompt: llama-8b-fast ~0.3 s, gpt-oss-20b ~0.5–3.7 s (varies
    with reasoning length), gemma-4-26b ~5–6 s, qwen3.8-27b ~10 s, glm-4.7-flash ~18 s.
  - `kimi-k2.6` is not available on the account's Workers Free plan.
  - `gemma-3-12b-it` fails with `5018: This account is not allowed to access` it, although
    it is still in `cf-worker/src/services/models.ts` (production falls back down the chain,
    so a player picking it silently gets another model). `llama-3.1-8b-instruct-fast` works
    despite its docs page 404ing. Replace the gemma-3 row in §4.1 (gemma-4-26b is the
    obvious candidate).
- Where does adjudication run relative to narration: sequential (adjudicate, resolve, narrate;
  adds one round-trip) or parallel with a re-narrate on disagreement? Sequential is cleaner
  and the latency should be small; measure in Phase 2.
- Confidence UI: when the adjudicator abstains, ask the player a one-line clarifying question
  ("Are you trying to sneak past, or talk to the guard?") instead of guessing. This is the
  Jev escalation pattern applied to a game and may be a feature rather than a cost.
- Jev access: join the waitlist now; the fixture and script are backend-agnostic so Jev is one
  more row when it arrives.

## 8. Deliverables checklist

- [x] Extract `formatMilestonePromptText` / `buildLocationContext` into
      `src/game/turnContext.js`; switch `quest-harness.mjs` off its replica
- [x] Id-bearing NPC roster for Q3 (`buildNpcRoster`)
- [ ] Optional `turnMeta` on `generateAiRequestSchema` + client send
- [ ] `turn_log` migration + flagged worker write + 90-day retention job + privacy note line
- [ ] `scripts/export-turns.mjs`
- [x] Pilot tooling (2026-09-29), under `scripts/adjudication/`: `turns-from-harness.mjs`
      (88 unique harness turns, old talk cue rewritten to current wording),
      `label-turns.mjs` (resumable labeller, `--pass2` double-label sample, `--stats`
      agreement), and 60 hand-written awkward turns in
      `harness-transcripts/turns/pilot-adversarial.jsonl` reusing harness scenes via
      `context_ref`
- [ ] Label the pilot set (~148 turns + ~19 second-pass)
- [ ] `harness-transcripts/turns/labelled.jsonl` from real turns (≥200, 10% double-labelled,
      never committed)
- [ ] `scripts/adjudication-eval.mjs` with gen-json, logit and reference backends
- [ ] `results/adjudication/summary.json` + a short `RESULTS.md` with the metrics in §4.3
- [ ] Shadow-mode column and analysis notebook/script
- [ ] `/api/ai/adjudicate` route + feature flags for Phase 3 steps 1–4
- [ ] Decide whether to un-ignore `scripts/eval-premium-models.mjs` (present locally,
      gitignored; referenced from `openrouter.ts` and `AI_NARRATION_CONTRACT.md`) and commit
      a summary of its July results, including the `--mode=renderer` runs, as the baseline
      for §6 step 4
