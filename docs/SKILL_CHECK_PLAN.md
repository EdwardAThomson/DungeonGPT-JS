# Skill-Check Plan: BG3-style rolls for narrative actions

Status: **Proposed, HIGH PRIORITY (2026-07-16). No code yet.** Tracks
`OUTSTANDING_ISSUES.md` #83. This plan extends the #76 narration contract
([AI_NARRATION_CONTRACT.md](AI_NARRATION_CONTRACT.md)) to social/narrative actions and
**answers its open question 5** (the `[CHECK/ROLL]` trigger: in scope, kept, upgraded into
a real loop). It also builds out the contract's "Future: NPC direct-talk uses bounded
judgment" section.

**Scope: outcome resolution for social/narrative actions** (persuade, intimidate, deceive,
sneak, perceive, recall lore) during free-text play and NPC interaction. Combat mechanics
are untouched ([ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md)); combat narration stays fully
local (confirmed intentional). The determinism boundary is the same as everywhere else:
**the engine rolls and decides, the LLM narrates the result it is handed.**

---

## 1. The problem

Combat is fully deterministic end to end: `encounterResolver.js` rolls the d20, picks the
outcome tier, and even the outcome text is authored (`consequences[tier]`, zero LLM
calls). But **social outcomes have no mechanics at all**. When a player types "I persuade
the captain to open the gate", the LLM simply decides whether it works, which means:

- The most manipulation-prone surface of the game (the player can just argue with the
  model) is exactly the one with no dice.
- Outcomes are non-deterministic across models/retries, the same misfire class #76 kills
  for milestones.
- Character sheets don't matter outside combat: a Charisma 18 bard and a Charisma 8
  fighter persuade identically.

The BG3 model is the target feel: at a consequential moment the game declares a check,
rolls visibly against a DC, and the story branches on the result. The narrator performs
the outcome; it never chooses it.

## 2. What exists today (accurate current-state map)

Half the loop already exists, and it is a **dead end**:

- `DM_PROTOCOL` lets the model emit `[CHECK: Perception]` / `[ROLL: d20]`.
  `TRIGGER_REGEX` in `useGameInteraction.js` parses it into `checkRequest`.
- `Game.js` (the "AI Check Requests" effect, ~line 1311) opens the `dice` modal
  (`DiceRoller.js`) preloaded with the skill and hero #1.
- The player rolls... and **nothing happens.** Game.js passes no `onRollComplete`; there
  is no DC, no outcome tier, no consequence, and the result is never fed back to the AI
  or recorded anywhere. The player closes the modal and the story continues as if the
  roll never happened.
- `DiceRoller`'s skill check also skips the modifier stack combat checks get: raw stat
  modifier only, no level bonus (`getLevelBonus`), no gear (`getEquippedBonuses`), no
  Lead+Support. A level 10 hero rolls like a level 1 hero.

Everything needed to close the loop exists elsewhere: `rollCheck` + crit handling
(`dice.js`), the 4-tier outcome ladder and full modifier stack (`encounterResolver.js`),
the `DIFFICULTY_DC` table (trivial 5 / easy 10 / medium 15 / hard 20 / deadly 25),
consequence plumbing (gold, `affectedFactions`, quest hooks), and the encounter system
for escalation.

## 3. The check loop (design)

### 3a. Trigger: who declares a check

Two entry points, one resolution path:

1. **AI-proposed (free text).** The model emits a structured marker when a player's
   free-text action warrants a check: `[CHECK: persuasion, hard]`. This is *bounded
   judgment* in the #76 sense: the model proposes that a check is happening and how hard
   it is; the engine rolls and decides. It is a proposal marker, not a judgment marker,
   so it survives the #76 marker purge (this resolves the contract's open question 5).
2. **Engine-declared (authored moments).** Authored surfaces (NPC dialogue affordances,
   encounter chips, future quest-giver conversations per
   [FEATURE_QUEST_GIVERS.md](FEATURE_QUEST_GIVERS.md)) declare the check themselves with
   an authored skill + DC. No AI involvement in the trigger at all.

