# Feature: Factions & Reputation

Give the world memory: let the party's actions earn **standing** with named **factions**, and
have that standing **change how the world treats them** (NPC tone, shop prices, who turns
hostile). Today there is a half-wired hook: encounters already declare which factions an
outcome affects, the resolver already returns those deltas, and the encounter modal already
**displays** them as "Reputation Changes" - but nothing is ever **stored** or **consumed**.
The number flashes on screen once and is lost. This feature finishes that hook into a real
system.

## Audit: the existing `affectedFactions` hook (what's already there)

The dangling chain, end to end:

1. **Declared** in `src/data/encounters/baseEncounters.js` only. Exactly **two** encounters
   carry `affectedFactions`, keyed by outcome tier:
   - `bandit_roadblock`:
     ```js
     affectedFactions: {
       criticalSuccess: { 'Merchant Guild': 2, 'Bandit Clans': -2 },
       success:         { 'Merchant Guild': 1, 'Bandit Clans': -1 },
       failure:         { 'Merchant Guild': -1 },
       criticalFailure: { 'Bandit Clans': 1 }
     }
     ```
   - `traveling_merchant`:
     ```js
     affectedFactions: {
       criticalSuccess: { 'Merchant Guild': 2 },
       success:         { 'Merchant Guild': 1 }
     }
     ```
   No other encounter file (`caveEncounters`, `wildernessEncounters`, `townEncounters`,
   `mountainEncounters`, `ruinsEncounters`, `groveEncounters`, `environmentalEncounters`)
   declares any. (`wandering_minstrel` and `lost_child` narrate reputation in prose but carry
   no structured data.)
2. **Returned** by `src/utils/encounterResolver.js` (line ~93):
   `affectedFactions: encounter.affectedFactions?.[outcomeTier] || null`. Correct and already
   tier-aware.
3. **Displayed** by `src/components/EncounterActionModal.js` (~line 803) under a "Reputation
   Changes" heading, and mocked in the debug page `src/pages/EncounterModalStates.js`.
4. **Consumed: NOWHERE.** `Game.js#handleEncounterResolve` (line ~736) receives the full
   `result` and applies party HP / loot / milestones, but never reads `result.affectedFactions`.
   There is no reputation field on the save, no registry of faction IDs, no UI standing panel.

**Two factions exist in data:** `'Merchant Guild'` (positive for protecting trade / dealing
fairly) and `'Bandit Clans'` (negative when you beat bandits, positive when they rob you).
They are referenced **by display string**, not by a stable ID - a wart this feature should fix
(see Data model).

**Recommendation:** finish the hook rather than remove it. The data, resolver return, and
display UI are already built; only persistence + consequences are missing, and the payoff
(a world that reacts) is high. Removal would mean deleting working UI and a sensible content
pattern. This doc assumes we keep and complete it.

## Player-facing behaviour

- After an encounter whose outcome touches a faction, the result modal keeps showing the
  "Reputation Changes" line (already built) - but now the change **persists** for the rest of
  the campaign.
- A **Reputation panel** (in the Hero/character modal, or a small standalone modal) lists each
  faction the party has interacted with, its current standing as a **named band** (e.g.
  *Hostile / Disliked / Neutral / Liked / Allied*) plus the raw number.
- Standing **changes how the world reacts** (MVP-gated below): NPCs of a faction speak warmer
  or colder, a faction you are Liked/Allied with charges you less (and pays more for sells),
  and a faction you are Hostile with may turn its road encounters against you.
- Factions you have never affected default to **Neutral** and are not shown until first touched.

## Reputation data model

- **Standing scale:** integer per faction, clamped to **[-100, +100]**, `0` = Neutral. Encounter
  deltas are small (±1, ±2); apply a content multiplier (`STANDING_STEP`, default `5`) when
  banking a delta so a clean win moves the needle a visible amount and a few interactions cross
  a band. Bands:
  | Band | Range |
  |---|---|
  | Hostile | `-100 .. -60` |
  | Disliked | `-59 .. -20` |
  | Neutral | `-19 .. +19` |
  | Liked | `+20 .. +59` |
  | Allied | `+60 .. +100` |
- **Stable faction IDs.** Introduce a registry so we stop keying on display strings:
  - **NEW `src/data/factions.js`** - `FACTIONS = { merchant_guild: { id, name, blurb,
    color/icon }, bandit_clans: {...} }` and a `resolveFactionId(nameOrId)` that maps the
    legacy display strings (`'Merchant Guild'` → `merchant_guild`) so existing encounter data
    keeps working untouched. (Optionally normalise `baseEncounters.js` to IDs later; not
    required for MVP because `resolveFactionId` bridges it.)
