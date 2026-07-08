# Campaign Milestones Overview

This is a maintained, at-a-glance overview of every campaign's milestone structure,
generated from `src/data/storyTemplates.js` (the `storyTemplates` array, the single
source of truth). Its purpose is to let the maintainer see each campaign's shape
without reading the data file, and in particular to evaluate **parallelism**: which
milestones are co-active (open at the same time) versus strictly sequenced.

Campaign content integrity (every referenced item/NPC/POI/building/reward actually
wiring up) is enforced separately by the content audit: run `npm run audit`, see
`docs/CONTENT_AUDIT.md`. This document is descriptive, not enforced; if it drifts from
the data, the data wins. Regenerate it when milestones change.

Notes on reading this doc:

- **Co-active at start** = the number of milestones whose `requires` is empty (`[]`).
  Milestone 1 always opens immediately; any *other* milestone with an empty `requires`
  is co-active with it from turn one. Higher counts mean more of the campaign is open
  in parallel rather than gated in a chain.
- **Tier label** reflects the access gate, not the campaign's difficulty tier (t1/t2):
  templates with no `premium` flag are **free**; `premium: true` templates gate at
  **member** (`canUseTheme`/`canUseTemplate` in `src/game/entitlements.js`); templates
  carrying `minTier: 'premium'` gate at **premium**. The ladder is
  free < member < premium < elite.
- **Type** is one of item / combat / location / talk / narrative. item/combat/location/
  talk are engine-detected (mechanical); narrative is AI-judged via `[COMPLETE_MILESTONE]`.
- Combat milestones carry both a milestone `rewards` (on completion) and a separate boss
  `encounter.rewards` (the loot drop). The Rewards column shows the boss loot for combat
  rows, since that is the notable item; the flat completion XP/gold is omitted there for
  brevity.

## Summary: parallelism at a glance

| Campaign (id) | Access | Diff. tier | Level | Milestones | Co-active at start | Shape |
|---|---|---|---|---|---|---|
| heroic-fantasy-t1 | free | 1 | 1-2 | 4 | 2 (M1, M2) | 2 parallel then chain |
| heroic-fantasy-t2 | free | 2 | 3-5 | 4 | 2 (M1, M2) | 2 parallel then chain |
| desert-expedition-t1 | member | 1 | 1-2 | 4 | 2 (M1, M2) | 2 parallel then chain |
| desert-expedition-t2 | member | 2 | 3-5 | 4 | 2 (M1, M2) | 2 parallel then chain |
| frozen-frontier-t1 | member | 1 | 1-2 | 4 | 2 (M1, M2) | 2 parallel then chain |
| **frozen-frontier-t2** | member | 2 | 3-5 | 5 | **3 (M1, M2, M3)** | **3 parallel then chain** |
| grimdark-survival-t1 | free | 1 | 1-2 | 4 | 2 (M1, M2) | 2 parallel then chain |
| grimdark-survival-t2 | free | 2 | 3-4 | 4 | 2 (M1, M2) | 2 parallel then chain |
| arcane-renaissance-t1 | free | 1 | 1-2 | 4 | 2 (M1, M2) | 2 parallel then chain |
| arcane-renaissance-t2 | free | 2 | 3-4 | 4 | 2 (M1, M2) | 2 parallel then chain |
| eldritch-horror-t1 | member | 1 | 1-2 | 4 | 2 (M1, M2) | 2 parallel then chain |
| eldritch-horror-t2 | member | 2 | 3-5 | 4 | 2 (M1, M2) | 2 parallel then chain |

**Odd one out:** `frozen-frontier-t2` is the only campaign that opens with **three**
co-active milestones (M1, M2, M3 all have `requires: []`). Every other campaign opens
with exactly two. This is the case flagged for review, confirmed from the data below.

Teaser / coming-soon stubs (no milestones authored in the public bundle) are listed at
the end.

---

## Heroic Fantasy

Genre `heroic-fantasy`. Free tier. Shared geography across both chapters:
towns **Willowdale, Briarwood, Thornfield, Millhaven**; mountains **Greenridge Hills**.
The t2 chapter is a same-world sequel that deliberately reuses different venues so it can
be injected into a completed t1 save without colliding.

### heroic-fantasy-t1: "The Goblin Threat"

