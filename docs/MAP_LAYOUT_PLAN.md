# Map & Adventure Log Layout: promote the map to the main stage

Status: **Brainstorm / proposed, HIGH PRIORITY (2026-07-17). No code yet.** Tracks
`OUTSTANDING_ISSUES.md` #84. Sibling of the #79 open-play combat rework
([COMBAT_UX_PLAN.md](COMBAT_UX_PLAN.md)) and the in-app half of #82
([UI redesign], Track B): all three want the same answer to "what is the primary
surface of this game?". Presentation only; no engine, save, or AI-contract changes.

---

## 1. The problem (maintainer, 2026-07-17)

Player time concentrated into the map: click-to-move (#25), encounters, towns, sites,
quest buildings, milestone POIs all launch from it. It is the home of the core gameplay
loop. But structurally it is still a **modal**: a centered overlay (`MapModal.js`,
`.map-modal-content`, capped `min(96vw, 1100px)` x `92vh`) floating over a chat-first
page. Meanwhile the chat panel (`GameMainPanel.js`: header, conversation, input) owns
the whole screen, yet since the smart-narration rework it is mostly a **narration feed**
(local movement lines, AI on Look-around/free-text) with occasional interactivity.

The layout is inverted relative to how the game is actually played:

- **The map is the stage but lives in a popup.** The interactive surface gets modal
  ergonomics: it must be opened, it can be accidentally closed, and the encounter
  conflict rules force close/reopen churn (`reopenMapAfterEncounterRef` at 9 sites in
  `Game.js`, `encounter` group auto-closing `navigation`).
- **The overlay hides the log it feeds.** Every move appends a narration line the
  player cannot see while the map is open. Narration and movement are simultaneous
  activities in play, but mutually exclusive on screen.
- **The chat's prominence oversells typing.** Free-text is a real feature but no longer
  the primary verb; the layout says "type here" when the game mostly wants "click the
  map".

## 2. Current-state facts that constrain the redesign

- MapModal is one of the two remaining **boolean-state modals** (with BuildingModal),
  deliberately left out of ModalContext (#52 decision) because click-to-move-while-open
  depends on Game.js's close/reopen-around-encounters flow. That decision was made
  *within* the modal paradigm; a docked map supersedes its premise rather than
  contradicting it.
- The map already stays open while travelling and auto-reopens after encounters; the
  guided tour teaches "open the map and click a tile". We already fight the modal to
  make it behave like a persistent pane.
- Town/site maps (`TownMapDisplay`, `SiteMapDisplay`) render through the same modal and
  inherit whatever we decide. `siteNotice` (#56) exists precisely because grants were
  invisible behind the fullscreen map: another symptom of log-vs-map mutual exclusion.
- Larger worlds (#60/#61) shipped a viewport + zoom for big grids; a docked pane needs
  the same viewport machinery at smaller sizes.
- #79 Thread C wants combat rendered inline on the main panel. If the map is docked,
  "the main panel" and "where combat happens" should be the same stage.

## 3. Options

**A. Two-pane workspace (recommended direction).** Desktop: map docked as the primary
pane (left/center, majority width), Adventure Log as a persistent side pane (right or
bottom) with the input box attached to it. The map stops being a modal entirely; the
close/reopen bookkeeping and the `encounter`-closes-`navigation` rule for the map
dissolve. Narration lands beside the map as you move (finally simultaneously visible).
Combat (#79 Thread C) renders on the map pane's stage or as a takeover of it.

**B. Persistent mini-map + expandable full map.** Lighter: a small always-visible map
dock in the main panel (position, nearby tiles, quest pins) with a click-to-expand full
view (modal or fullscreen). Keeps the current architecture; fixes prominence but not
the log-vs-map exclusion while the full map is open.

**C. Non-blocking slide-over.** Keep the modal machinery but reposition: map as a
side sheet that leaves the log visible and readable. Cheapest; solves the visibility
symptom, not the "stage in a popup" structure, and the churn bookkeeping stays.

**Mobile (all options):** stacked, tab-or-swipe between Map and Log (competitors are
mobile-first; #82 flags responsive as table stakes). The two-pane layout collapses to
tabs below a width breakpoint, so option A subsumes the mobile answer.

## 4. What a docked map dissolves (the payoff beyond looks)

- The 9-site `reopenMapAfterEncounterRef` dance and its `setTimeout` FocusTrap hacks
  (shared complaint with #79 §2).
- The "map accidentally closed, player lost" onboarding failure mode (#25's origin).
- `siteNotice`-style duplication: in-modal mirrors of log events exist only because the
  log is hidden; with a visible log the mirror becomes a highlight, not a channel.
- The #52 map-standalone carve-out: with no map modal, the Adventure Book hub vs map
  tension disappears.

## 5. Suggested phasing

1. **Layout mockups first** (fold into the #82 design pass so the game screen and the
   marketing site move together visually; the private UI plan owns the aesthetics, this
   doc owns the structure).
2. **Spike the two-pane layout behind a debug route** (same proving pattern as #79's
   open-play spike and the tileset/world-art pages): real `WorldMapDisplay` +
   real log side by side, no modal.
3. **Migrate**: `MapModal` content moves into the docked pane; retire the boolean
   state, the reopen bookkeeping, and the map's role in modal conflict rules. Town and
   site maps ride along. BuildingModal and transactional modals stay modals.
4. **Converge with #79 Thread C**: combat renders on the same stage instead of the
   `encounterAction` overlay (sequenced after the `useEncounterFight` extraction).

## 6. Open questions

1. Which pane gets the width majority, and is the log right-docked or bottom-docked?
   (Right-docked reads like a chronicle; bottom-docked preserves map width for big
   worlds.)
2. Where does free-text input live: attached to the log (chronicle model) or as a
   floating command bar (game-console model)?
3. Does a fullscreen map view survive as an option (large worlds at max zoom-out may
   want it), and is it a toggle rather than a modal?
4. Minimum desktop viewport for two panes before collapsing to tabs?
5. Does the header Map button become a pane-focus/expand control, and what happens to
   the guided tour steps that teach the modal?
6. Interaction with the Adventure Book hub: does the log pane absorb any of its tabs
   (e.g. quests-at-a-glance), or stay pure narration?

## 7. Related docs

- [COMBAT_UX_PLAN.md](COMBAT_UX_PLAN.md) (#79): shares the "stage, not overlay"
  thesis; the keystone `useEncounterFight` refactor is unaffected by this doc and can
  proceed first.
- #82 (private `docs/private/UI_REDESIGN_PLAN.md`): Track B owns in-app visual polish;
  this doc owns the structural layout decision.
- [TIERED_NARRATION_PLAN.md](TIERED_NARRATION_PLAN.md): the smart-narration rework
  that turned the chat into a feed (the trigger for this rethink).
- [LARGER_WORLDS_PLAN.md](LARGER_WORLDS_PLAN.md): viewport/zoom machinery a docked
  pane reuses.
