# Game Feel Plan: Audio & Visual Juice

Status: **Brainstorm / proposed** (2026-07-16). Living doc, seeded from a YouTube "game
juice" talk; expect more ideas added. No code yet. Tracks `OUTSTANDING_ISSUES.md` #78.

Goal: make the game *pop* without touching mechanics. Everything here is a **pure view /
presentation layer** over the existing deterministic engine (same discipline as tile art
and the #76 narration contract: presentation never changes outcomes). All of it is
optional, toggleable, and accessibility-aware.

**Baseline fact:** there is **no audio in the codebase today** (no audio code, no audio
assets). This is greenfield. Visual side already has modest CSS animation infra (~12
keyframe blocks across `src/styles/`), so reactive glow/border effects are cheap to add.

---

## 1. The four idea buckets (from the video) + does it fit a turn-based RPG?

We are not an action game, so the honest question for each is "does it fit?".

| Bucket | Fit for us | Verdict |
|---|---|---|
| **Music** | Strong. Ambient exploration / town / combat / boss / victory themes. | **Yes.** Mainly a Members+ benefit. |
| **Reactive sounds (SFX)** | Strong, *because* we are turn-based: every SFX maps to a discrete, deliberate event (a die roll, a hit, a level-up), which reads *better* than in a noisy action game. | **Yes.** Base polish, mostly free. |
| **Reactive particles** | Weak/selective. Full particle systems are action-game juice and web-heavy. But *light* accents (a level-up sparkle, floating "+50 XP" text, a rare-loot shimmer) fit. | **Selective / light.** |
| **Reactive glow / border on buttons** | Strong and cheap (CSS). Turn-based means we can *guide the eye*: pulse the button whose turn it is, glow the Talk button when a milestone NPC is present, red danger border in a boss fight. | **Yes.** High value, low cost. Base polish. |

---

## 2. Map the game: where each effect lands

Surfaces (from the current app) and the juice that fits each. This is the "map out the
game" pass; refine as we build.

### World / town navigation
- **Music:** ambient exploration loop (world map); a distinct town theme on entering a
  settlement.
- **SFX:** footstep/move tick on tile move (subtle, low volume, turn-based so one per
  move), gate/door on town or building entry.
- **Glow:** the movement-destination tile or the primary "move" affordance can pulse.

### Encounter / combat modal (`EncounterModal`, `EncounterActionModal`)
Highest-value surface: discrete outcomes are perfect SFX/glow anchors.
- **SFX:** dice-roll rattle on the d20 resolution; distinct stingers for
  `criticalSuccess` / `success` / `failure` / `criticalFailure`; boss multi-round hit
  cues; a victory chime on defeat.
- **Music:** combat theme on encounter start, boss theme for `encounterTier: 'boss'`,
  resolve back to ambient on exit.
- **Glow/border:** red "danger" border while a boss `dealsDamage` fight is live; pulse
  the currently-actionable button; low-HP → red vignette on the party HUD.
- **Particles (light):** a hit flash / spark on success, screen-edge nothing heavy.

### Progression & rewards (level-up, loot, milestones, codex, quests)
Event hooks already exist: `progressionSystem.js` (level up), `milestoneEngine.js`
(completion), `rewardNarrator.js` (XP/gold/item lines), codex discovery, quest turn-in.
- **SFX:** level-up fanfare; milestone-complete chime; coin jingle on gold; item pickup;
  the existing "📚 New codex entry" line gets a soft cue.
- **Particles (light):** level-up sparkle burst; floating "+50 XP / +100 gold" numbers
  rising off the source; a shimmer on rare/very-rare/legendary loot (rarity already
  known).
- **Glow:** pulse the Adventure Book button when a new codex entry / quest update lands.

### Modals & in-game buttons (`ModalShell`, `GameMainPanel`, Adventure Book tabs)
- **SFX:** soft open/close whoosh on modal show/hide; subtle click on primary actions
  (keep restrained, no click on everything).
- **Glow/border:** the Talk button glows when a milestone/quest NPC is present; the
  primary action pulses when it is the player's turn / awaiting input; a tab badge pulses
  when its content changed.

### High-stakes beats (hero downed / death, campaign complete)
- **SFX + music:** a somber sting on a downed hero; a triumphant cue on campaign
  completion (pairs with the #76 scripted-beat text).
- Screen treatment: desaturate/red vignette on downed; keep tasteful.

---

## 3. Gating (proposal, open for decision)

Following the tier ladder (free < member < premium < elite; `entitlements.js`):

- **Free / base polish:** light SFX pack, button glow/border cues, floating reward text,
  reduced-motion respect. These improve *usability and feel* and should not be paywalled.
- **Members+ (premium):** the full **music** soundtrack (multiple themes), and richer
  particle/effect flourishes. Music is the headline premium sensory upgrade (matches the
  maintainer's "music mainly a premium/member feature").
- Gate music playback with the same `isPremium()` / `hasTier('member')` check used
  elsewhere; free tier gets silence or a single low-key ambient bed (decision open).

Open decision: exact free/premium split for SFX vs music vs particles.

---

## 4. Cross-cutting requirements

- **Settings & controls:** master mute + separate Music / SFX volume sliders, persisted
  in `SettingsContext` (where theme/provider already live). A visible mute toggle in-game.
- **Browser autoplay policy:** audio can only start after a user gesture; start the audio
  context on first interaction (e.g. "Start Adventure"), never autoplay on load.
- **Accessibility:** honor `prefers-reduced-motion` (disable particles + heavy
  animation, keep static state); never rely on audio alone to convey game state (SFX
  augment the existing system lines, they do not replace them).
- **Performance:** effects are a pure view layer, must not block the turn loop or the
  deterministic engine; lazy-load audio; keep particle counts tiny; prefer CSS/Web
  Animations for glow over JS loops.
- **Assets:** audio lives in `public/assets/audio/` (real files, unlike the programmatic
  SVG tile art). Premium music is heavy, so lazy/stream it and keep it out of the initial
  bundle; consider serving premium audio through the worker/CDN gated by tier.
- **Determinism boundary:** none of this may influence outcomes. Effects *react to* engine
  events, they never feed back in (same rule as tile art and narration).

---

## 5. Suggested phasing

- **Phase 1 (cheap, free, high ROI):** reactive glow/border cues on in-game buttons +
  low-HP/boss danger states (CSS only, no assets). Respect reduced-motion.
- **Phase 2:** a small SFX manager + core event sounds (dice, outcomes, level-up,
  milestone, loot, modal). Volume/mute settings.
- **Phase 3:** light particles (level-up sparkle, floating reward numbers, rare-loot
  shimmer).
- **Phase 4 (premium):** music system with theme switching by context (ambient / town /
  combat / boss / victory), gated Members+.

---

## 6. Open questions / to brainstorm further

- Full free/premium split (§3).
- Sourcing: commission vs licensed music/SFX packs; budget; consistency of style with the
  fantasy tone.
- Do we want an in-house tiny audio manager or a small library (must stay self-hosted /
  CSP-safe)?
- Which surfaces are "too much" (avoid audio fatigue: not every click needs a sound).
- Mobile/perf budget for particles.
- More ideas from the source video to fold in here.