- Access: free | Difficulty tier 1 | Levels 1-2 | Biome: default (heroic-fantasy)
- Towns: Willowdale, Briarwood, Thornfield, Millhaven (+ Greenridge Hills)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | item | Find the goblin scout's map in the Willowdale tavern | - | item: Goblin Scout's Map | The Crooked Pint (tavern, Willowdale) | 25 XP / 1d6 |
| 2 | talk | Meet the militia captain at Briarwood | - | npc: Captain Ulric (Guard) | Briarwood Militia Hall (barracks, Briarwood) | 25 XP / 1d6 / rations |
| 3 | location | Track the goblins to their hideout in the Greenridge Hills | 1, 2 | poi: Goblin Hideout | - | 50 XP / 1d10 |
| 4 | combat | Defeat the Goblin Chieftain | 3 | enemy: Goblin Chieftain (HP 30, medium) | - | boss loot: rusty_dagger (75 XP / 2d10) |

**Parallelism:** M1 (item) and M2 (talk) both open immediately. M3 requires [1, 2];
M4 requires [3]. So: 2 parallel openers, then a strict chain to the boss.

### heroic-fantasy-t2: "Crown of Sunfire"

- Access: free | Difficulty tier 2 | Levels 3-5 | Biome: default (heroic-fantasy)
- Towns: Willowdale, Briarwood, Thornfield, Millhaven (+ Greenridge Hills)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | item | Find the hidden map in the archives of Millhaven | - | item: Hidden Map | The Great Archives (archives, Millhaven) | 100 XP / 2d10 |
| 2 | narrative | Convince the Thornfield Guard to join the resistance | - | npc: Captain Aldric (Guard) | Thornfield Guard Barracks (barracks, Thornfield) | 150 XP / 1d20 / quest_key |
| 3 | location | Breach the Shadow Fortress in the Greenridge Hills | 1, 2 | poi: Shadow Fortress | - | 200 XP / 3d20 |
| 4 | combat | Defeat the Shadow Overlord | 3 | enemy: Shadow Overlord (HP 250, deadly, DC 20) | - | boss loot: crown_of_sunfire (500 XP / 5d20) |

**Parallelism:** M1 (item) and M2 (narrative) both open immediately. M3 requires [1, 2];
M4 requires [3]. 2 parallel openers, then a chain.

---

## Desert Expedition (member / premium biome)

Genre `desert-expedition`, world biome `desert` (premium theme, so `premium: true`;
gates at member). Shared geography: towns **Sandreach, Dustmere, Oasis Karn, Suncradle**;
mountains **The Scorched Bluffs**. t2 is a same-world sequel.

### desert-expedition-t1: "The Sunscorched Road"

- Access: member | Difficulty tier 1 | Levels 1-2 | Biome: desert
- Towns: Sandreach, Dustmere, Oasis Karn, Suncradle (+ The Scorched Bluffs)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | item | Recover the lost caravan ledger from the Sandreach trading post | - | item: Caravan Ledger | The Sandreach Caravanserai (warehouse, Sandreach) | 25 XP / 1d6 |
| 2 | narrative | Win the trust of the well-keeper at Oasis Karn | - | npc: Keeper Najwa (Merchant) | The Last Drop (inn, Oasis Karn) | 25 XP / 1d6 / rations |
| 3 | location | Find the cult's hideout among the Scorched Bluffs | 1, 2 | poi: Sandstorm Hideout | - | 50 XP / 1d10 |
| 4 | combat | Defeat the Sandstorm Cult Leader | 3 | enemy: Sandstorm Cult Leader (HP 30, medium) | - | boss loot: rusty_dagger (75 XP / 2d10) |

**Parallelism:** M1 (item) and M2 (narrative) open immediately. M3 requires [1, 2];
M4 requires [3]. 2 parallel openers, then a chain.

### desert-expedition-t2: "The Waking Sands"

- Access: member | Difficulty tier 2 | Levels 3-5 | Biome: desert
- Towns: Sandreach, Dustmere, Oasis Karn, Suncradle (+ The Scorched Bluffs)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | item | Recover the Sun-Kings' star-chart from the Dustmere records hall | - | item: Sun-Kings' Star-Chart | The Dustmere Records Hall (archives, Dustmere) | 100 XP / 2d10 |
| 2 | talk | Seek out the last wyrm-hunter at Suncradle | - | npc: Huntress Zahra (Guild Master) | The Wyrmhunters' Lodge (guild, Suncradle) | 150 XP / 1d20 / rations |
| 3 | location | Descend into the Sunken Spire beneath the Scorched Bluffs | 1, 2 | poi: The Sunken Spire | - | 200 XP / 3d20 |
| 4 | combat | Slay the Dune Wyrm | 3 | enemy: The Dune Wyrm (HP 250, deadly, DC 20) | - | boss loot: dragonscale_plate (500 XP / 5d20) |

