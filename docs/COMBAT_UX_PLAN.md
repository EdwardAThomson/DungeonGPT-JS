# Combat UX Plan: Animations, Modal Refine, and Open-Play Rework

Status: **Brainstorm / proposed** (2026-07-16). No code yet. Tracks
`OUTSTANDING_ISSUES.md` #79. Combat *animations* are the combat-specific slice of the
game-feel work ([GAME_FEEL_PLAN.md](GAME_FEEL_PLAN.md), #78).

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

- Modal-refine vs full open-play: decide after the Thread B panel + the Thread C spike.
- How much combat animation before it slows the fight (turn-based players want speed).
- Free vs premium: animations/SFX split follows #78 (base polish likely free).
- Does open-play combat change how the AI narration line participates (it currently just
  posts the authored consequence to the log)?
- Accessibility of an inline combat surface without a modal FocusTrap.
