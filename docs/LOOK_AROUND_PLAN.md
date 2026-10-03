# Look around: tile features that light the button (#89)

Status: **Proposed, 2026-10-02. Not built.** The button move itself shipped (`c9f30a8`):
Look around left the top toolbar and sits above Send. This doc covers the next step,
deferred until the redesign PR (#82, draft PR #172) merges.

## The problem

Look around has a special purpose (it can spend an AI call, and it is how a parked
narrative-tier encounter, the "hook", reaches the player), but it looked like any other
toolbar button, so it was easy to click without thinking. Moving it next to Send fixed
the "looks like navigation" half. The other half is telling the player when a look is
worth it.

## Facts from the code (checked 2026-10-02)

- **Guests never get hooks.** For guests, or with narration off, a narrative-tier
  encounter skips Look around and opens straight away as the interactive fallback modal
  (`planWorldTileEncounterFlow` in `src/game/encounterController.js`,
  `narrative_fallback_modal`). Guest Look around only ever produces the local ambient
  line (`appendLocalAmbientNarrative` in `Game.js`). This is correct, not a bug.
- **Hooks are not rare for AI players.** About a 25% base chance of a random encounter
  per new tile (capped at 70% after a dry spell), and 32 of the 54 random encounters are
  narrative-tier. A parked hook survives one further move (`NARRATIVE_HOOK_PERSIST_MOVES`,
  with the "It may be worth a Look around" reminder line), then expires.

## Proposal: tile features derived from existing fields

Derived at view time from fields the world map already has, so no generator change, no
`mapVersion`, and old saves benefit too. Rates from a census of 40 generated 10x10 maps.
Towns, caves and ruins are excluded (they already have arrival modals); water is not
standable.

| Feature | Detection | Approx. per map | What a look gives |
|---|---|---|---|
| River ford | `hasPath && hasRiver` on the same tile | ~1 | the crossing |
| Crossroads | `pathDirection === 'INTERSECTION'` | ~1-2 | waymarkers, where each road leads (real town names) |
| Named peak | `mountainName && isFirstMountainInRange` | ~2 | the range by name, a vista |
| Hilltop | `poi === 'hills'` | ~4 | a view over the neighbouring tiles |
| River mouth | river tile adjacent to coast/lake | ~1 | where the river meets the water |
| Near a hidden place (optional) | adjacent to a cave or ruins | ~2-4 | faint signs, never naming it |

Deliberately excluded as too common (the button would always glow): plain riverbank
(~6% of tiles), shoreline (~24%), forest edges. Core five total ~1 lit tile in 10.

## Button states (highest wins)

| State | When | Look | Who |
|---|---|---|---|
| Busy | generating | disabled, "Looking..." | all |
| Hook waiting | a hook is parked on this tile | filled gold, gentle pulse, "Something stirs nearby..." | AI players |
| Hook, one move ago | hook still within its window | gold outline, "Look back..." | AI players |
| Feature | tile has a feature, not yet looked at | gold outline + dot, "Something catches your eye" | all |
| Idle | otherwise | quiet outline, "Look around" | all |
| Hidden | before the adventure starts | not shown | all |

## What a click does

- Guests: a deterministic, feature-specific line (new short templates per feature, using
  real nearby names). No feature: the current ambient line.
- AI players: the feature is added to the look prompt as context; a parked hook is still
  delivered with its action chips, as today.
- Looked-at feature tiles are recorded in an additive settings field so a reload does not
  relight them.

## Open decisions (maintainer)

1. Include "Near a hidden place"?
2. Should the hilltop also reveal the neighbouring tiles on the map now (first look with
   a mechanical payoff), or later?
3. One look per feature (idle tiles stay clickable for flavour), or no limit?
