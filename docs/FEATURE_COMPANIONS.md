# Feature: Companions (recruit / dismiss)

Let the party **grow and change mid-campaign**. Today the party is fixed at character
creation (`HeroSelection.js`, 1-4 heroes) and there is no way to add or drop members once
the adventure starts. This adds **companions**: hero-shaped party members you recruit in the
world (tavern hirelings, quest rewards), manage in the party sidebar, and dismiss.

The core design bet: a companion is **just a hero with `isCompanion: true`**. Combat, rest,
equipment, inventory, resurrect and persistence already iterate `selectedHeroes` as a plain
array, so a correctly-shaped companion appended to that array "just works" everywhere. The
real work is (a) a generator that produces a hero-shaped object, (b) one place that enforces
the party-size cap at runtime instead of only at creation, and (c) a recruit UI.

## Player-facing behaviour

- **Where you recruit:** at **tavern** / **inn** buildings, the building modal gains a
  **"Hire"** section (mirrors the Shops "Wares" section). It lists 1-3 available hirelings
  for that town with name, race, class, level, a short blurb, and a **gold cost**. Clicking
  **Hire** deducts gold from the party and appends the companion to the party.
- **Quest-reward companions:** a milestone / side-quest can grant a named companion as a
  reward (joins the party automatically with a system log line, no gold cost).
- **Party-size cap:** the total party (original heroes + companions) is capped at
  **`MAX_PARTY_SIZE = 6`** (creation stays 1-4; companions fill the remaining slots). Hire is
  disabled and shows "Party full" when at the cap.
- **Managing companions:** companions appear in the **PartySidebar** like any hero, with an
  `isCompanion` badge. Opening one in the **HeroModal** shows a **Dismiss** action (original
  heroes have no Dismiss). Dismissing removes them from the party after a confirm.
- **Downed companion:** identical to a downed hero today. At `currentHP === 0` they are
  `isDefeated` (greyed out in the sidebar, skipped by rest, excluded from forced-initiative
  in combat). They can be **resurrected** at a temple via the existing `onResurrect` path
  (cost spread across party gold), or dismissed. No permadeath-on-downed beyond what heroes
  already have. (Whether a companion's gear/inventory returns to the party on dismiss is an
  open question, see below.)

## Companion data model

Reuse the **hero shape** exactly so every downstream consumer is unchanged. A hero today is
built in `HeroCreation.js` and then `initializeHP()`'d in `HeroSelection.js`:

```
{
  heroId, heroName, heroGender, profilePicture,
  heroRace, heroClass, heroLevel, heroBackground, heroAlignment,
  stats: { Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma },
  maxHP, currentHP,            // from initializeHP() (CON-based, clamped 5..30)
  // lazily-defaulted, optional fields (read everywhere as `x || default`):
  // inventory: [itemKey], gold: 0, xp: 0, equipment: {}
}
```

A companion is the **same object plus markers**:

```
{ ...heroShape, isCompanion: true, recruitSource: 'tavern'|'quest', recruitedAt: <iso> }
```

Notes / gotchas that drive the generator design:

- **Field names matter.** Consumers read `heroName || characterName`, `heroClass`,
  `heroLevel`, `currentHP`/`maxHP`, `stats`, and `heroId || characterId`. A companion must
  use the **`hero*` field names**, not the NPC shape.
- **`npcGenerator.generateNPC()` is NOT directly usable.** Its output uses a different shape:
  `name` (not `heroName`), `class` (not `heroClass`), `hp: { current, max }` (not
  `currentHP`/`maxHP`), `id` (not `heroId`), and an `inventory` of **freeform strings**
  including coins as text (e.g. `"20 Gold Pieces"`). Use it (optionally) only as a **stat/name
  seed** and convert, or generate from `heroData.heroTemplates` directly. Do not append a raw
  NPC to `selectedHeroes`.
- **Inventory/gold must be game-mechanical**, not NPC freeform: `inventory` is item keys (for
  `inventorySystem`/equipment), `gold` is a number. Companions should start with `gold: 0`,
  a small themed starting `inventory` (existing `ITEM_CATALOG` keys only), `equipment: {}`,
  `xp: 0` (or XP matching their level), and `maxHP`/`currentHP` via `initializeHP()`.
- **Stable id:** generate `heroId` with `uuidv4()` so resurrect/inventory/use-item matching
  (`characterId === heroId`) works.

## Recruitment sources (concrete)

1. **Tavern hirelings (primary).** A new **`getTownHirelings(townName, seed)`** deterministically
   produces 1-3 hireling companions per town (seed from town name + world seed, same pattern
   as `populateTown`). Each hireling: random class from `heroData.heroClasses`, level near
   the party's effective level, a `heroTemplates`-derived stat spread, a portrait from
   `profilePictures` matching gender, and a gold cost scaled by level (e.g.
   `50 + level * 25`). Determinism means re-opening the tavern shows the same roster, and a
   hired one is removed from the offer list (track hired ids in settings).
