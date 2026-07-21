# Combat UX Plan: Animations, Modal Refine, and Open-Play Rework

Status: **Direction decided (2026-07-21 playtest); build in progress.** Tracks
`OUTSTANDING_ISSUES.md` #79. Combat *animations* are the combat-specific slice of the
game-feel work ([GAME_FEEL_PLAN.md](GAME_FEEL_PLAN.md), #78).

**Progress since the 2026-07-16 brainstorm:**
- §4 keystone **done**: the headless fight flow is extracted into
  `src/hooks/useEncounterFight.js` (+ test); `EncounterActionModal` renders over it.
- `EncounterActionModalSimple.js` dead code **deleted**.
- Thread B (modal refine) **done & merged**: dropped the victory interstitial, inline item
  tray (killed the zIndex-4000 modal-in-a-modal), unified flee gating (branch
  `refactor/combat-modal-thread-b`, merged to master — stale, safe to delete).
- The end-state direction is now decided — see [§0 Decisions locked](#0-decisions-locked-2026-07-21) below.

**Scope: presentation and flow only.** The combat *mechanics* (deterministic d20,
Lead+Support, multi-round boss fights, damage, rewards) are owned by
[ENCOUNTER_SYSTEM.md](ENCOUNTER_SYSTEM.md) and stay exactly as they are. Nothing here
changes an outcome; same determinism boundary as tile art and the #76 narration contract.

Three related threads the maintainer raised, smallest to largest:

1. **Combat animations** (juice).
2. **Refine the combat modal** (it is clunky).
3. **Rework combat away from modals → "open play", more like a TTRPG.**

The important finding: all three share one enabling refactor (§4).

---

## 0. Decisions locked (2026-07-21)

From a playtest-driven design pass. These resolve the modal-vs-open-play question in §7 and
pin the end-state. With §4 (keystone) and Thread B (modal refine) already merged, the
remaining work is re-homing the refined panel onto the map (see §0 direction below).

**Direction: Thread C (open play), in a MAP-CONTEXT HUD flavor.** Combat is neither a
fullscreen takeover nor a centered dialog. The existing map (site / POI / world tile) stays
on screen as the combat backdrop; a docked combat HUD renders over it (party + enemy status,
HP bars, round log, roll feed, action bar). This answers §5C's "where is the map during a
fight" (the map IS the surface) and reuses `SiteMapDisplay` — no separate combat sub-map is
generated or persisted (respects "maps generated once, never regenerated").

**Terminology:** "modal" and "overlay" are the same mechanism (a focus-trapping layer via
`ModalContext`); the only real choice was layout, and it is the map-context HUD above.

**Control: player drives the Lead, party auto-supports.** Mechanics unchanged (Lead+Support,
single d20 per round). Each round the player picks *which hero leads* (plus item / flee);
every other living hero auto-contributes its support bonus. Still "visualize-only" for
balance (no new damage model, DCs unchanged; the sim assumes a sensible lead). The one
engine-adjacent change is stepping `useEncounterFight` round-by-round so the player can choose
between rounds — the phase machine already models the states.

**One enemy, always.** Combat is party-vs-ONE-enemy (even `wolf_pack` is a single entity with
one HP pool). No multi-target combat, no target selection — the HUD layout is fixed.

**Ceremony is threat-scaled (tentative).** Trivial fights **auto-resolve** (one tap / compact
result), keyed off `threat.js` relative-threat tiers; only real/boss fights open the full
stepped HUD. Rationale: a site throws many trash mobs and a full lead-picker on every rat is a
chore. Start with auto-resolve for trash; tune by feel.

**Flee: keep** the existing disengage + `fleeCooldown`, surfaced as a HUD button.

**Migration: boss-fights-first.** The map-context HUD takes over the multi-round Lead+Support
boss fights first (where the "I'm fighting alone" pain lives). Trash encounters keep the
lightweight / auto-resolve path until later.

**Out of scope:** `encounterController`'s `narrative_*` (non-combat) flows keep their normal
modal; only combat flows enter the HUD.

---

## 1. How combat works today (accurate current-state map)

**Two-modal chain (ModalContext):**
- `encounterInfo` (`EncounterModal.js`, ~145 lines, group `navigation`): the *arrival /
  location* modal (settlement/POI with Enter/Gather/Search and a "Confront {boss}"
  button). It is the pre-combat gateway, not the fight. Confront → closes this, opens
  `encounterAction`.
- `encounterAction` (`EncounterActionModal.js`, **~1440 lines**, group `encounter`): the
  actual fight. One mega-component holding both the UI and the fight's control flow.

`EncounterActionModalSimple.js` is **dead code** (imported nowhere but debug); should be
deleted.

**Engine underneath is pure and deterministic** (no React): `encounterResolver.js`
(single d20 check, outcome tier, damage, loot; narration is the authored
`consequences[tier]` string, no LLM call), `multiRoundEncounter.js` (boss rounds,
Lead+Support, flat enemy damage per outcome, morale/advantage), `encounterController.js`
(reward/penalty application, flee). `Game.js` `handleEncounterResolve` applies rewards +
milestone/codex checks + reopens the map.

**A single fight is a multi-step wizard inside the one modal:** formation/Lead pick (if
party > 1) → initiative (15% override) → action choice → resolving spinner → per-round
result card (dice breakdown, two damage panels, morale/advantage bars, lead-swap banner)
→ "Fight!" / "Choose Action" loop → victory/defeat interstitial → final result card →
"Continue Journey". Plus an **item picker that is a modal-inside-the-modal** (raw
`position:fixed`, zIndex 4000, sidesteps ModalContext entirely).

**Animation today is almost nothing** (`encounters.css`): one `@keyframes spin` (the
resolving spinner) and a few width/transform transitions (HP bar, morale bar, action-row
hover). No dice, hit, or damage-number animation.

---

## 2. Why it feels clunky (concrete)

- **One ~1440-line component** with 15+ `useState`/`useRef` hooks driving a hand-written
  phase machine via nested JSX ternaries. Every fight variant shares one render tree.
- **Modal open/close churn.** `CONFLICT_RULES.encounter` auto-closes the `navigation`
  group, so opening a fight closes the map, which forces `reopenMapAfterEncounterRef`
  bookkeeping at 7+ call sites in `Game.js` and a manual map-reopen on resolve. There are
  `setTimeout(…, 0)` hacks to sequence modal teardown vs the quest-offer modal (two
  layer-1 FocusTraps collide).
- **Heavy per-turn UX.** A multi-round turn is click → spinner → full result card →
  click "Fight!"/"Choose Action" → repeat, for what is mechanically one d20. Extra
  "Claim Victory" / "Retreat" interstitials add clicks before the final card.
- **Latency theater.** `handleAction`/`resolveRound` are `async` with a "Resolving…"
  spinner, but resolution is fully local (no AI). The spinner adds a frame of churn for
  no wait.
- **Item use is a modal-in-a-modal** (zIndex 4000) that also silently spends the round.
- **Scar tissue:** two flee affordances (button vs injected "Tactical Retreat" action),
  dead `...Simple` component, scattered legacy-data conditionals in the render.

---

## 3. Does "open play / more like a TTRPG" fit us?

Mechanically we are **already TTRPG-shaped**: deterministic d20 checks, a chosen Lead
plus Supporting party members, multi-round boss fights, authored consequence prose. The
"open play" wish is about **presentation**, not rules: instead of a fullscreen modal that
hijacks the screen and marches the player through a wizard, render combat **inline in the
main game flow**, so a fight reads like a continuous session at the table (narration in
the log + a compact, persistent action bar + party/enemy status), rather than a popup
with interstitials.

So the honest answer: yes it can fit, and it is a *presentation* change, not a combat-rules
change. The question is cost (§5).

---

## 4. The keystone: extract the fight flow (enables all three threads)

Today the engine (roll math, round state) is separable, but the **fight *flow* state is
trapped inside the modal** (the 15+ hooks and handlers: `handleAction`, `handleHeroConfirm`,
`handleNextRound`, `handleUseItemInCombat`, `resolveAndClose`, …). That entanglement is the
single obstacle to every improvement here.

**Step 0 for everything: lift the flow into a headless `useEncounterFight` hook (or a
reducer)** that owns the phase machine (`formation → initiative → action → resolving →
roundResult → final`) and exposes `{ state, dispatch }`, independent of `ModalShell`. Then:
- **Animations** attach to a clean state stream (phase/outcome/damage events) instead of
  being wired into a 1440-line render.
- **Modal refine** becomes re-skinning a thin view over the hook.
- **Open-play** becomes "render the same hook inline in the main panel" instead of in a
  modal, with no engine changes.

This refactor is low-risk (pure move of logic, behavior-preserving, coverable by the
existing `BossFightTest` / `EncounterVisualDebug` / `EncounterModalDebug` harnesses) and
is worth doing regardless of the final presentation decision.

---

## 5. The three threads

### Thread A — Combat animations (juice; slice of #78)
Attach points already exist in `encounters.css` / the render:
- **Dice:** animate `.dice-result` (roll-up / tumble on the 🎲 total) instead of it
  appearing instantly.
- **Outcome:** pop/shake `.outcome-badge` (crit-success flare, crit-failure shake).
- **Damage:** animate the 32px `.damage-amount` as a floating rising number; flash the
  target on a hit.
- **HP/morale bars:** the `.hp-bar-fill` / `.status-bar-fill` widths are already
  data-bound and transition on change (the readiest hook) — add color/impact pulses.
- Pair with SFX from #78 (dice rattle, per-outcome stingers, victory chime).
- Respect `prefers-reduced-motion` (snap to final state); keep it fast (a fight should
  feel *snappier*, not slower).

### Thread B — Refine the modal (near-term, keep the modal)
Lower-risk cleanup on top of the §4 refactor:
- Collapse the multi-step wizard into a **single persistent combat panel**: action bar +
  party/enemy status always visible; round results update in place instead of as separate
  cards + interstitials.
- **Kill the latency-theater spinner** (resolution is local; render the result directly).
- Remove the "Claim Victory" / "Retreat" interstitials; fold into the final card.
- Fix the **item-picker-in-a-modal** (make it an inline sub-panel of the combat view, not
  a zIndex-4000 raw overlay).
- Delete `EncounterActionModalSimple.js`; unify the two flee affordances; strip
  legacy-data conditionals.
- Reduce clicks-per-round toward one.

### Thread C — Open-play rework (larger, exploratory)
Render the `useEncounterFight` hook **inline in the main game panel** rather than a modal.
What it touches:
- Replace the `ModalShell` overlay (`encounterAction`) + the two interstitials + the
  nested item picker with an inline combat surface in `GameMainPanel`.
- Rework the ModalContext coupling: today combat *is* a stack entry that mutually excludes
  the map (`encounter closes navigation`), which is the source of the
  `reopenMapAfterEncounterRef` bookkeeping and the `setTimeout` FocusTrap hacks. Inline
  combat removes that mutual exclusion but needs a new answer for "where is the map during
  a fight" and for input focus/accessibility (no FocusTrap to lean on).
- Rethink map/position side-effects (`preEncounterPosRef`, site-mob repositioning) now
  that combat is not an overlay.

**Trade-offs.** Modal gives forced focus and a clean interstitial boundary; inline gives
continuity and far less open/close churn, at the cost of a busier main panel and new
focus/layout work. **Middle path:** a single docked combat panel (Thread B) already
removes most of the clunk without committing to full inline; open-play can be a follow-on.

---

## 6. Recommendation & phasing

1. **Refactor first (§4):** extract `useEncounterFight`. Behavior-preserving, unlocks the
   rest.
2. **Refine + animate (Threads A+B):** ship the collapsed single-panel fight with
   animations. This delivers most of the "less clunky + more pop" value at low risk,
   without deciding the modal-vs-inline question.
3. **Spike open-play (Thread C) behind a debug route** (reuse `EncounterVisualDebug`) to
   feel the inline experience before committing; then decide.

Do **not** start with Thread C: prove the refactor and capture the easy wins first.

---

## 7. Open questions

- ~~Modal-refine vs full open-play~~ **RESOLVED (§0, 2026-07-21):** open play, map-context
  HUD. Thread B's docked single-panel is now a stepping stone to it, not an alternative.
- How much combat animation before it slows the fight (turn-based players want speed).
- Threat threshold for auto-resolve vs full HUD (§0): which `threat.js` tier is the cutoff,
  and does auto-resolve still show a one-line result in the log?
- Free vs premium: animations/SFX split follows #78 (base polish likely free).
- Does open-play combat change how the AI narration line participates (it currently just
  posts the authored consequence to the log)?
- Accessibility of an inline combat surface without a modal FocusTrap.