**Parallelism:** M1 (item) and M2 (talk) open immediately. M3 requires [1, 2];
M4 requires [3]. 2 parallel openers, then a chain.

---

## Frozen Frontier (member / premium biome)

Genre `frozen-frontier`, world biome `snow` (premium theme, so `premium: true`; gates at
member). Shared geography: towns **Hearthmere (pinned size: village), Frosthollow, Icemoor,
Winterreach**; mountains **The Rimefang Peaks**. t2 is a same-world sequel and is the
structural outlier of the whole set.

### frozen-frontier-t1: "The Deepening Frost"

- Access: member | Difficulty tier 1 | Levels 1-2 | Biome: snow
- Towns: Hearthmere (village), Frosthollow, Icemoor, Winterreach (+ The Rimefang Peaks)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | item | Recover the frozen survey ledger from the Hearthmere trading post | - | item: Frostbound Ledger | The Hearthmere Trading Post (warehouse, Hearthmere) | 25 XP / 1d6 |
| 2 | talk | Win the trust of the pathfinder at Frosthollow | - | npc: Warden Sigrun (Guard) | The Frosthollow Lodge (inn, Frosthollow) | 25 XP / 1d6 / rations |
| 3 | location | Climb to the wraith's lair among the Rimefang Peaks | 1, 2 | poi: The Glacier Hollow | - | 50 XP / 1d10 |
| 4 | combat | Destroy the Hoarfrost Wraith | 3 | enemy: The Hoarfrost Wraith (HP 32, medium) | - | boss loot: storm_crystal (75 XP / 2d10) |

**Parallelism:** M1 (item) and M2 (talk) open immediately. M3 requires [1, 2];
M4 requires [3]. 2 parallel openers, then a chain. Same shape as every t1.

### frozen-frontier-t2: "The Hungering Thaw"  (FLAGGED: 3 co-active openers)

- Access: member | Difficulty tier 2 | Levels 3-5 | Biome: snow
- Towns: Hearthmere (village), Frosthollow, Icemoor, Winterreach (+ The Rimefang Peaks)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | item | Recover the famine-winter saga from the Icemoor sanctuary | - | item: The Famine-Winter Saga | The Icemoor Sanctuary (temple, Icemoor) | 100 XP / 2d10 |
| 2 | location | Search the silent steading outside Frosthollow | - | poi: The Silent Steading | - | 125 XP / 2d10 / quest_clue |
| 3 | talk | Hear the old hunter's counsel at Winterreach | - | npc: Old Maren (Villager) | The Long Night Hall (tavern, Winterreach) | 150 XP / 1d20 / rations |
| 4 | location | Climb to the Famine Barrow bared by the melting ice | 1, 2, 3 | poi: The Famine Barrow | - | 175 XP / 3d20 |
| 5 | combat | Destroy the Pale Hunger | 4 | enemy: The Pale Hunger (HP 250, deadly, DC 20) | - | boss loot: runic_greatsword (450 XP / 5d20) |

**Parallelism (the case under review):** this campaign has **5 milestones** and opens
with **three co-active milestones**. M1 (item), M2 (location) and M3 (talk) all have
`requires: []`, so all three are available from turn one across three different towns
(Icemoor, Frosthollow, Winterreach). M4 requires **[1, 2, 3]** (all three openers must be
done), and M5 requires [4]. Shape: 3 parallel gathering objectives converge on M4, then a
final boss step. **Confirmed against the data: frozen-frontier-t2 does open with 3
co-active milestones (M1, M2, M3 all `requires: []`).** It is the only campaign that does.

---

## Grimdark Survival (free)

Genre `grimdark-survival`. Free tier. The two chapters do **not** share geography (t1 uses
Ashford/Mudhollow/Grimstead/Duskwell + Grey Moors; t2 uses Rotfall/Ironhold/Shadow-Crest/
Pale-Reach + Blightspine Ridge), so t2 is a fresh-world sequel rather than a same-world one.

### grimdark-survival-t1: "The Blighted Village"

- Access: free | Difficulty tier 1 | Levels 1-2 | Biome: default (grimdark-survival)
- Towns: Ashford (village), Mudhollow, Grimstead, Duskwell (+ Grey Moors)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | item | Gather healing herbs from the Grey Moors for the village healer | - | item: Moorland Herbs | - | 25 XP / 1d6 / herbal_remedy |
| 2 | location | Search the abandoned well at Mudhollow for clues | - | poi: The Poisoned Well | - | 25 XP / 1d6 / quest_clue |
| 3 | location | Track the blight to its source in the Grimstead cellar | 1, 2 | poi: Grimstead Cellar | - | 50 XP / 1d10 |
| 4 | combat | Slay the Blightspawn lurking beneath Grimstead | 3 | enemy: Blightspawn (HP 25, medium) | - | boss loot: antidote (50 XP / 1d10) |

