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

---

## 8. Mock-review answers (maintainer + #82 mock session, 2026-07-18)

The #82 Quick Start mock's step-3 "map as the stage" screen is effectively a first draft
of Option A; reviewing it settled several open questions:

- **Multiple heroes (new):** the sidebar hero card generalizes to a **party strip** (lead
  portrait large, companion chips beneath; click-through to the Adventure Book Party tab).
  The **map keeps ONE marker** wearing the lead's portrait: the party is a single token in
  the world, and lead/support only matters at encounter time (existing formation phase).
  Quick Start's solo pregen is mechanically honest (t1 is solo-tuned); parties come from
  the classic HeroSelection flow, and later from companions (FEATURE_COMPANIONS).
- **Map size (open Q1, partially):** map gets the width majority and derives tile size
  from its container (reusing the #61 viewport/zoom machinery); a **fullscreen toggle,
  not a modal** (settles open Q3).
- **Log placement (open Q1/Q6):** desktop = **persistent right pane with the input
  attached** (a tab would recreate the map-hides-log exclusion this plan exists to fix);
  mobile = Map | Log **tabs** (the pane collapse). Suggested actions render as **chips
  above the log input** (narrative verbs live with the narrative pane), which is also
  where the mock's "On the map" buttons land.
- **Chrome (new):** other in-game buttons move to a slim **left icon rail** (Adventure
  Book, Party/Inventory, Settings, account), completing a rail + stage + log triptych;
  the header Map button dissolves (open Q5, partially: tour steps still need rework).
  Rail icons are a natural home for #78's reactive-glow badges (e.g. new codex entry).

Layout sketch:

    +----+---------------------------+----------------+
    |rail|        THE MAP            | ADVENTURE LOG  |
    |icon|      (the stage)          |  ...narration  |
    |icon|  party strip (lead large, |  [action chips]|
    |    |  companion chips)         |  [input______] |
    +----+---------------------------+----------------+
    mobile: rail -> bottom bar; panes -> Map | Log tabs

## 9. Log placement: the MMO-convention discussion (2026-07-18)

Maintainer concern: a right-docked input is off the eye path ("typing into a squashed box
not quite in the line of sight"); bottom-docked is in the eye path but halves the map;
MMOs put chat bottom-left as a movable overlay over a fullscreen world.

Analysis that resolved it:

- **MMO input is peripheral BY DESIGN**: the world is the primary verb, typing is
  summoned by intent (Enter focuses chat). Peripheral placement states the verb
  hierarchy, which matches this game exactly (map primary, free-text occasional).
  The eye-path concern applies to *reading*, not typing.
- **Our log is prose, not a chat ticker.** MMO chat overlays survive transparency
  because lines are short. DungeonGPT narration is literary paragraphs: it needs a
  stable, solid ~45-65ch reading column. Overlay-on-map and full-width bottom panes
  are both typographically wrong for it.
- **Our map has a natural size; MMO worlds do not.** A tile world at sane zoom leaves
  spare desktop width, which is exactly where the chronicle column fits. The fullscreen
  toggle covers the big-world case.
- Bottom-right input = Discord/Slack/messenger muscle memory; not actually unusual.

**Direction (settles open Q1/Q2, pending final sign-off):**
1. Default: right-docked chronicle pane, input at its bottom, suggested-action chips
   above the input.
2. **Collapsible log** (chevron): map takes ~full screen (MMO-immersion mode); while
   collapsed, key events surface as transient toasts (the pattern already proven in the
   #82 Quick Start mock; the honest descendant of siteNotice).
3. **Enter summons the input** from anywhere (focuses it; slides the log open if
   collapsed) — the MMO pattern that makes peripheral placement costless.
4. Later, cheap nod to MMO movability: a dock-position **setting** (right | bottom),
   two CSS layouts + one preference. No free drag/resize (that is a window manager).
5. Mobile: Map | Log tabs (unchanged).

## 10. Auto-travel & interruptions (maintainer questions, 2026-07-18)

The workspace mock's scripted journey (real `findPath()` route, walked tile by tile)
surfaced the travel design questions. Direction:

- **Pass-through vs. enter.** Auto-travel treats intermediate tiles as *passed through*:
  narrated (localNarrator biome pools underfoot), encounter-rollable, but **no arrival
  modals**. Only the chosen **destination** gets the full arrival treatment (town arrival
  view / building entry). Popping the mountain/POI modal for every tile crossed would
  destroy the flow the docked map exists to create.
- **Events interrupt; terrain narrates.** "Real terrain to cross" is honored by (a)
  biome-appropriate narration as the ground changes, and (b) **encounters spawning from
  the biome underfoot** (forest/hills/mountain tables), which PAUSE travel, resolve, and
  resume. Mock proves the shape with an auto-resolved d20 beat (success and fail-forward
  variants); the full interactive version is #79's inline-combat stage.
- **Discoveries** (a cave mouth, a milestone POI on the route) should interrupt with a
  lightweight choice ("Investigate / Press on"), not a modal takeover. Not in the mock yet.
- **Travel pace:** ~750ms/tile felt right in the mock (420ms read as teleporting across
  the world). Real value tunable; long journeys may want a 2x speed control.
- **Destination affordances open views:** "Find Captain Ulric" should open the **town
  map** (Briarwood) — the town/site views render inside the same stage (the pane IS the
  viewport for world/town/site alike, as §3's migration implies). Mock currently stubs
  this with a notice; porting `townMapGenerator`+`townTileArt` into the mock is the next
  fidelity step if wanted.
- **Auto-path vs one-tile-per-click (flagged for the real game):** the mock's
  click-a-destination-and-walk pattern is a change from the live game's one-tile-per-move
  loop; adopting it is a gameplay decision (movement costs/encounter rates per tile still
  apply — auto-path just batches the clicks, it must not batch away the risk).