### 3b. DC: tiers, not numbers

The model never emits a raw DC. It picks a difficulty word from the existing
`DIFFICULTY_DC` ladder (reused verbatim; one ladder for the whole game) and the engine
maps it. A raw number in the marker is clamped to the nearest tier. Otherwise we hand
outcome-fudging power back to the model through the side door: "DC 2" is just "I decided
it succeeds" wearing dice.

Later refinement (Phase 3+): authored NPCs can carry a `dcBias` (a stubborn captain
bumps persuasion one tier) so difficulty derives from *who* you're talking to, not only
from the model's read of the situation.

### 3c. Roll: engine-owned, full modifier parity

One shared resolution function (extracted so `encounterResolver` and the narrative path
use the same math): `rollCheck(modifier)` where modifier = stat mod + `getLevelBonus` +
gear (`getEquippedBonuses`, misc always, attack for physical checks) + Lead+Support where
a party assists. Fixing `DiceRoller`'s missing modifier stack is part of this regardless
of the rest of the plan.

Outcome tiers are the combat four: `criticalSuccess / success / failure /
criticalFailure` (nat 20 / beat DC / miss DC / nat 1).

### 3d. Narration: AI performs the result it is handed

Unlike combat (closed outcome space, authored consequence strings), social outcomes are
open-ended, so **here the LLM narrating is correct and necessary**. The engine appends
the resolved result to the next prompt as fact:

> [CHECK RESULT: Persuasion vs the gate captain: FAILURE (rolled 9 vs DC 20). Narrate
> the captain refusing. The refusal stands; do not let further talking reverse it.]

