# AI DM Design Direction

Status: direction note, 2026-09-30; updated 2026-10-08 for the #84/#91 workspace (not yet a decision)
Related: [AI_NARRATION_CONTRACT.md](AI_NARRATION_CONTRACT.md) ("engine referees, LLM
narrates"), [TYPED_DECISION_EVAL_RESULTS.md](TYPED_DECISION_EVAL_RESULTS.md),
[TYPED_DECISION_NEXT_STEPS.md](TYPED_DECISION_NEXT_STEPS.md),
[TIERED_NARRATION_PLAN.md](TIERED_NARRATION_PLAN.md)

## The problem

The core problem of this project has always been how much to hand to a language model and
how much to decide in code. A strong enough model could plausibly run the whole game as a
human DM would. In practice:

- **The strongest models can do it, but cost too much at scale.** Every turn would carry the
  full game state and ask the model to judge, remember and narrate at once.
- **Weaker, affordable models cannot.** The failures are consistent and documented in the
  devlog: they lose track of who is where, invent people and places, treat place names as
  people, and complete objectives early. These are all failures of *tracking state* and
  *making judgements*, not of writing prose.
- **The expensive part is not the thinking; it is the context.** A model acting as the DM
  has to hold and track the entire game state every turn. Weaker models fail exactly there.

## The direction

Give each job to what is cheap and reliable at it:

| Job | Owner | Why |
|---|---|---|
| Hold the game state (map, party, inventory, objectives, NPCs and where they are) | Code | Exact, persistent, free |
| Make every decision (dice, whether a roll happens, skill, difficulty, presence, items, objective completion) | Code | Certain: a rule triggers or it does not |
| Choose the context for each model call (only the facts this moment needs) | Code | "Managing the context" is a selection problem, which code does well |
| Turn free text into one of the known actions, when free text is allowed | Small model | The one step code cannot do; models are good at it (below) |
| Narrate settled outcomes | Small model | Prose from a narrow, factual brief |
| High-value moments (key story beats), if anywhere | Stronger model, sparingly | Spend only where it is noticeable (see the tiered narration plan) |

This extends the narration contract from milestones to the whole turn. The model reads and
writes; it never decides.

## What the pilot showed (2026-09-30)

The typed-decision pilot measured reading and deciding separately:

- **Reading free text is where models are good.** GPT-6 Luna classified player messages at
  95-97% (what kind of message, who it is aimed at, whether it can be understood at all);
  gemma-4-26b at 90%.
- **Deciding is where models are mediocre.** Whether to roll, which skill and how hard
  scored 36-83% across every model tested, including today's narrators.
- **Given the correct intent, a small code rule table decided rolls better than any model:**
  96% on the roll decision versus 79-83%. (In-sample and optimistic: the rules were written
  after seeing the test turns. A fresh set is on the checklist.)
- **Game-specific policy belongs in code.** On quest-item searches the rules followed the
  game's policy (no roll: the engine grants authored quest items) while models called for
  Investigation checks, because nothing told them otherwise.

## Buttons and free text: one rulebook, several doors

Buttons guarantee progress; free text keeps play open. This is now largely built:

- **Engine chips (#91, [SUGGESTED_ACTIONS_PLAN.md](SUGGESTED_ACTIONS_PLAN.md)):** travel, enter,
  talk to the objective NPC, search / confront / gather on objective tiles, rest, leave,
  explore, levelling hunts. Fixed rules over game state, no model call, never suggesting what
  the engine would refuse. Progression no longer depends on what the player types.
- **Encounter chips** carry their skill (the encounter's authored `suggestedActions`), so
  checks inside encounters are already decided in code.
- **More narration in code:** terrain lines, Look-around openers, NPC meeting beats and
  encounter outcomes are templated, and Look around lights up from map features code
  detects ([LOOK_AROUND_PLAN.md](LOOK_AROUND_PLAN.md)).

The remaining gap (2026-10-08) is **skill checks outside encounters**: persuading an NPC,
sneaking past a guard, searching for something that is not an objective. No chip covers them,
so they still run through typed text and the narrator's `[CHECK:]`, the one place a model
still rules. Two ways to close it, which combine: engine chips for the common cases
("Persuade Warden Sigrun" when she is present), each with a code-defined check; and, for
improvisation, matching typed text to one of the scene's actions for the player to confirm,
with the matched action's code rule deciding the check.

Whichever option wins, both routes must resolve through **one rulebook**. A button press, a
confirmed suggestion and a typed check all become the same action object, go through the
same code rule, and share the same failed-check lock ledger. Otherwise the two routes
disagree, and players notice or exploit it (fail with the button, retry by typing). The
model's only job on the typed route is to recognise which door the player walked through.

## Open decisions

Tracked in [TYPED_DECISION_NEXT_STEPS.md](TYPED_DECISION_NEXT_STEPS.md). The main one is how
skill checks outside encounters reach the engine (above); the others (Phase 2 AI chips
mapping onto engine actions, quest-item roll policy, Engine page copy) follow from it.

## Where a Jev-like model still fits

The pilot asked open questions about every turn. With engine chips in place, a narrower and
better-posed question is available: "which of this scene's actions, if any, does the
player's text mean?", with the options supplied by the engine (its chips, candidate skill
actions, and "none: just roleplay"). That is exactly the fixed-options shape Jev and OpenAI's
Decisions API are built for. The model only picks a door; code decides what happens behind
it; a confirmation click makes a misread cost one click. The chip-matching experiment in the
checklist tests whether this needs a model at all, and how small one can be.
