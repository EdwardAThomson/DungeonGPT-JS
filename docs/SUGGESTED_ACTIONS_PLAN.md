# Suggested actions: engine-derived action chips for the workspace (#91)

Status: **Phase 1 built in the spike, 2026-10-03** (`src/game/suggestedActions.js`, wired into the
workspace only). Rule 8 (leave a cleared site) is not built yet; the rest of the table is. Part of the #84 workspace (see
[MAP_LAYOUT_PLAN.md](MAP_LAYOUT_PLAN.md)); the spike lives at `/workspace-debug` on branch
`feat/workspace-spike`. The landing mockup (`game.html`) showed suggestion chips above the
input, such as "Take the west road to Briarwood", which auto-walked the party there. This
doc turns that into rules the engine can evaluate.

## Decisions (maintainer, 2026-10-03)

1. **Phase 1 is engine-only.** Chips come from fixed rules over game state, with no AI call,
   so guests get them too and they can never suggest something the engine would refuse.
   AI-proposed story chips (the mockup's "Ask about the road west") are Phase 2, AI players
   only.
2. **A chip click logs a "You" line** ("You: Travel to Willowdale"), the same as a typed
   action, so the log reads as a record of what the player chose.
3. **Travel chips also appear on the map** (probably as a marker or highlight on the
   destination), not only above the input. Exact treatment to settle in the build.

## The rule: only suggest what the party has a reason to know

A place is suggested only when the engine has already told the player about it: the
milestone's requirements are met (`areRequirementsMet`) and its location is on the map (the
same gate as `computeVisibleMilestonePois`). Side-quest targets count once their site is
revealed (sticky reveal in `questEngine.js`). Nothing is suggested from hidden state, so the
chips never spoil an unrevealed POI.

## Rules (evaluated each turn, highest priority first, at most 3 chips)

| # | When | Chip | Click does |
|---|---|---|---|
| 1 | A narrative hook is parked on this tile (AI players) | Look around | the existing Look around flow; ties into [LOOK_AROUND_PLAN.md](LOOK_AROUND_PLAN.md) (#89) |
| 2 | Standing on a town tile, not inside it | Enter Snowley | `onEnterCurrentTown` |
| 3 | The current milestone's place (`formatStartObjective(...).destination`, or a visible milestone POI) is another settlement or POI | Travel to Willowdale | auto-travel (`planTravelRoute` + the spike's travel stepper; encounters interrupt as usual) |
| 4 | Inside the milestone's town, its building or NPC is known | Go to The Crooked Pint / Talk to Captain Ulric | town walk to the building (`computeWalkPath` + `runTileWalk`), then the building modal or the Talk action |
| 5 | A side quest is ready to hand in (`getReadyTurnIns` / `isQuestReadyToTurnIn`) | Return to the guild in Briarwood | auto-travel, then a town walk to the turn-in building |
| 6 | A side quest's site is revealed and not cleared | Head for the cave | auto-travel to the nearest revealed site of that type |
| 7 | The party is hurt and the current town has an inn | Rest at the inn | town walk to the inn, then `onRest` |
| 8 | Inside a site that is cleared | Leave the cave | `onLeaveSite` |

### Playtest additions (2026-10-05)

| When | Chip | Click does |
|---|---|---|
| On a town exit tile, or at a site entrance | Leave Ashford / Leave Mossy Cave | `handleLeaveTown` / `handleLeaveSite` |
| Standing on a milestone objective tile | Search X / Confront X / Gather X | same resolvers and actions as the POI arrival modal |
| A boss or wilderness-item step | Travel to the nearest tile the engine fires it on | e.g. the Rot Tunnels, not only the town the step names |
| Standing on a revealed cave / ruins | Explore the cave | `handleEnterLocation` |
| Inside a site | Face the boss / Find or Reach the objective / Gather a needed node | site walk (`handleSiteTileClick`) or `handleAttackSiteMob` |
| A side-quest chip exists but campaign steps fill the three slots | (the last slot goes to the side quest) | side-quest chips carry `side: true` |

Rule 6 matches caves by their world tile (`poi: 'cave_entrance'`), and also covers gather
steps sourced from sites (`step.sites`).

### Levelling nudges (added 2026-10-05)

With one-click travel a player can finish a campaign far below the next chapter's level,
so two more rules steer them toward XP without ever blocking the main quest:

| When | Chip | Click does |
|---|---|---|
| The party (effective level) is below a step's recommended level: its `minLevel`, else the top of the campaign `levelRange` for a boss | "Travel to X (level N recommended)", plus "Hunt in the forest/hills/mountains" | travel; the hunt goes to the nearest unexplored wild tile, where encounter odds are full |
| Inside a town, under the active side-quest cap, a building offers a quest the party can take | "Ask for work at The Crooked Pint" | town walk, then the building opens |

Alongside, XP now scales by campaign tier where it is granted (`src/game/xpScaling.js`):
milestones and their bosses x2 (tier 1) / x3 (tiers 2-3); random fights and side quests
x1 / x1.5 / x2. Measured on the built-in campaigns: a tier-1 main path alone ends at level
2 and a thorough run at level 3 (the tier-2 start); a tier-2 main path alone ends at level
4 and a thorough run at the top of its range.

Ties: the current milestone beats side quests; nearer beats farther. The set is recomputed on
every move and engine event, so a chip disappears once it no longer applies (arriving,
completing, entering).

## Where it lives

- **`src/game/suggestedActions.js` (new, pure):** `getSuggestedActions(state)` returns
  `[{ id, label, kind, target }]`, where `kind` is one of
  `enter | travel | walk | talk | rest | leave | look`. It has no React, so the rules get
  unit tests per row of the table above.
- **`Game.js`:** `runSuggestedAction(action)` dispatches by `kind` to the existing
  handlers, after appending the "You" log line.
- **UI:** a `.ws-chips` row above the input in the docked log (and in the Log tab on
  phones), plus the travel-destination marker on the map stage.

## Phase 2 (AI players, later)

The model may propose up to two extra free-text chips per reply, in a fenced marker the
sanitizers strip from the prose. They are sent as typed actions when clicked. Engine chips
always come first, and an AI chip that duplicates an engine chip is dropped.

## Open questions

- The exact map treatment for travel chips (a pulsing ring on the destination, or a small
  flag with the chip's label).
- Whether rule 7 should use a fixed HP threshold (for example, any hero below 50%) or
  `getHPStatus` bands.