The dice stay honest; the prose stays flexible. The roll itself is surfaced to the
player in the log the same way combat rolls are (d20 breakdown line), so the
determinism is *visible*, which is the credibility wedge (#82) applied to social play.

## 4. Failure design (the core of the plan)

Cardinal rule: **failure must change the state of the world, never just block and invite
a retry.** "He refuses, try again" turns every check into dice-spam until success, which
is worse than no checks. Four failure modes, in descending order of expected frequency:

| Mode | What happens | Existing plumbing |
|---|---|---|
| **Fail forward** (succeed at cost) | You still get the thing, but worse: pay gold, owe a favor (spawned side quest), faction standing drops | gold penalties, `affectedFactions`, `questEngine` |
| **Complication** (route closes, another opens) | The direct approach is spent; the AI surfaces an alternative hook (a rival sells the info, a side door exists) | `pickOfferableSideQuest` guardrail pattern, narrative hooks |
| **Lockout** (approach is spent) | That NPC won't be moved on that topic again this visit; the player must find another route | needs the check ledger (below), prompt injection |
| **Escalation** | Critical failure hands off to a real system: failed intimidation starts an encounter, failed sneak triggers the site mob | `encounterController`, `mobMovement` |

Tier mapping: crit success earns a sweetener (better price, extra info, small faction
gain); success is clean; failure defaults to fail-forward or complication; crit failure
escalates or takes the faction/gold hit.

### 4a. The anti-retry-spam rule (mechanical, not vibes)

One roll per (NPC, topic, approach) per scene. The failed check is recorded in save
state and **injected into the prompt context**:

> [FAILED CHECKS this scene: Persuasion vs Captain Ulric re: the gate. Do not allow
> success through further talking; steer to alternatives.]

Without persistence the player just rephrases until the model caves, and the whole
system is theater. Failed checks also flow into RAG so the world remembers across
sessions ("the captain remembers your clumsy bribe attempt").

### 4b. The golden-path constraint (hard rule)

**A failed check must never dead-end campaign progression.** For milestone-critical
moments (e.g. anything gating a `talk` milestone or a required venue):

- either the moment is not check-gated at all (the Talk button stays a button), or
- failure is strictly fail-forward: the roll decides the *price* of progress, never its
  *possibility*.

Optional content may lock out freely; the golden path may only get more expensive. This
is the same class of authoring invariant as the storyTemplates rules in `CLAUDE.md` and
should be enforced the same way (audit/lint when authored checks arrive in Phase 3).

## 5. Persistence & integrity

- Check results (skill, target, topic, tier, outcome, turn) append to save state
  (ledger-style, capped, mirroring `heroLedger`'s pattern). Reload must not become a
  free reroll: the failed-check record survives the reload even though the *next* roll
  is still random.
- Guests (no AI): engine-declared checks still work fully (roll + templated outcome
  lines via the localNarrator pattern); AI-proposed checks simply never occur (no AI).
- Client-side rolls are trustable-enough for a single-player game today; if provable
  fairness ever matters (multiplayer, leaderboards), rolls move behind the worker. Not
  in scope now.

## 6. Phasing

1. **Phase 1: close the existing loop.** Marker upgraded to `[CHECK: skill, tier]`
   (tier optional, default medium); shared resolution path with full modifier parity;
   result card in the log (reuse the combat roll-breakdown presentation); result fed
   back to the AI as fact with a one-shot auto-continuation narration. `DiceRoller`
   either becomes the presentation for this flow or is bypassed by an inline roll line.
   No consequences yet beyond narration. **This must ride the #76 DM_PROTOCOL rewrite**
   (same prompt surgery, same few-shot exemplar bank; a worked check exemplar goes in).
2. **Phase 2: failure states.** Check ledger in the save; (NPC, topic) lockout rule;
   failed-check prompt injection; RAG sync.
3. **Phase 3: consequences + authored checks.** Wire fail-forward costs (gold, faction,
   spawned favor quests) and crit-failure escalation into encounters; authored
   `dcBias`/check affordances on milestone NPCs and quest givers, with the golden-path
   lint. Depends on the quest-giver conversation design when it lands.
4. **Phase 4: juice.** BG3-style roll presentation (animated d20, tier reveal), folds
   into #78/#79 animation work rather than being built here.

## 7. Open questions

1. **Who rolls?** Hero #1 (today's `DiceRoller` behavior), the campaign Lead, or
   best-modifier party member with the others assisting (Lead+Support reads naturally
   here)? Leaning Lead + support bonus, matching combat.
2. **Marker vs structured output.** A `[CHECK: ...]` text marker matches today's
   parsing, but the #76 rewrite moves toward stripping markers server-side; the check
   marker must be exempted in both `sanitizeResponse` passes, or check proposals move to
   a structured channel later. Phase 1 keeps the marker (allowlisted).
3. **How often should the AI propose checks?** Needs few-shot exemplars + eval
   (extend `scripts/eval-premium-models.mjs` renderer mode with check-discipline
   scoring: propose when warranted, never for trivial actions, never self-resolve).
4. **Does a failed social check interact with talk milestones?** #76 open question 3
   overlaps: narration must not read as fulfilling an objective the engine hasn't
   completed. The failed-check injection helps; needs a joint answer with #76.
5. **Scene boundary for lockouts.** Per town visit? Per in-game day? Cleared on
   world-map move? Needs a definition the engine can compute.
6. **Free vs premium.** Checks are core mechanics, so free; only Phase 4 presentation
   polish follows the #78 gating split.

## 8. Related docs

- [AI_NARRATION_CONTRACT.md](AI_NARRATION_CONTRACT.md) (#76): the contract this extends;
  its open question 5 is resolved by this plan (bounded proposal markers stay).
- [ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md): owns combat resolution; the shared roll
  math is extracted from, not changed in, `encounterResolver.js`.
- [FEATURE_QUEST_GIVERS.md](FEATURE_QUEST_GIVERS.md): quest-giver conversations inherit
  the engine-rolls/LLM-performs constraint (already noted there via #76).
- [GAME_FEEL_PLAN.md](GAME_FEEL_PLAN.md) / [COMBAT_UX_PLAN.md](COMBAT_UX_PLAN.md):
  Phase 4 presentation lives with that work.