2. **Quest-reward companions.** Story templates / milestones may carry a `companionReward`
   (a fixed, named, pre-authored companion). Granted on milestone/side-quest completion via
   the existing reward-application path, appended to the party.

## Integration points + where party size is hard-coded

A companion appended to `selectedHeroes` flows through these **unchanged** (verified):

- **Combat** — `EncounterActionModal.js` already branches on `party.length > 1` for hero
  selection, excludes `currentHP <= 0 || isDefeated` from forced initiative, and resolves via
  `applyEncounterOutcomeToParty({ party, result })` which targets `result.heroIndex` on an
  arbitrary-length array. `encounterResolver.js` operates on a single `character` and reads
  `stats`/`maxHP`/equipment — companion-agnostic.
- **Rest** — `onRest` in `Game.js` maps over `selectedHeroes`, skips `isDefeated`, applies
  `shortRest`/`longRest`. Works for any size.
- **Resurrect** — `onResurrect` in `Game.js` matches by `characterId || heroId`. Works.
- **Equipment / inventory** — per `FEATURE_EQUIPMENT.md`, gear rides on the hero object;
  `equipment` defaults to `{}`. Companions get equip slots for free.
- **Persistence** — `useGamePersistence.js` saves `selectedHeroes` wholesale into the
  conversation row; `saveController.buildSaveFingerprint` already hashes per-hero
  `hp/gold/xp/inv` over the whole array, so companion changes trigger autosave. No schema
  change.

**Party SIZE is assumed in exactly one user-facing place that must change:**

- `HeroSelection.js` hard-codes **4** in several spots (`selectedHeroes.length > 4`,
  `>= 4` at-limit, "of 4 selected", the `handleNext` guard). That cap governs *creation*
  and should stay (you still start with <=4). The **new** runtime cap for recruiting is a
  separate constant `MAX_PARTY_SIZE = 6` enforced in the recruit handler. Recommend a shared
  `src/data/partyConfig.js` exporting both `MAX_CREATION_PARTY = 4` and `MAX_PARTY_SIZE = 6`
  so the magic numbers live in one place.

**"Lead hero" `[0]` assumptions (NOT party-size, leave as-is):** `shopController` spends/credits
`party[0]`; `GameModals`/`Game.js` use `selectedHeroes[0]` for the header portrait, dice
check default character, and item-acquisition target. These treat index 0 as the lead and are
unaffected by adding companions at the end of the array. Recruiting should **append**, never
insert at 0.

## Files (owned by this stream)

- **NEW `src/data/partyConfig.js`** — `MAX_CREATION_PARTY`, `MAX_PARTY_SIZE`.
- **NEW `src/game/companionGenerator.js`** — PURE, testable:
  - `makeCompanion({ class, level, gender, name?, seed, source }) -> heroShape` (builds a
    valid hero object, runs the equivalent of `initializeHP`, sets `isCompanion`).
  - `getTownHirelings(townName, worldSeed, partyLevel, hiredIds) -> [companion]`.
  - `companionCost(companion) -> number`.
- **NEW `src/game/companionController.js`** — PURE party-mutation helpers (mirror
  `shopController`):
  - `canRecruit(party, cost) -> { ok, reason }` (checks `MAX_PARTY_SIZE` + affordability),
  - `recruitCompanion(party, companion, cost) -> { party, ok, reason }` (deduct gold, append),
  - `dismissCompanion(party, heroId) -> { party }` (only removes `isCompanion` members).
- **`src/components/BuildingModal.js`** — add the **"Hire"** section at tavern/inn (alongside
  existing Rumours / Completed Tasks / Wares; do not disturb them).
- **`src/components/HeroModal.js`** — add a **Dismiss** action shown only when
  `hero.isCompanion`.
- **`src/components/PartySidebar.js`** — render an `isCompanion` badge (additive; already
  maps the array).
- **`src/pages/Game.js`** — `handleRecruit(companion)` / `handleDismiss(heroId)` that call the
  controller + `setSelectedHeroes`, threaded to `BuildingModal` the same additive way
  `onBuy`/`onSell`/`onRest` already are (`GameModals` -> `MapModal` -> `TownMapDisplay` ->
  `BuildingModal`).

## Coordinate (shared files)

- `BuildingModal.js` and the prop chain already thread `onRest`, `onBuy`, `onSell`,
  `sideQuests`, `party`. Add `onRecruit`, `hirelings` (and reuse `party`) the **same way** —
  additive only.
