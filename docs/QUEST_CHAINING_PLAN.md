# Quest Chaining Within a Save (Design Plan)

Status: DESIGN ONLY, no implementation. Author: planning pass, 2026-07.
Related docs: `CAMPAIGN_MILESTONE_SYSTEM.md`, `FEATURE_QUEST_GIVERS.md`,
`FEATURE_SIDEQUEST_BACKFILL.md`, `docs/OUTSTANDING_ISSUES.md`.

## Decisions (2026-07-03)

- **Phased: BOTH shapes, linked save first.** Phase 1 ships Option A (New Expedition:
  a new LINKED save with a fresh world and the carried party) as the quick win. The
  end goal is **same-world sequels**: re-author the higher-tier campaigns to take
  place in the SAME world/geography as their tier-1 predecessors (same town names,
  e.g. heroic-fantasy-t2 reworked to use Willowdale/Briarwood/... + a new region
  instead of Eldoria/Silverton), so "Chapter 2" can spawn into the existing world.
  This dissolves Option B's core objection (locations that don't exist) by authoring
  them to exist. Remaining same-world engineering to design in a follow-up: injecting
  the sequel's quest buildings into already-cached towns (a targeted additive
  mutation, NOT regeneration) and placing new milestone POIs on the live map at
  campaign start.
- **Never destroy a world.** Whatever ships, a completed campaign's world/save stays
  intact and playable; "replace the world in the same save" is rejected.
- **Party carry: everything, healed.** Levels, XP, gear, and gold carry; the party
  starts the next chapter at full HP.
- **Story carry: deferred** until the same-world rework lands (same world makes the
  question largely moot — journal and RAG index simply continue). For Phase 1 linked
  saves, default to the distilled prologue unless decided otherwise.

## 1. Problem

"I completed the goblin quest in one save, but there is no way to pick up the next
quest. We need to plan for that."

Today a campaign ends at CAMPAIGN COMPLETE and the save becomes a dead end. The game
does not lock up (the player can free-roam, finish side quests, keep chatting with the
DM), but there is no next main quest and no path forward. To play another campaign the
player must start a NEW game: new world, fresh level-1 party, empty journal. Everything
the player earned (levels, gear, gold, a world they know) is stranded in the old save.

The template catalog is explicitly tiered (tier 1 = Lv 1-2, tier 2 = Lv 3-5, tier 3
stubs marked `comingSoon` at Lv 5-7), so the content already implies a progression that
the game currently has no mechanism to deliver.

## 2. Current state (grounded in code)

### 2.1 How a campaign is wired into a save at creation

All of this happens once, inside `handleStart` in `NewGame.js`:

1. **Template pick.** A template from `storyTemplates.js` is selected; its
   `settings.milestones` array is copied into component state and its `customNames`
   (`{ towns: [...], mountains: [...] }`) are captured. Each template carries its OWN
   names: `heroic-fantasy-t1` ("The Goblin Threat") uses Willowdale, Briarwood,
   Thornfield, Millhaven and Greenridge Hills; `heroic-fantasy-t2` ("Crown of
   Sunfire") uses Eldoria, Sunfire, Oakhaven, Silverton and the Cinder Mountains.
2. **Map generation.** `mergeLocationNames` merges milestone location names (via
   `getMilestoneLocationNames`) into `customNames`, then `generateMapData(10, 10, seed,
   customNames, worldTheme)` builds the world grid. Milestone locations only exist on
   the map because their names were fed in at this moment.
3. **Entity spawning.** `spawnWorldMapEntities(mapData, milestones)` places milestone
   POIs, enemy spawns and item spawns onto the live map (via `findLocationOnMap` /
   `findNearbyPlacement`), returning `requiredBuildings`, `enemySpawns`, `itemSpawns`.
4. **Town pre-generation.** Every town map is generated up front into `townMapsCache`
   ("so saves are never affected by generator changes"): `generateTownMap` per town,
   then `injectQuestBuildings` for towns named in `requiredBuildings`, then
   `populateTown` seeds NPCs (canonical milestone NPCs via `getMilestoneNpcsForTown`
   replace procedural staff). Note: the CLAUDE.md "lazy town gen" description is now
   historical; towns are pre-generated at new-game time and cached.
5. **Side quests.** `selectSideQuests` (in `questEngine.js`) picks 2-4 quests from
   `sideQuests.js` that are startable AND completable against the actual map
   (giver building, objective sites, turn-in building all verified via
   `isQuestEligible`). Result stored in settings as `sideQuests`.
6. **Settings snapshot.** `settingsData` bundles `milestones` (with resolved coords via
   `resolveMilestoneCoords`), `campaignGoal`, `worldSeed`, `theme`, `mapVersion: 2`,
   `templateName`, `tier`, `levelRange`, `requiredBuildings`, `enemySpawns`,
   `itemSpawns`, `sideQuests`. A fresh `gameSessionId` is minted and the flow proceeds
   to hero selection, then `/game`.

### 2.2 What happens at campaign completion

- `checkMilestoneCompletion` (and `completeNarrativeMilestone`) in `milestoneEngine.js`
  return `campaignComplete: true` when every milestone is completed.
- `checkMilestoneEvent` in `Game.js` reacts by appending a system chat message
  ("CAMPAIGN COMPLETE! ... The tale of your heroic deeds will be sung for generations
  to come!") and setting `settings.campaignComplete = true`. The AI-judged path in
  `useGameInteraction.js` (`CAMPAIGN_COMPLETE_REGEX`) does the same.
- UI surfaces: the chat message, plus a static "CAMPAIGN COMPLETE" banner in the
  Journal (the settings modal in `Modals.js`). That is all. There is no completion
  modal, no CTA, no "what next".
- The flag is part of the save fingerprint (`buildSaveFingerprint` in
  `saveController.js`), so completion is reliably persisted.
- **The player CAN keep playing** in the completed world: movement, encounters, side
  quests, shops all still work. The dead end is purely about main-quest content.

### 2.3 What is world-bound vs party-bound in a save

A save is one conversation row (proxied through `/api/db/*`; local mirror in
`localGameStore.js`) with these fields:

| Field | Bound to | Notes |
|---|---|---|
| `world_map` | **World** | Generated once around the campaign's `customNames`. Never regenerated. Milestone POIs/enemies/items were spawned into it. |
| `sub_maps` | **World** | `buildSubMapsPayload`: `townMapsCache` (keyed by town NAME), `siteMapsCache`, positions, visited sets. Quest buildings and milestone NPCs are baked into the cached town maps. |
| `game_settings` | **Campaign + world** | Milestones snapshot, `theme`, `worldSeed`, `tier`, `levelRange`, spawn tables, `sideQuests`, `campaignComplete`, `mapVersion`. |
| `selected_heroes` | **Party (portable)** | A SNAPSHOT taken at hero selection (`initializeHP` in `HeroSelection.js`). All in-save progression (XP, level, gear, gold, HP) lives here. It is never written back to the hero library (`heroesApi`), so the library copies are still level 1. |
| `conversation` | Campaign + world | The journal/history. Full of world-specific names. |
| `summary` | Campaign + world | Rolling summary, also world-specific but far more portable than raw history. |
| RAG index | Session | Keyed by `sessionId` (`embedAndStore` / `getBySession` in `ragEngine.js`, entry ids `${sessionId}-${msgIndex}`), backfilled from the conversation by `useRagSync`. |

**Conclusion: the party is the only cleanly portable asset.** The world, town caches,
spawned entities, journal and RAG index are all entangled with the specific campaign
that created them.

### 2.4 The template catalog implies chains

- Authored: `heroic-fantasy-t1` -> `heroic-fantasy-t2`, `grimdark-survival-t1` -> `-t2`,
  `arcane-renaissance-t1` -> `-t2`, `eldritch-horror-t1` -> `-t2`.
- Premium tier-1 variants: `desert-expedition-t1`, `frozen-frontier-t1` (flagged
  `premium: true`; gated by `isTemplatePremium` / `isThemePremium` in
  `entitlements.js`, enforced in the `handleStart` backstop).
- Tier-3 stubs (`comingSoon: true`) for all four genres at Lv 5-7: the destination of
  any chaining system.
- Side quests (`questEngine.js`) already provide within-save optional content with
  tiered reveal (`minLevel` gating via effective party level), and
  `FEATURE_QUEST_GIVERS.md` plans a wide giver-building vocabulary. This is the
  precedent for "quests offered in the world" but it is a separate pool from campaigns.

### 2.5 Hard constraints (from CLAUDE.md back-compat rules)

1. Maps are generated once and never regenerated; never mutate a loaded map in place.
2. Milestones are snapshotted into `game_settings` at creation; old saves keep their
   snapshot forever.
3. `getMilestoneLocationNames` feeds `customNames` at map-gen time. A NEW campaign's
   locations therefore DO NOT EXIST in an OLD world. `findLocationOnMap` (in
   `milestoneSpawner.js`) matches by tile `townName` / `mountainName`; "Oakhaven" and
   the "Cinder Mountains" are simply not on the Willowdale map.
4. Schema changes must be additive; renderers tolerate missing fields; stamp
   `mapVersion` on settings for generation-format changes.
5. Premium gates (`canUseTemplate`, `canUseTheme`) must hold on every path that can
   start a campaign, not just the New Game screen.

## 3. Design question

How should a player continue with the SAME party (and ideally the same save) into the
next campaign?

Three coherent options analyzed below, plus a hybrid. Summary table first:

| | A. New Expedition (fresh world, carried party, linked save) | B. Multi-campaign single world (spawn next campaign into the existing world) | C. Hub / quest-board (diegetic offer surface) |
|---|---|---|---|
| Party carries | Yes (snapshot copy) | Yes (same save) | Yes (delegates to A or B) |
| World carries | No (new region, in-fiction "expedition") | Yes | Depends on backing option |
| Journal/history | Fresh, seeded with a prologue from `summary` | Continuous | Depends |
| RAG memories | Fresh index; optionally seed with distilled legend summary | Continuous | Depends |
| Respects never-regenerate rule | Yes (a new campaign is a new generation) | Only if injection is strictly additive; retro-mutating `townMapsCache` is against the spirit of the rule | Yes |
| Works with EXISTING templates | Yes, all of them, unmodified | No: template `customNames`/locations/milestone text don't match the old world | Yes (as a skin over A) |
| Engineering cost | Medium | High (authoring model change + retro injection risks) | Low as UI layer; meaningless alone |
| Premium fit | Natural upsell CTA at completion | Awkward (premium biomes can't retrofit a temperate world) | Natural (board lists premium contracts) |
| Back-compat risk | Very low (all additive) | High (mutates persisted map data) | Very low |

### Option A: "New Expedition" (fresh world, carried party) — chain of linked saves

**Player experience.** On campaign completion a celebration modal appears: rewards
recap, "The tale of your heroic deeds...", and a **"Continue your legend"** CTA. The
player picks the next adventure (recommended: same genre, next tier; but the full
catalog is offered). The fiction: the party, now renowned, travels to a new region.
A new world is generated for the new template, the party arrives with all levels, gear
and gold, and the journal opens with a short prologue recapping the previous campaign.

**Mechanics.** Reuse the existing `handleStart` pipeline almost verbatim, with two
changes: (a) skip hero selection and instead deep-copy `selected_heroes` from the
completed save, and (b) record the chain link. This respects every constraint:
generating a fresh world for a NEW campaign is exactly what the never-regenerate rule
permits; the new template's `customNames` flow through `mergeLocationNames` ->
`generateMapData` -> `spawnWorldMapEntities` -> town pre-generation exactly as today,
so milestone POIs, quest buildings and NPCs all exist by construction.

**Same save vs new linked save.** Two sub-variants:

- **A1 (recommended): new save row, linked to the old.** New `gameSessionId`, new
  conversation row. The old save stays loadable (players can revisit their completed
  world for side quests or nostalgia). Why this wins technically:
  - `sub_maps.townMapsCache` is keyed by town NAME; a new world means entirely new
    keys, so reusing the row would require wiping the caches anyway.
  - The RAG index is keyed by `sessionId`; a fresh session gives a clean index that
    never retrieves stale references to towns that no longer exist.
  - Conversation history stays coherent: one save = one world. The prologue message
    (built from the old save's `summary`, completed milestone list and hero names)
    carries the narrative thread without carrying 400 messages about Willowdale.
  - Zero migration risk: the old row is untouched.
- **A2 (rejected): replace the world inside the same save row.** Overwrite
  `world_map`, wipe `sub_maps`, reset positions, keep `conversation`. This "feels"
  like one save but: the journal becomes a confusing two-world stream, `useRagSync`
  would happily keep retrieving old-world memories into new-world prompts, any bug in
  the swap corrupts the player's only copy, and the completed world is destroyed. All
  cost, no real benefit over A1 plus a link.

**What carries over (A1):**
- Party: yes, the full `selected_heroes` snapshot (levels, XP, gear, gold; decide HP
  policy, see open questions).
- World: no (new region by design).
- Journal: distilled (prologue from `summary` + completed campaign record). Optionally
  surface "Previous chapters" in the Journal UI via the chain link.
- RAG: fresh index; optionally seed it by indexing the prologue/legend summary as the
  first entries (cheap, uses the existing `embedAndStore` path).
- Side quests: fresh pick via `selectSideQuests` against the new map (as today).

**Save-schema changes (all additive, no `mapVersion` bump; map format is unchanged):**
- On the NEW save's `game_settings`:
  `chain: { parentSessionId, rootSessionId, chapter, carriedParty: true }` and
  `completedCampaigns: [{ templateId, templateName, subtitle, tier, completedAt }]`
  (accumulated down the chain).
- On the OLD save's `game_settings` (optional, nice-to-have):
  `continuedInSessionId` so SavedGames can badge it "Continued".
- Suggested save naming: reuse `buildSaveName` root with a chapter suffix, e.g.
  "Adventure, Chapter 2" (the root is already player-editable).

**Engineering cost: medium.**
- Extract the campaign-start pipeline (steps 2-6 of section 2.1) from `handleStart`
  into a reusable pure-ish module (e.g. a `launchCampaign(template, { party, chain })`
  in `src/game/`), consumed by both `NewGame.js` and the new chain flow. This is the
  bulk of the work and pays for itself in testability.
- A completion modal registered in `MODAL_REGISTRY` (`ModalContext.js` + `ModalShell`),
  triggered where `checkMilestoneEvent` / the `CAMPAIGN_COMPLETE_REGEX` handler set
  `campaignComplete` (fire once; the persisted flag already prevents re-fires on load).
- A template picker filtered/sorted by tier fit (see section 4).
- Prologue composer (a small sibling of `introComposer.js`).

**Premium interactions.** The CTA surface is a natural, honest upsell: chaining into
`desert-expedition-t1`, `frozen-frontier-t1` or any future premium tier goes through
the same `canUseTemplate` gate as New Game (and the `handleStart`-equivalent backstop
must be replicated in `launchCampaign`). Free users always have a free next step
(the four core genres' t2 are not premium today).

**Back-compat.** Fully additive. Bonus: any OLD save with `campaignComplete: true`
retroactively gains the "Continue your legend" CTA on load, which directly rescues the
maintainer's stranded goblin-quest save.

### Option B: Multi-campaign single world (spawn the next campaign into the existing world)

**Player experience (ideal).** The dream version: the same world deepens. After the
goblins fall, a new threat rises in the same land; new POIs appear on the map you
already know.

**Honest feasibility analysis: not viable with the current content model.**

1. **Locations don't exist.** Every template's milestones name locations from its own
   `customNames` (`spawn.location`, `building.location`, `milestone.location`, and the
   milestone `text` itself: "Meet Captain Aldric at Silverton"). In the goblin-quest
   world there is no Silverton and no Cinder Mountains. `findLocationOnMap` returns
   null, `spawnWorldMapEntities` degrades to fallback/no placement, and the narrative
   text is wrong regardless. Fixing this means a **retargeting pass**: remap the new
   template's location names onto the existing world's towns/mountains AND rewrite
   every embedded name in milestone text, spawn defs, building defs and NPC
   personalities. String surgery on authored prose is fragile; done properly it means
   re-authoring templates with symbolic locations (`{ role: 'capital' }` resolved at
   chain time), which is a new authoring model, not a feature toggle.
2. **Cached towns can't gain quest buildings retroactively (cleanly).** Town maps are
   pre-generated at new-game time and persisted in `sub_maps.townMapsCache`.
   `injectQuestBuildings` runs at generation time against a fresh grid. Injecting into
   a cached, persisted town map is exactly the "mutate a loaded map in place" the
   back-compat rules forbid; even treated as an additive exception it must find a free
   lot in a finished layout, must not collide with player-known geography, and any bug
   corrupts persisted data. NPC injection (appending to `townMapData.npcs`) is the only
   genuinely additive piece.
3. **Map real estate.** The 10x10 world already carries its own POIs plus the first
   campaign's spawns. `findNearbyPlacement` can fail; a second campaign's worth of
   POIs may simply not fit, and failures would be silent quality degradation.
4. **Tone/lore mismatch.** "Crown of Sunfire" assumes the kingdom of Eldoria; chaining
   cross-genre (goblin farmland -> eldritch horror) in one world compounds it.

**A viable narrow subset ("world-native sequels", really Option B-prime):** author
NEW sequel templates specifically designed for world reuse: symbolic locations
resolved against the live world, quest buildings restricted to types that already
exist in every world (tavern/inn/blacksmith per the commonness table in
`FEATURE_QUEST_GIVERS.md`), reusing existing buildings instead of injecting, POIs
placed by biome rather than by name, and text written name-free with runtime
substitution. Cost: high (new authoring format + resolver + additive-only spawner
mode); payoff: the best-feeling continuity, but only for purpose-built content. Not a
path to unlock the EXISTING t2 catalog.

**Verdict:** rejected as the chaining mechanism. Worth keeping on the long-term
roadmap as premium "epilogue" content once chaining exists.

### Option C: Hub / quest-board model (diegetic offer surface)

**Player experience.** No modal-driven meta UI; instead, when the campaign completes,
a new offer appears in the world: a notice board or an official (guild hall, townhall,
militia captain) in towns advertises an "expedition contract" for the next campaign.
Talking to them presents the pitch ("Word of your deeds has reached Eldoria; the crown
seeks heroes...") and accepting it starts the next chapter.

**Analysis.** C is not a persistence architecture; it is a presentation layer that
must delegate to A (or B-prime) the moment the player accepts. As a skin over A it is
attractive and cheap: the building-visit plumbing already exists
(`getAvailableQuestsAt` offers side quests at giver buildings and `BuildingModal`
renders the "Rumours & Tasks" accept flow), so a campaign contract is one more entry
type in that list, gated on `settings.campaignComplete` (and tier fit). Accepting it
triggers the same `launchCampaign` transition, framed as travel to a new region.

It cleanly ties into `FEATURE_QUEST_GIVERS.md`: the quest-giver vocabulary work gives
the contract a natural home (townhall/guild/barracks). Premium contracts can be listed
but locked, which is a gentler upsell than a modal.

**Weaknesses if used alone:** discoverability (the player must wander back to a town
and open the right building; a completion modal pointing them there fixes this), and
it does nothing for the architecture questions A answers.

## 4. Cross-cutting concerns

### Tier / level fit

- Tier 1 rewards total roughly 150-250 XP across four milestones plus encounter
  rewards and side quests, landing a party around Lv 2-3 at completion. Tier 2 expects
  entry at Lv 3 (`levelRange` [3,5] or [3,4]). That is a reasonable seam, but it
  should be verified against `progressionSystem.js` thresholds; if a t1-complete party
  typically lands at Lv 2, add a one-time "renown" XP bonus to the campaign-complete
  rewards so the chain hands the player a t2-ready party.
- The chain picker should sort/filter by fit: recommend templates whose `levelRange`
  contains the effective party level (same notion the side-quest tiered reveal uses),
  show same-genre-next-tier first, allow off-recommendation picks with a soft warning
  ("Your party may find this trivial/deadly"). Replaying a t1 with a t2 party should
  be allowed but flagged (it also matters for premium t1s: desert/snow are t1, and a
  chained party will over-level them; consider t2 desert/snow as premium roadmap).
- `minLevel` on milestones (e.g. the goblin chieftain's `minLevel: 2`) already guards
  under-leveled bosses; over-leveled parties need no guard.

### The completed campaign's record

Add `completedCampaigns` to `game_settings` (additive array, see A1 schema). Uses:
the Journal can render a "Legend" section (past chapters with subtitles and dates),
the chain picker can exclude already-completed templates by default, and any future
achievements/renown system has its data source. The old save itself keeps
`campaignComplete: true` and remains playable; optionally stamp it with
`continuedInSessionId` for a SavedGames badge.

### UI surfaces

1. **Campaign-complete modal** (new, via `MODAL_REGISTRY`): celebration + rewards
   recap + primary CTA "Continue your legend" (opens chain picker) + secondary "Keep
   exploring" (dismiss; side quests and free roam continue). Must also appear (as a
   Journal button, not an auto-modal) for already-completed old saves.
2. **Journal**: replace the static "CAMPAIGN COMPLETE" banner (in the settings modal
   in `Modals.js`) with the banner + the same "Continue your legend" button, plus the
   "Legend" past-chapters list.
3. **New Game screen**: a "Continue with an existing party" path: pick a save with
   `campaignComplete` (or, decision pending, any save), import its `selected_heroes`
   snapshot, then proceed through the normal template/world flow with hero selection
   skipped. This also covers players who dismissed the modal.
4. **SavedGames list**: badge completed saves ("Campaign complete: continue your
   legend") and chained saves ("Chapter 2 of ...").
5. **(Phase later) Notice-board contract** in towns per Option C.

### Party carry rules (to decide, see open questions)

Deep-copy `selected_heroes` from the source save (NOT the hero library, whose copies
are stale level-1 sheets; there is no write-back today). Proposed defaults: restore HP
to full (a new expedition implies rest), keep XP/level/gear/gold untouched, re-run
`normalizeParty`/`initializeHP` so future hero-schema fields get defaulted. Explicitly
do NOT mutate the source save's heroes; the copy is the traveling party.

## 5. Recommendation

**Option A1 (New Expedition into a new linked save) as the architecture, with Option C
(quest-board contract) added later as the diegetic surface.** Reasons:

- It works with the entire existing template catalog unmodified, today.
- It respects every back-compat rule with zero migrations (purely additive settings
  fields) and zero risk to existing saves; it even retroactively rescues them.
- It carries the one asset that is actually portable (the party) and carries the
  narrative thread through the summary-derived prologue, which is the honest scope of
  "continuity" the data model supports.
- The refactor it requires (extracting `launchCampaign` from `handleStart`) is
  something the codebase wants anyway (NewGame's `handleStart` is ~120 lines of
  pipeline inside a page component).
- B is rejected as the mechanism (location model makes it infeasible without
  re-authoring; retro town-cache mutation is a back-compat landmine), but B-prime
  ("world-native sequels") stays on the roadmap as future premium epilogue content.

## 6. Phased implementation plan

**Phase 1: records + CTA (small, ships value immediately)**
- Additive settings fields: `completedCampaigns`, `chain`, `continuedInSessionId`.
- Campaign-complete modal (via `MODAL_REGISTRY`/`ModalShell`), fired once from the two
  completion sites (`checkMilestoneEvent` in `Game.js`; the `CAMPAIGN_COMPLETE_REGEX`
  branch in `useGameInteraction.js`); Journal banner gains the CTA button.
- CTA can initially deep-link to New Game while Phase 2 lands.
- Tests: fingerprint already covers `campaignComplete`; add unit tests for the record
  accumulation and one-shot modal firing.

**Phase 2: the chain itself (core)**
- Extract `launchCampaign(template, { party, chain, worldTheme, seed })` from
  `handleStart` into `src/game/` (pure pipeline: merge names, generate map, spawn
  entities, pre-generate towns, pick side quests, build settings). `NewGame.js`
  becomes a consumer. NOTE: coordinate with the concurrent site/spawner work; this
  phase touches the same call sites (`spawnWorldMapEntities`, `injectQuestBuildings`,
  town pre-generation), so land it after that work settles.
- Chain flow: template picker with tier-fit sort + premium gates (`canUseTemplate`
  backstop inside `launchCampaign`), party deep-copy + heal policy, new
  `gameSessionId`, prologue composer (from old `summary` + completed milestones),
  navigate straight to `/game` with the carried party (skip hero selection).
- Old-save stamp (`continuedInSessionId`) + SavedGames badges.
- Tests: unit tests for `launchCampaign` (spawn success on every authored template),
  party-carry normalization, chain-record correctness; one e2e: complete t1 (debug
  fast-path via `/debug/milestones` patterns) -> chain -> assert new world + carried
  levels/gear + prologue present.

**Phase 3: entry points + fit polish**
- New Game "Continue with an existing party" path.
- Level-fit recommendations and warnings; verify t1-exit level against
  `progressionSystem.js`, add renown XP bonus if needed.
- Journal "Legend" section (past chapters).

**Phase 4: diegetic + memory polish (optional, after validation)**
- Option C notice-board/official contract via the `getAvailableQuestsAt` /
  `BuildingModal` offer plumbing, replacing the modal as the primary path (modal
  remains as the pointer to it).
- RAG seeding: index the prologue/legend summary into the new session's store.
- Tier-3 template authoring (unblocks the `comingSoon` stubs as chain destinations);
  consider B-prime world-native epilogues as premium content.

## 7. Open questions for the maintainer

1. **Same save vs linked save.** This plan assumes a NEW save linked to the old
   ("Chapter 2"), with the old save kept playable. Is that acceptable, or is
   literally-one-save continuity a hard requirement? (If hard, we take on the A2 risks:
   two-world journal, RAG contamination, destructive world swap.)
2. **Party carry policy.** Heal to full on chaining? Keep all gold/gear as-is, or any
   rebalance (t2 is tuned for a fresh Lv3 party, a t1 victor arrives gold-rich)? And
   may a party be exported from a save that has NOT completed its campaign (New Game
   "continue with existing party" from any save), or only from completed ones?
3. **Narrative carry depth.** Is a distilled prologue (from `summary` + milestone list)
   enough, or should RAG memories carry across worlds? (They reference old-world names,
   so the plan says: fresh index, optionally seeded with the prologue only.)
4. **Cross-genre chains.** Free choice of any next template (goblin farmers ->
   eldritch horror), or rail to same-genre next-tier with off-genre as an explicit
   "start a new legend" branch?
5. **Premium framing.** Is the completion CTA an acceptable premium surface (locked
   premium entries listed in the chain picker), and should desert/snow eventually get
   t2s so premium buyers can chain within their biome?
6. **Hero library write-back.** On campaign completion, should the leveled heroes also
   be written back to the hero library (as "veteran" copies) so they are reusable
   outside the chain flow? Today there is no write-back at all.