**Parallelism:** M1 (item) and M2 (location) open immediately. M3 requires [1, 2];
M4 requires [3]. 2 parallel openers, then a chain.

### grimdark-survival-t2: "The Rot-Heart"

- Access: free | Difficulty tier 2 | Levels 3-4 | Biome: default (grimdark-survival)
- Towns: Rotfall, Ironhold, Shadow-Crest, Pale-Reach (+ Blightspine Ridge)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | location | Establish a fortified camp in the ruins of Ironhold | - | poi: Ironhold Ruins | - | 75 XP / 1d10 / rations |
| 2 | item | Capture a mutated specimen for the alchemist at Pale-Reach | - | item: Mutated Specimen | The Blighted Laboratory (alchemist, Pale-Reach) | 125 XP / 2d10 / antidote |
| 3 | location | Navigate the rot tunnels beneath Rotfall | 1, 2 | poi: The Rot Tunnels | - | 150 XP / 2d20 / cave_map |
| 4 | combat | Destroy the Rot-Heart in the depths of Rotfall | 3 | enemy: The Rot-Heart (HP 150, hard) | - | boss loot: purified_heart_shard (350 XP / 3d20) |

**Parallelism:** M1 (location) and M2 (item) open immediately. M3 requires [1, 2];
M4 requires [3]. 2 parallel openers, then a chain.

---

## Arcane Renaissance (free)

Genre `arcane-renaissance`. Free tier. Fresh-world sequel (t1: Cogsworth/Tinker-Row/
Brasswick/Gear-End + Copper Ridge; t2: Novaris [city]/Aether-Gate/Steam-Wharf/Cog-Hill +
Ironpeak Range).

### arcane-renaissance-t1: "The Rogue Automaton"

- Access: free | Difficulty tier 1 | Levels 1-2 | Biome: default (arcane-renaissance)
- Towns: Cogsworth, Tinker-Row, Brasswick, Gear-End (+ Copper Ridge)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | item | Find the control rod in the Tinker-Row workshop | - | item: Automaton Control Rod | Tinker-Row Workshop (workshop, Tinker-Row) | 25 XP / 1d6 |
| 2 | narrative | Interview the artificer's apprentice at Brasswick | - | npc: Pip Gearsley (Merchant) | Gearsley's Parts Shop (workshop, Brasswick) | 25 XP / 1d6 / journal_page |
| 3 | location | Locate the automaton's lair in the Gear-End sewers | 1, 2 | poi: Gear-End Sewers | - | 50 XP / 1d10 |
| 4 | combat | Disable the Rogue Automaton | 3 | enemy: Rogue Automaton (HP 35, medium) | - | boss loot: rare_ore (75 XP / 2d10) |

**Parallelism:** M1 (item) and M2 (narrative) open immediately. M3 requires [1, 2];
M4 requires [3]. 2 parallel openers, then a chain.

### arcane-renaissance-t2: "Herald of the Old Gods"

- Access: free | Difficulty tier 2 | Levels 3-4 | Biome: default (arcane-renaissance)
- Towns: Novaris (city), Aether-Gate, Steam-Wharf, Cog-Hill (+ Ironpeak Range)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | location | Investigate the explosion at the Cog-Hill foundry | - | poi: Destroyed Foundry | The Cog-Hill Foundry (foundry, Cog-Hill) | 100 XP / 2d10 / journal_page |
| 2 | item | Retrieve the stolen blueprints from the Aether-Gate syndicate | - | item: Stolen Aether Blueprints | Syndicate Warehouse (warehouse, Aether-Gate) | 125 XP / 2d20 |
| 3 | narrative | Consult the Oracle of Steam in the depths of Steam-Wharf | 1, 2 | npc: The Oracle of Steam (Merchant) | The Steam Sanctum (temple, Steam-Wharf) | 150 XP / 1d20 / hermit_wisdom |
| 4 | combat | Banish the Herald of the Old Gods at Ironpeak Range | 3 | enemy: Herald of the Old Gods (HP 200, deadly, DC 19) | - | boss loot: stormbound_ring (450 XP / 4d20) |

**Parallelism:** M1 (location) and M2 (item) open immediately. M3 requires [1, 2];
M4 requires [3]. 2 parallel openers, then a chain. Note M3 is a narrative milestone gated
behind both openers (a mid-chain narrative step, unlike the t1 chapters that put narrative
at an opener slot).