- Use `inventorySystem` read-only (`addGold`, `ITEM_CATALOG`) for cost/gold; don't change its
  signatures. Reuse `healthSystem.initializeHP`. Reuse `heroData` (`heroClasses`,
  `heroTemplates`, `profilePictures`). Optionally seed names via `npcGenerator.generateName`
  but **build the hero object yourself** in `companionGenerator`.
- Do not insert companions at index 0 (preserve lead-hero semantics). Append only.

## UI

- **PartySidebar:** companion badge; downed companions greyed (existing `defeated` styling).
- **BuildingModal (tavern/inn) "Hire" section:** list of hirelings with portrait, name,
  race/class/level, blurb, cost; Hire button disabled when unaffordable or party full, with a
  reason ("Party full" / "Not enough gold").
- **HeroModal:** Dismiss button (companions only) behind a confirm; reuse `ModalContext`
  confirm pattern.

## Tests

- `companionGenerator.test.js` — `makeCompanion` returns a valid hero shape
  (`validateHero(..., { enforcePointBuy: false })` passes, has `currentHP`/`maxHP`,
  `isCompanion: true`); `getTownHirelings` is deterministic for the same seed and excludes
  `hiredIds`; cost scales with level.
- `companionController.test.js` — recruit appends + deducts gold; recruit blocked at
  `MAX_PARTY_SIZE` (party unchanged); recruit blocked when broke; dismiss removes the
  companion; dismiss refuses to remove a non-companion (original hero).
- Integration sanity: a generated companion appended to a party array survives a
  `longRest`/`shortRest` map and an `applyEncounterOutcomeToParty` call with its index.

## Back-compat

- **Existing saves are unchanged.** No companions, party identical to today. `isCompanion`
  is absent on old heroes; every check is `hero.isCompanion === true`, so they're treated as
  permanent heroes (no Dismiss, never auto-removed). Hireling rosters and `hiredIds` are new
  optional fields under `settings`; absent -> empty roster generated on demand.
- Companions persist automatically inside `selectedHeroes` (no save-schema migration).
- Renderers already tolerate the legacy `character*` field names; companions use `hero*`.

## Non-goals

- Companion **romance / approval / loyalty arcs**, banter, or relationship state.
- **AI-controlled companion tactics** (companions act via the same player-driven combat UI;
  no autonomous decision-making).
- Companion-specific quests, betrayal/leaving-on-their-own, or permadeath rules beyond the
  existing downed/resurrect flow.
- Per-companion levelling curves distinct from heroes (they use the same progression).
- New portrait / sprite art (reuse `profilePictures`).
- Restock timers / wandering recruiters (hireling roster is static per town per seed).

## Phased rollout

1. **Phase 1 - data + logic (no UI):** `partyConfig.js`, `companionGenerator.js`,
   `companionController.js` + unit tests. Prove a generated companion is a valid hero and the
   controller respects the cap. Exercise via a debug page (`/debug/companions`) like the
   existing test harnesses.
2. **Phase 2 - tavern hire UI:** "Hire" section in `BuildingModal`, `onRecruit` thread,
   PartySidebar badge. Recruit + persist round-trip.
3. **Phase 3 - dismiss + downed handling:** Dismiss in `HeroModal`, confirm flow, verify
   resurrect/rest behave for companions.
4. **Phase 4 - quest-reward companions:** `companionReward` on milestones/side-quests, wired
   into the existing reward-application path.

## Open questions (for the human)

1. **Cap value:** is `MAX_PARTY_SIZE = 6` right, or should it scale (e.g. creation 4 +
   2 companions), or be tied to a premium tier?
2. **Hire cost source:** flat formula (`50 + level*25`) vs. tied to the gold economy in
   `FEATURE_SHOPS.md`? Should there be an ongoing upkeep/wage, or one-time fee only?
3. **On dismiss / death:** does a companion's `inventory`/`gold`/equipped gear return to the
   party (lead hero), drop, or vanish with them? (Affects whether players "loot then dismiss".)
4. **XP & levelling:** do companions earn XP and level alongside heroes, or join at a fixed
   level relative to party and stay static?
5. **Recruit gating:** any reputation / alignment / story gate (e.g. evil parties can't hire
   good-aligned companions), or purely gold + slots?
6. **Re-recruit after dismiss:** if you dismiss a hireling, can you re-hire them later, and at
   what cost? Should the same town's roster regenerate over time?
7. **Guests / no-AI path:** companions are pure local state, so they should work for
   logged-out guests too — is that desired, or gate recruitment behind sign-in like saves?

## Verify

`CI=true npx react-scripts test --watchAll=false` and `CI=false npx react-scripts build`
both green. Do NOT commit or push.
</content>
</invoke>
