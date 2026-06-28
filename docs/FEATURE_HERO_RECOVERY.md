# Feature: Hero Recovery (restore a roster hero into the campaign party)

Give players a **button** to put a hero **back into the current campaign** when one has gone
missing from the party. This is a recovery / safety-net action, not a roster manager.

## The problem this solves

A now-fixed bug could **duplicate one hero and overwrite another** in the in-campaign party,
corrupting the campaign snapshot stored in `conversations.selected_heroes` (a 2-hero party
becoming `[Vanya, Vanya]`, with the second hero gone). The shipped fix has two parts already
in the tree:

- `heroUid()` + `replaceHeroInParty()` in `src/utils/partyUtils.js` match on the combined
  `heroId || characterId` key and refuse to match a missing id, so a single-hero update no
  longer overwrites the whole party.
- `normalizeParty()` (run in the `Game.js` `selectedHeroes` `useState` initializer) de-dupes
  on load, collapsing `[Vanya, Vanya]` back to one Vanya.

But de-dupe-on-load **cannot resurrect a hero that was overwritten in the save**: that data is
gone from `selected_heroes`. The saving grace is the data model: the **canonical hero lives in
a separate `heroes` roster table that gameplay never writes to**, so the original hero still
exists there at its creation / last-edit state. Hero Recovery is the action that pulls that
roster copy back into the running campaign.

**Crucial limitation, stated up front and in the UI:** the roster only stores
**identity / template** fields (name, race, class, level, stats, portrait), **not** in-campaign
progression (no `xp`, `gold`, `inventory`, `equipment`, or current HP). Restoring therefore
brings the hero back at **roster / template state**, the same state it would join a brand-new
campaign in, **not** its lost in-campaign progression. Progression is not synced to the roster,
and cross-campaign continuity is explicitly **not** a goal right now (see Non-goals).

## Player-facing behaviour

- **Where the button lives:** the **PartySidebar** (`src/components/PartySidebar.js`) gains a
  small **"Restore hero"** action at the bottom of the party list (a recovery affordance, not a
  full party editor). Clicking it opens a lightweight **recovery panel / modal** listing the
  player's **roster heroes that are NOT currently in the party** (filtered by `heroUid`).