---

## Eldritch Horror (member / premium)

Genre `eldritch-horror`. `premium: true`, gates at member (per the 2026-07-06 ladder
decision). Fresh-world sequel (t1: Hollowmarsh/Grey-Haven/Mistfall/Fogmere + The Barrows;
t2: Blackwood [town]/Whisper-Cove/Mourn-Peak/Abyssal-Rest + Mourn-Peak Heights).

### eldritch-horror-t1: "The Blackwood Cult"

- Access: member | Difficulty tier 1 | Levels 1-2 | Biome: default (eldritch-horror)
- Towns: Hollowmarsh, Grey-Haven, Mistfall, Fogmere (+ The Barrows)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | item | Find the cult's coded journal in the Hollowmarsh inn | - | item: Cult Journal | The Drowned Lantern (tavern, Hollowmarsh) | 25 XP / 1d6 / quest_clue |
| 2 | location | Investigate the desecrated shrine at Grey-Haven | - | poi: Desecrated Shrine | - | 25 XP / 1d6 / mysterious_letter |
| 3 | location | Follow the cult to their meeting place in The Barrows | 1, 2 | poi: The Barrow Circle | - | 50 XP / 1d10 |
| 4 | combat | Defeat the Cult Leader and disrupt the ritual | 3 | enemy: The Hooded Priest (HP 30, medium) | - | boss loot: ritual_dagger (75 XP / 2d10) |

**Parallelism:** M1 (item) and M2 (location) open immediately. M3 requires [1, 2];
M4 requires [3]. 2 parallel openers, then a chain.

### eldritch-horror-t2: "The Great Dreamer"

- Access: member | Difficulty tier 2 | Levels 3-5 | Biome: default (eldritch-horror)
- Towns: Blackwood (town), Whisper-Cove, Mourn-Peak, Abyssal-Rest (+ Mourn-Peak Heights)

| # | Type | Objective | Requires | Spawn (item/NPC/POI/enemy) | Building / Venue | Rewards |
|---|---|---|---|---|---|---|
| 1 | item | Decode the ritual text found in the Blackwood library | - | item: Forbidden Ritual Text | Blackwood Library (library, Blackwood) | 100 XP / 1d10 / forbidden_knowledge |
| 2 | location | Cleanse the corrupted lighthouse at Whisper-Cove | - | poi: Corrupted Lighthouse | - | 125 XP / 2d10 / divine_blessing |
| 3 | location | Survive a vision of the Void at the summit of Mourn-Peak | 1, 2 | poi: Mourn-Peak Summit | - | 150 XP / 1d20 / ancient_knowledge |
| 4 | combat | Seal the Abyssal Breach and banish the Great Dreamer | 3 | enemy: The Great Dreamer (HP 300, deadly, DC 19) | - | boss loot: seal_of_binding (500 XP / 4d20) |

**Parallelism:** M1 (item) and M2 (location) open immediately. M3 requires [1, 2];
M4 requires [3]. 2 parallel openers, then a chain.

---

## Teaser / coming-soon stubs (no milestones)

These templates ship as card faces only. The public bundle carries their id, names, tier,
level band, blurb and art, but **no `milestones`, `customNames`, NPCs, or rewards**.
Teaser stubs (`teaser: true`) receive their playable content by server delivery at
sign-in (`registerPremiumTemplates`), replacing the stub by id; `comingSoon` entries are
placeholders with no delivery yet. None are startable from the public data alone, so there
is no milestone structure to document here.

| id | Name / subtitle | Kind | Access (minTier) | Level |
|---|---|---|---|---|
| tidewater-t1 | Tidewater - The Backward Tide | teaser | premium | 1-2 |
| tidewater-t2 | Tidewater - The First Bell | teaser | premium | 3-5 |
| tidewater-t3 | Tidewater - The Drowned Bells | teaser | premium | 4-6 |
| heroic-fantasy-t3 | Heroic Fantasy - The Shattered Throne | teaser | free | 5-7 |
| grimdark-survival-t3 | Grimdark Survival - The Last Winter | comingSoon | free | 5-7 |
| arcane-renaissance-t3 | Arcane Renaissance - The Clockwork God | comingSoon | free | 5-7 |
| eldritch-horror-t3 | Eldritch Horror - The Drowned City | comingSoon | member | 5-7 |

Note: the built-in `heroic-fantasy-t3` `comingSoon` entry is replaced at load time by the
`heroic-fantasy-t3` shop-window teaser stub (same id), which is why it appears above as a
teaser rather than a coming-soon placeholder.