- **Where it lives on the save:** `settings.reputation`, a flat map `{ [factionId]: number }`.
  This mirrors `settings.sideQuests` exactly: `settings` is the persisted blob
  (`gameSettings: settingsRef.current` in `useGamePersistence.js`), so reputation rides the save
  with zero new plumbing in `saveController.js` / the DB proxy. Updated the same way side quests
  are: `setSettings(prev => ({ ...prev, reputation: applyDeltas(prev.reputation, deltas) }))`.
- **How it changes:**
  - **Encounters** - in `Game.js#handleEncounterResolve`, read `result.affectedFactions` (the
    already-returned per-tier delta map), run it through `reputationEngine.applyDeltas`, and
    `setSettings`. This is the one-line wiring that completes the dangling hook.
  - **Quests (Phase 3)** - `questEngine` completions can carry an optional `factionRewards`
    block, applied the same way on turn-in.
- **Initialisation:** `NewGame.js` seeds `reputation: {}` alongside `sideQuests` in
  `settingsData`. Empty map = everyone Neutral.

## Consequences of standing (and the MVP subset)

Ranked by value-per-effort. **MVP = Phase 1 + Phase 2.**

1. **Persist + display (Phase 1, MVP core).** Bank the deltas and show standing. Without this,
   nothing below can exist. Low effort, finishes the hook, immediately visible.
2. **NPC reactions via the prompt (Phase 2, MVP).** Feed current standing into the AI context so
   the DM narrates NPCs reacting. Add a `formatReputationInfo(reputation)` helper in
   `promptComposer.js` (sibling to `formatPartyInfo` / `formatCampaignMilestones`) that emits a
   short line, e.g. `Faction standing: Merchant Guild (Allied), Bandit Clans (Hostile).`
   `useGameInteraction.js#generateResponse` already assembles party + milestone context; append
   this. Keep it advisory tone-shaping only - reputation must **not** drive mechanics through the
   model (combat/dice stay deterministic and AI-blind, per DM_PROTOCOL conventions).
3. **Shop pricing (Phase 2, MVP).** Standing with the commerce faction (`merchant_guild`) tilts
   prices: Liked/Allied → cheaper buys, better sells; Disliked/Hostile → surcharge. Add an
   optional `repMultiplier` arg to `buyPrice`/`sellPrice` in `shopController.js` (default `1`, so
   existing callers and tests are unchanged), and pass a multiplier derived from standing in
   `Game.js#handleBuy/handleSell`. Small, well-bounded (e.g. ±20%).
4. **Hostile encounters (Phase 3).** If standing with a faction is **Hostile**, bias that
   faction's road encounters toward combat outcomes / weight its spawns up. Touches encounter
   selection; defer.
5. **Quest / site access gating (Phase 3, stretch).** A faction-gated quest only becomes
   available at/above a band (`isQuestEligible` already exists in `questEngine` - add a
   `requiresStanding` predicate). Powerful but needs new content to be worth it; defer.

## Files (owned by this stream)

- **NEW `src/data/factions.js`** - `FACTIONS` registry (`merchant_guild`, `bandit_clans`),
  `resolveFactionId(nameOrId)` (bridges legacy display strings), `BANDS` table.
- **NEW `src/game/reputationEngine.js`** - PURE, testable:
  - `applyDeltas(reputation, deltaMap, step = STANDING_STEP)` → new clamped map (resolves IDs).
  - `getStanding(reputation, factionId)` → number (default `0`).
  - `getBand(value)` → `'neutral' | 'liked' | ...`.
  - `priceMultiplierFor(reputation, factionId)` → number around `1`.
  - `summarizeReputation(reputation)` → array of `{ id, name, value, band }` for UI/prompt.
- **NEW `src/components/ReputationPanel.js`** (or a section inside `HeroModal.js`) - read-only
  list from `summarizeReputation(settings.reputation)`.

## Coordinate (shared files - keep changes additive)

- **`src/pages/Game.js#handleEncounterResolve`** - ADD: `if (result.affectedFactions)
  setSettings(prev => ({ ...prev, reputation: applyDeltas(prev.reputation, result.affectedFactions) }))`.
  One block, alongside the existing milestone checks. Mirror `setSettings(prev => ({ ...prev,
  sideQuests: ... }))` already used at lines ~248/435/460.
- **`src/pages/NewGame.js`** - ADD `reputation: {}` to `settingsData` (next to `sideQuests`).
- **`src/game/promptComposer.js`** - ADD `formatReputationInfo`; **`useGameInteraction.js`** -
  append its output to the prompt context next to `formatPartyInfo`. Additive only.