- **What the panel shows:** each eligible roster hero with portrait, name, race / class / level,
  and a **plain warning line**: *"Restores this hero at their saved character-sheet state.
  In-campaign progress (XP, gold, items, equipment) is not recovered."* If every roster hero is
  already in the party, the panel shows an empty state ("All your heroes are already in this
  party"). If the party is at the size cap, restore is **disabled** with a "Party full" reason.
- **What happens on click:** the chosen roster hero is **re-added to `selectedHeroes`**, stamped
  with the **same progression defaults the normal init path applies** (see Data model), then the
  campaign is **saved** (`performSave`). The hero immediately appears in the sidebar and is
  usable in combat / rest / inventory like any other hero, starting fresh: full HP for its level,
  `xp: 0`, `gold: 0`, empty `inventory`, empty `equipment`.
- **No silent overwrite, ever.** Restore only ever **appends**; it never replaces an existing
  party member. A hero already in the party is not offered.

## Data model

Nothing new is persisted. Recovery reads the **roster** and writes the **campaign snapshot**.

**Roster hero shape** (from `heroesApi.list()` -> `cf-worker/src/routes/db.ts` `/heroes`, or
`localHeroStore` for guests). Identity / template only:

```
{
  heroId, heroName, heroGender, heroRace, heroClass, heroLevel,
  heroBackground, heroAlignment, profilePicture,
  stats: { Strength, Dexterity, Constitution, Intelligence, Wisdom, Charisma }
  // NO xp, gold, inventory, equipment, currentHP, maxHP
}
```

**In-campaign hero shape** (what `selectedHeroes` holds and what is persisted into
`conversations.selected_heroes`). Same identity fields **plus** progression, which the
`Game.js` `useState` initializer backfills today (lines ~91-106):

```
{ ...rosterFields, xp: 0, level: heroLevel || 1, gold: 0, inventory: [],
  maxHP: calculateMaxHP(hero), currentHP: maxHP }
```

A restored hero must be run through **exactly this stamping** so it is shape-identical to a
hero that started the campaign normally. To avoid two copies of the default-stamping logic,
**extract the `Game.js` initializer body into a pure helper** and call it from both places:

- **NEW `stampCampaignDefaults(hero)`** in `src/utils/partyUtils.js` (or a small
  `src/game/heroInit.js`): given a roster-shaped hero, return the in-campaign hero with `xp`,
  `level`, `gold`, `inventory`, `maxHP`, `currentHP` defaulted. Pure. `Game.js`'s initializer
  becomes `heroes.map(stampCampaignDefaults)`; recovery calls it on the one restored hero.
  (Note HeroSelection's `handleNext` uses `initializeHP(hero)` while `Game.js`'s init uses
  `calculateMaxHP`; both come from `healthSystem.js`. Pick one in the shared helper so restored
  heroes and freshly-selected heroes get HP the same way; recommend reusing `initializeHP`.)

## Identity safety

- **Identity key:** use `heroUid(h)` (`h.heroId || h.characterId`) from `partyUtils.js`, the
  same key the de-dupe / replace path uses. Never match on a missing id.
- **Refuse duplicates:** the eligibility filter excludes any roster hero whose `heroUid` is
  already present in `selectedHeroes`; the add helper double-checks and **no-ops** if the id is
  already in the party (defence in depth, mirrors `replaceHeroInParty`'s "rather skip than
  corrupt" stance).
- **Stable `heroId`:** roster heroes always carry `heroId` (from HeroCreation / the DB row), so
  the restored hero has a stable id by construction. If a roster hero somehow lacks one, the add
  helper should **refuse** (return the party unchanged) rather than invent one, so we never add
  an unidentifiable hero that `normalizeParty` would later collapse.

## Pure helper (owned by this stream)

Modelled on `replaceHeroInParty`, in `src/utils/partyUtils.js`:

```js
/**
 * Return a new party with `hero` appended, IF it is safe to add.
 * Refuses (returns the original party unchanged) when:
 *   - hero has no stable heroUid,
 *   - a hero with the same heroUid is already in the party (no duplicates),
 *   - the party is already at maxSize.
 * Pure; never mutates; never replaces an existing member (append only).
 * @returns {{ party: Array, ok: boolean, reason?: 'no-id'|'duplicate'|'full' }}
 */
export const addHeroToParty = (party, hero, maxSize) => { ... }
```

Returning a `{ party, ok, reason }` result (rather than a bare array) lets the UI show the right
disabled-state copy ("Party full" vs "Already in party"). Recovery flow in `Game.js`:
`addHeroToParty(prev, stampCampaignDefaults(rosterHero), MAX_PARTY_SIZE)`, then on `ok` call
`setSelectedHeroes(result.party)` and `performSave()`.

## Party-size limits

Party size is hard-coded as **4** in several spots in `HeroSelection.js`
(`selectedHeroes.length > 4`, `>= 4` at-limit, the "of 4 selected" label, and the `handleNext`
guard). That governs **creation**. Recovery must respect the **same effective cap** so a player
cannot exceed the intended party size by restoring.

- Introduce a single shared constant rather than re-hard-coding 4. Recommend
  **`src/data/partyConfig.js`** exporting `MAX_PARTY_SIZE = 4` (and have `HeroSelection.js`
  adopt it over time). `addHeroToParty` takes `maxSize` as a parameter so the cap lives in one
  place and is testable.
- If `FEATURE_COMPANIONS.md` ships a larger runtime cap (it proposes `MAX_PARTY_SIZE = 6`),
  recovery should read **the same constant** so the two features agree. Coordinate on one
  `partyConfig.js`.

## Integration points

- **`src/components/PartySidebar.js`** (shared): add the "Restore hero" trigger and accept a new
  `onRestoreHero` (and the eligible-roster data, or a callback to fetch it). Additive only;
  the existing `selectedHeroes.map(...)` render is untouched.
- **`src/pages/Game.js`** (shared): add `handleRestoreHero(rosterHero)` that stamps defaults,
  calls `addHeroToParty`, `setSelectedHeroes`, then `setTimeout(() => performSave(), 500)` (the
  same debounced-save pattern used by the other party mutations in this file). Refactor the
  `selectedHeroes` initializer to use `stampCampaignDefaults`.
- **Roster source** (read-only reuse): `heroesApi.list()` already returns the right shape and
  already branches guest (`localHeroStore`) vs cloud (cf-worker / Express) internally, so
  recovery is roster-source agnostic. The recovery panel fetches via `heroesApi.list()` on open
  (or reuses `HeroContext` if already populated) and filters out heroes already in the party.
- **Persistence** (unchanged): `useGamePersistence` / `performSave` write `selectedHeroes`
  wholesale into `conversations.selected_heroes`. `saveController.buildSaveFingerprint` already
  hashes per-hero state, so an appended hero changes the fingerprint and triggers the save. No
  schema change, no new endpoint.

## Edge cases

- **Hero already in party:** excluded from the panel by the `heroUid` filter; `addHeroToParty`
  also no-ops (`reason: 'duplicate'`) as a backstop.
- **Party full:** restore disabled in the UI with "Party full"; `addHeroToParty` returns
  `reason: 'full'` and leaves the party unchanged.
- **Roster empty / all heroes already present:** panel shows an empty state, no button enabled.
- **Roster hero missing `heroId`:** `addHeroToParty` refuses (`reason: 'no-id'`); surface a
  generic "Couldn't restore this hero" message rather than adding an unidentifiable member.
- **Guest / local roster vs cloud:** works for both via `heroesApi`. Caveat to flag in the UI
  for guests: a guest's local roster is imported and **cleared** on sign-in (see
  `LocalHeroSync`), so a hero present in `selected_heroes` but absent from the (now-empty) local
  roster will not be offered until the player is signed in. For signed-in players the cloud
  roster is the durable source.
- **Stale roster after edit:** the roster copy reflects the hero's last creation / edit state,
  which may differ from how it last looked in-campaign. This is expected and is exactly the
  "template state, not progression" contract; the UI copy already says so.
- **Restoring then the same hero "reappears":** because restore only appends a unique `heroUid`
  and `normalizeParty` de-dupes on load, re-adding is idempotent and safe.

## Tests

- `partyUtils.test.js` (extend existing): `addHeroToParty`
  - appends a hero with a fresh `heroUid` (length +1, original array not mutated);
  - refuses a duplicate `heroUid` (`ok: false`, `reason: 'duplicate'`, party unchanged);
  - refuses when `party.length === maxSize` (`reason: 'full'`);
  - refuses a hero with no id (`reason: 'no-id'`);
  - matches on `characterId` too (legacy id), not just `heroId`.
- `stampCampaignDefaults` (wherever it lives): a roster hero (no `xp`/HP) comes out with
  `xp: 0`, `gold: 0`, `inventory: []`, `level >= 1`, and `currentHP === maxHP > 0`; an
  already-stamped hero is left intact (idempotent).
- Integration sanity: a restored hero appended to `selectedHeroes` survives a `longRest` map and
  an `applyEncounterOutcomeToParty` call at its index (proves shape parity with normal heroes).
- Round-trip: restore -> `performSave` writes the hero into `selected_heroes`; reload runs
  `normalizeParty` and the restored hero survives with no duplicate.

## Back-compat

- **No save-schema change and no DB change.** Recovery reads the existing roster and writes the
  existing `selected_heroes` array.
- **Retroactive for corrupted saves:** any existing campaign that lost a hero to the old bug can
  recover it through this button (as long as the roster copy still exists), with the stated
  template-state caveat.
- **Renderers already tolerate the in-campaign hero shape**; a restored hero is shape-identical
  to a normally-selected one, so combat / rest / inventory / sidebar need no changes.
- Extracting `stampCampaignDefaults` from the `Game.js` initializer must preserve the **exact**
  current defaulting behaviour (only backfilling when `xp === undefined`) so loading existing
  saves is byte-for-byte unchanged.

## Non-goals

- **Cross-campaign continuity / progression sync.** We are explicitly not syncing in-campaign
  `xp` / `gold` / `inventory` / `equipment` back to the roster, nor restoring it. Restore is
  template-state only.
- **A full party manager.** No swapping heroes in/out at will, reordering, or mid-campaign
  roster curation; this is a recovery action for missing heroes.
- **Recovering a hero that was never in the roster** (e.g. a future purely-in-campaign companion
  with no `heroes` row). Out of scope; see `FEATURE_COMPANIONS.md`.
- **Undo / point-in-time campaign snapshots.** Recovery rebuilds from the roster, it does not
  restore a prior `selected_heroes` version. True snapshot history would ride on the admin /
  backups work (OUTSTANDING_ISSUES #30).
- **Auto-recovery on load.** De-dupe-on-load already runs automatically; re-adding a lost hero
  is a deliberate player action (we never silently mutate the loaded party).

## Tie-in with shipped / planned work

- **Complements the de-dupe-on-load fix** (`normalizeParty` + `replaceHeroInParty` in
  `partyUtils.js`): that prevents and repairs duplication on load; this restores a hero that
  duplication already erased from the snapshot. Same identity primitive (`heroUid`).
- **Admin DB dashboard (OUTSTANDING_ISSUES #30):** that issue was triggered by a player who lost
  a hero to this exact bug and asked whether their character still exists in the DB. The admin
  read view answers "does the roster copy exist?"; Hero Recovery is the player-facing way to act
  on a "yes". The two are complementary (inspect vs restore).

## Phased rollout

1. **Phase 1 - pure logic (no UI):** `addHeroToParty` in `partyUtils.js`, `partyConfig.js` with
   `MAX_PARTY_SIZE`, and `stampCampaignDefaults` extracted from the `Game.js` initializer, all
   with unit tests. Refactor `Game.js`'s initializer to use the shared helper (behaviour-
   preserving).
2. **Phase 2 - recovery UI:** "Restore hero" trigger in `PartySidebar`, a recovery panel listing
   eligible roster heroes (filtered by `heroUid`, capped, with the template-state warning copy),
   `handleRestoreHero` in `Game.js`, save round-trip.
3. **Phase 3 - polish + edge cases:** guest-vs-cloud messaging, empty / full states, "couldn't
   restore" error path, and a confirm step if desired.

## Open questions (for the human)

1. **Button placement:** in the `PartySidebar` (always visible) or only surfaced when we detect
   a likely-lost hero (e.g. party smaller than its recorded original size)? A persistent button
   is simpler; a conditional one is less clutter.
2. **Confirmation step:** should restore require a confirm (given it stamps fresh progression and
   the data is lossy), or is the inline warning copy enough?
3. **Cap value & source:** is the recovery cap exactly the creation cap (4), and should we land
   the shared `partyConfig.js` now, coordinating with `FEATURE_COMPANIONS.md`'s proposed 6?
4. **HP stamping source:** standardise on `initializeHP` for both creation and recovery (the
   `Game.js` init currently uses `calculateMaxHP`)? They should match.
5. **Guests:** acceptable that a guest can only restore heroes still present in their local
   roster (cleared on sign-in), or should restore be gated behind sign-in entirely like saves?
6. **Original-party-size memory:** do we want to record the campaign's intended original party
   size somewhere (settings) so the UI can say "1 hero missing" and detect the lost-hero case,
   or keep recovery purely manual ("here are heroes not in your party")?
7. **Restore a hero edited since the campaign started:** if the roster copy was edited after the
   campaign began (different stats / level), do we restore the current roster state (proposed) or
   warn that it differs from how the hero was in this campaign?

## Verify

`CI=true npx react-scripts test --watchAll=false` and `CI=false npx react-scripts build` both
green. Do NOT commit or push.
</content>
</invoke>
