# Side-Quest UX Plan: objective clarity + Journal tab

Status: DESIGN ONLY (2026-07-03), no implementation scheduled yet.
Origin: playtest feedback — "side quests ask me to gather herbs or kill rats, but it
isn't clear how I do that", plus "side quests should get their own Journal tab".
Related: `FEATURE_SIDEQUEST_BACKFILL.md`, `FEATURE_QUEST_GIVERS.md`, issues #41/#42.

## Diagnosis: the mechanics exist; the communication doesn't

Verified against `src/game/questEngine.js`, `src/data/sideQuests.js`, `src/components/Modals.js`:

- **Counts are tracked** (`step.progress`, `trigger.count`) — but the journal never shows
  "2/3"; it shows only bare step text and a per-quest done-count.
- **Site objectives are fully wired**: `siteItem/siteCombat/siteLoc` steps inject a ❗
  objective into a cave/ruins site, and *accepting the quest reveals that site type on the
  world map, stickily* (`getRevealedSiteTypes`). But the accept message
  ("📜 New quest: …") **never tells the player a cave just appeared on their map** — the
  single biggest "how do I do this?" gap.
- **Bounty steps** (`trigger.enemy: 'any'`) complete on ANY wilderness victory — the text
  ("Defeat 3 foes in the wilds") doesn't say any foe counts, and no progress shows.
- **Gather steps** (`trigger.item + count`) complete via drops, site loot, or (since the
  2026-07-02 fix) buying the item — no hint tells the player any of these sources.
- **Turn-ins** surface only inside the right building (`getReadyTurnIns`); the journal
  doesn't say "ready — return to an inn".

## Design

### 1. Per-step "how" hints — derived from data, zero authoring

Render a secondary hint line under each active step (same visual language as the campaign
milestones' who/what/where sub-line):

| Step kind | Hint (derived from) |
|---|---|
| site-bound (`m.site`) | "In a cave — marked on your world map" (`m.site.type`) |
| gather (`trigger.item`+`count`) | "(1/3) · Found in the wilds; sold at the apothecary" — a small `describeItemSources(itemId)` helper computed from shopStock + site LOOT pools + encounter reward tables, so it is always accurate with no per-quest authoring |
| bounty (`enemy:'any'`+`count`) | "(2/3) · Any victory in the wilds counts" |
| turn-in | "Return to an inn or tavern" → when prerequisites done: "✅ Ready to turn in — visit an inn" |

Plus the **accept-time reveal toast**: when an accepted quest reveals a site type, append
"🗺️ A cave has been revealed on your world map." to the existing New-quest system message
(`Game.js` accept path). This one line probably resolves half the confusion on its own.

Explicitly NOT doing: a Gather-style button for side-quest gather steps (they are
location-less by design; sources + progress display suffice), and no new quest mechanics.

### 2. Journal tab for side quests

Split the Journal view into tabs (reuse the segmented tab pattern from
PartyInventoryModal's Items|Loadout): **📜 Campaign** | **🗺️ Side Quests (n)**.

- Campaign tab: the existing goal + milestone list, unchanged.
- Side Quests tab: the existing expandable quest cards, upgraded with the per-step
  progress + hint lines above, sorted **ready-to-turn-in → active → completed**
  (completed collapsed), with a count badge on the tab label (active quests).
- Note: the Journal modal already contains a second view (AI engine settings); the tab
  row must integrate with that existing view switch rather than nesting a second tab bar.

## Effort / risk

Small-to-medium, UI + one pure helper; no engine or data-shape changes, no save impact
(progress/reveal state already persists). `describeItemSources` is the only new logic and
is unit-testable in isolation.

## Open questions

- Should revealed quest sites get a visual ring/marker distinct from ordinary sites on
  the world map (beyond just being unhidden)?
- Should the side-quest OFFER modal (rumour) also preview the objective kind ("a cave
  expedition", "a bounty") before accepting?