- **`src/game/shopController.js`** - extend `buyPrice`/`sellPrice` with an optional default-`1`
  multiplier; **`BuildingModal.js` / `Game.js`** pass it. Do not change existing signatures'
  behaviour when the arg is omitted (protects current shop tests).
- **`src/utils/encounterResolver.js`** - **no change needed**; it already returns
  `affectedFactions`. Do not disturb the combat lane.
- **`src/components/EncounterActionModal.js`** - already displays the changes; leave as is (or
  swap the raw faction string for `FACTIONS[id].name` once IDs land).
- Thread the Reputation panel through the existing modal prop chain the same way `sideQuests` /
  `party` are threaded (`GameModals` → ...); additive props only.

## Tests

- **`src/game/reputationEngine.test.js`** - `applyDeltas` adds, accumulates, clamps at
  ±100, and resolves legacy display-string keys (`'Merchant Guild'`) to IDs; `getBand` boundary
  values; `priceMultiplierFor` returns `1` for Neutral / unknown faction and the expected
  discount/surcharge at Allied/Hostile; `summarizeReputation` omits never-touched factions.
- **`src/data/factions.test.js`** (optional) - `resolveFactionId` maps both the two legacy
  strings and passthrough IDs; unknown name returns a stable slug or null.
- **shopController** - one added case: a Liked multiplier lowers `buyPrice`, raises `sellPrice`;
  omitting the multiplier reproduces today's prices (back-compat guard).
- **Game integration (light)** - resolving `bandit_roadblock` at `success` leaves
  `settings.reputation.merchant_guild` increased and `bandit_clans` decreased.

## Back-compat

- Old saves have **no `settings.reputation`**. Every read goes through `reputationEngine`, which
  treats missing/`undefined` as `{}` → all factions **Neutral**. No migration, no data stamp
  needed (additive optional field, same pattern as `sideQuests` arriving on older saves).
- Encounter content is unchanged: `affectedFactions` data already ships; `resolveFactionId`
  absorbs the display-string keys so `baseEncounters.js` needs no edit for MVP.
- Renderers (panel, prompt line) must tolerate an empty/absent map and unknown faction IDs
  (fall back to Neutral / skip), consistent with the repo's "tolerate missing fields" rule.

## Non-goals

- Faction-vs-faction simulation / dynamic faction relationships (helping A auto-hurts B beyond
  what individual encounters already encode).
- Membership, ranks, titles, or faction-specific questlines/storylines as a content system.
- Reputation decay over time, or per-town/regional reputation (standing is global per faction).
- Reputation driving combat math or dice (stays deterministic; reputation only shapes prices,
  prose, and availability).
- New faction art/assets, new items, or new encounters beyond wiring the existing two.

## Phased rollout

- **Phase 1 (finish the hook):** `factions.js` + `reputationEngine.js` + persist deltas in
  `handleEncounterResolve` + `reputation: {}` init + Reputation panel. World now *remembers*.
- **Phase 2 (MVP consequences):** prompt-fed NPC reactions + shop pricing tied to
  `merchant_guild`. World now *reacts*.
- **Phase 3 (depth):** hostile-encounter biasing for Hostile factions; faction-gated quests
  (`requiresStanding`); broaden `affectedFactions` coverage across the other encounter files and
  add 1-2 more factions (e.g. a Town Watch / a religious Order) to the registry.

## Open questions for the human

1. **Standing magnitude:** is `STANDING_STEP = 5` on a [-100, 100] scale the right feel, or do
   you want raw ±1/±2 deltas on a tighter scale (e.g. [-10, 10])? This sets how many encounters
   it takes to cross a band.
2. **Faction roster:** keep just the two implied factions for MVP, or define a small canonical
   set now (Merchant Guild, Bandit Clans, Town Watch, a religious Order) so content authors have
   targets?
3. **Reputation panel home:** new standalone modal via `ModalContext`, or a section inside the
   existing Hero/character modal (less plumbing)?
4. **Shop pricing scope:** should only `merchant_guild` standing move prices, or should a
   blacksmith/alchemist map to their own faction later?
5. **Legacy keys:** bridge display strings with `resolveFactionId` indefinitely, or do a one-time
   normalisation of `baseEncounters.js` to IDs as part of Phase 1?
6. **Hostility consequences:** for a Hostile faction, is "bias road encounters toward combat"
   acceptable, or do you only want softer (price + prose) consequences to avoid punishing players
   too hard?

## Verify

`CI=true npx react-scripts test --watchAll=false` and `CI=false npx react-scripts build` both
green. Do NOT commit or push.
