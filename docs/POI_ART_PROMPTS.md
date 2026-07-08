# POI Arrival Art Prompts

## What this is

Sixteen milestone POIs currently have no arrival image. When a player reaches a
milestone POI, `worldMoveController.js` looks up an establishing "you have
arrived" image in its `POI_IMAGES` map (keys like `cave_entrance`, `ruins`,
`mountain`, `forest`, `hills`, `goblin_hideout`, each pointing at a `.webp` under
`public/assets/encounters/`). The POIs below have no key, so they render with no
image.

This doc lists each missing POI with a ready-to-use image-generation prompt,
grounded in the POI's authored name and its parent campaign theme, so the art can
be produced through the external Gemini image pipeline and dropped straight into
the app.

- **Debt source:** these entries are the MAP-01 items in `docs/CONTENT_AUDIT.md`
  (the content-audit debt list surfaced by `npm run audit`). Note: at time of
  writing `docs/CONTENT_AUDIT.md` / the MAP-01 check may not yet exist in the
  tree; this doc is the companion art backlog for that check.
- **Target asset path convention:** save each generated image to
  `public/assets/encounters/<poi_id>_arrival.webp`
  (for example `public/assets/encounters/shadow_fortress_arrival.webp`).
- **Wiring after generation:** add the POI id as a key in `POI_IMAGES` in
  `src/game/worldMoveController.js`, pointing at the new asset, for example
  `shadow_fortress: '/assets/encounters/shadow_fortress_arrival.webp',`. Once the
  key exists and the file is present, the MAP-01 audit check clears for that POI.

## Style preamble (prepend or append to every prompt)

Keep the whole set cohesive by combining every prompt below with this shared
descriptor:

> **STYLE:** Painterly fantasy illustration, digital matte-painting style,
> atmospheric establishing "arrival" shot of a location in a fantasy RPG.
> Cinematic wide landscape composition, moody natural lighting, rich environmental
> detail, sense of scale and place. No people or creatures in the foreground, no
> text, no words, no letters, no logos, no UI, no borders or frames. Realistic,
> slightly muted color palette consistent across the whole set.

Each POI prompt below describes only the subject and mood; prepend or append the
STYLE block so the sixteen images read as one coherent set alongside the existing
`*_site_arrival.webp` art.

## The 16 POIs

### 1. shadow_fortress

- **Campaign:** Heroic Fantasy, Tier 2 (Crown of Sunfire)
- **Authored name:** Shadow Fortress
- **Objective:** Breach the Shadow Fortress in the Greenridge Hills
- **Asset:** `public/assets/encounters/shadow_fortress_arrival.webp`
- **Prompt:** A brooding black-stone fortress rising from rolling green hills at
  dusk, its jagged towers wreathed in unnatural shadow that seems to swallow the
  fading light. Iron gates and battlements loom over a worn approach road, banners
  hanging dark and still. Classic high-fantasy castle architecture, ominous and
  imposing, storm light bruising the sky behind the keep.

### 2. sandstorm_hideout

- **Campaign:** Desert Expedition, Tier 1 (The Sunscorched Road)
- **Authored name:** Sandstorm Hideout
- **Objective:** Find the cult's hideout among the Scorched Bluffs
- **Asset:** `public/assets/encounters/sandstorm_hideout_arrival.webp`
- **Prompt:** A hidden cultist hideout tucked into a cleft of wind-carved red-rock
  desert bluffs, half-buried by drifting sand and shrouded by a distant advancing
  sandstorm on the horizon. Rough-hewn entrances and tattered cloth awnings mark
  the lair among the rocks, harsh sun bleaching the cracked stone. Arid, hostile,
  desolate expedition atmosphere.

### 3. sunken_spire

- **Campaign:** Desert Expedition, Tier 2 (The Waking Sands)
- **Authored name:** The Sunken Spire
- **Objective:** Descend into the Sunken Spire beneath the Scorched Bluffs
- **Asset:** `public/assets/encounters/sunken_spire_arrival.webp`
- **Prompt:** The tip of an ancient, ornately carved stone spire jutting up out of
  a sea of desert dunes, most of the tower swallowed and buried beneath the sand
  below the Scorched Bluffs. A dark opening at its crown descends into shadow
  underground. Sun-scorched, timeless, mysterious lost-civilization mood, heat
  haze shimmering over the endless sand.

### 4. glacier_hollow

- **Campaign:** Frozen Frontier, Tier 1 (The Deepening Frost)
- **Authored name:** The Glacier Hollow
- **Objective:** Climb to the wraith's lair among the Rimefang Peaks
- **Asset:** `public/assets/encounters/glacier_hollow_arrival.webp`
- **Prompt:** A vast hollow cavern carved into the blue heart of a glacier high in
  jagged snow-capped mountains, its icy mouth glowing with cold cerulean light.
  Frost-rimed rock and hanging icicles frame the entrance, a bitter wind lifting
  snow across the frozen approach. Arctic, still, haunted stillness of a wraith's
  frozen lair.

### 5. silent_steading

- **Campaign:** Frozen Frontier, Tier 2 (The Hungering Thaw)
- **Authored name:** The Silent Steading
- **Objective:** Search the silent steading outside Frosthollow
- **Asset:** `public/assets/encounters/silent_steading_arrival.webp`
- **Prompt:** An abandoned frontier farmstead of timber longhouses and snow-laden
  roofs standing utterly silent in a frozen valley outside a mountain settlement,
  no smoke from the chimneys, doors left ajar. Fresh snowfall blankets an empty
  yard, tracks half-erased, an eerie unnatural quiet hanging over the deserted
  steading. Cold grey overcast light, foreboding arctic emptiness.

### 6. famine_barrow

- **Campaign:** Frozen Frontier, Tier 2 (The Hungering Thaw)
- **Authored name:** The Famine Barrow
- **Objective:** Climb to the Famine Barrow bared by the melting ice
- **Asset:** `public/assets/encounters/famine_barrow_arrival.webp`
- **Prompt:** An ancient burial barrow of piled stone and moss newly exposed by
  melting glacial ice high on a bleak mountain slope, its dark lintelled entrance
  yawning open where the thaw has stripped away the snow. Meltwater trickles over
  cold grey stone, ravens circling a colorless sky. Grim, ominous, a tomb of an
  old famine-winter dread laid bare.

### 7. abandoned_well

- **Campaign:** Grimdark Survival, Tier 1 (The Blighted Village)
- **Authored name:** The Poisoned Well
- **Objective:** Search the abandoned well at Mudhollow for clues
- **Asset:** `public/assets/encounters/abandoned_well_arrival.webp`
- **Prompt:** A crumbling old stone village well in the muddy center of a blighted,
  half-deserted hamlet, its water gone black and foul, sickly green scum around the
  rim. Sagging thatched hovels and dead trees surround the mire under a heavy grey
  sky. Bleak, plague-touched, grimdark survival atmosphere, everything damp and
  rotting.

### 8. grimstead_cellar

- **Campaign:** Grimdark Survival, Tier 1 (The Blighted Village)
- **Authored name:** Grimstead Cellar
- **Objective:** Track the blight to its source in the Grimstead cellar
- **Asset:** `public/assets/encounters/grimstead_cellar_arrival.webp`
- **Prompt:** The gaping stone-arched entrance to a dark cellar beneath a ruined
  village house in Grimstead, worn steps descending into blackness, walls streaked
  with creeping blight and pale fungus. A single ruined door hangs off its hinges,
  faint sickly light within. Damp, oppressive, diseased grimdark dungeon-mouth
  mood under a dim overcast day.

### 9. ironhold_ruins

- **Campaign:** Grimdark Survival, Tier 2 (The Rot-Heart)
- **Authored name:** Ironhold Ruins
- **Objective:** Establish a fortified camp in the ruins of Ironhold
- **Asset:** `public/assets/encounters/ironhold_ruins_arrival.webp`
- **Prompt:** The broken shell of a once-great fortress-town, Ironhold, now a
  windswept ruin of shattered walls and toppled towers on a bleak moor, defensible
  stone still standing enough to shelter a camp. Rusting iron gates and collapsed
  ramparts under a bruised, colorless sky. Desolate, hard-bitten last-stronghold
  survival mood, cold wind and dead grass.

### 10. rot_tunnels

- **Campaign:** Grimdark Survival, Tier 2 (The Rot-Heart)
- **Authored name:** The Rot Tunnels
- **Objective:** Navigate the rot tunnels beneath Rotfall
- **Asset:** `public/assets/encounters/rot_tunnels_arrival.webp`
- **Prompt:** The dripping mouth of a foul underground tunnel network beneath the
  village of Rotfall, slick walls thick with wet black rot, pulsing veins of pale
  fungus and clinging slime, a stench almost visible in the fetid air. Faint
  diseased bioluminescence glows deeper in. Claustrophobic, visceral, decaying
  grimdark dungeon entrance.

### 11. gear_end_sewers

- **Campaign:** Arcane Renaissance, Tier 1 (The Rogue Automaton)
- **Authored name:** Gear-End Sewers
- **Objective:** Locate the automaton's lair in the Gear-End sewers
- **Asset:** `public/assets/encounters/gear_end_sewers_arrival.webp`
- **Prompt:** A grimy magitech sewer tunnel beneath an industrial clockwork
  city district, brass pipes and turning brass gears set into dripping brick
  walls, faint aetheric blue lamplight glinting off oily water and rusted
  machinery. Steam curls from riveted valves. Gritty steampunk-fantasy
  undercity, mechanical and dim, the hidden lair of a rogue automaton.

### 12. coghill_foundry

- **Campaign:** Arcane Renaissance, Tier 2 (Herald of the Old Gods)
- **Authored name:** Destroyed Foundry
- **Objective:** Investigate the explosion at the Cog-Hill foundry
- **Asset:** `public/assets/encounters/coghill_foundry_arrival.webp`
- **Prompt:** The wrecked ruin of a great industrial foundry on Cog-Hill, roof
  blown open by a catastrophic explosion, twisted brass machinery and shattered
  boilers strewn amid scorched brickwork and drifting smoke. Broken gears and
  cracked aether conduits spark faintly. Steampunk-fantasy magitech disaster,
  smoldering wreckage under a grey industrial sky, embers still glowing.

### 13. desecrated_shrine

- **Campaign:** Eldritch Horror, Tier 1 (The Blackwood Cult)
- **Authored name:** Desecrated Shrine
- **Objective:** Investigate the desecrated shrine at Grey-Haven
- **Asset:** `public/assets/encounters/desecrated_shrine_arrival.webp`
- **Prompt:** A once-holy woodland shrine desecrated by a cult, its stone altar
  cracked and daubed with unnatural sigils, guttering candles and strange
  offerings scattered in the gloom of a mist-choked grey forest clearing. Wrong
  geometry and a faint sickly glow suggest something profane. Cosmic-horror dread,
  cold fog, sense of a violated sacred place, unsettling and wrong.

### 14. cult_meeting_place

- **Campaign:** Eldritch Horror, Tier 1 (The Blackwood Cult)
- **Authored name:** The Barrow Circle
- **Objective:** Follow the cult to their meeting place in The Barrows
- **Asset:** `public/assets/encounters/cult_meeting_place_arrival.webp`
- **Prompt:** A ring of ancient standing stones atop grassy burial barrows under a
  bruised twilight sky, cold blue mist pooling between the monoliths where a cult
  gathers by night, faint carved eldritch symbols on the weathered stones. Empty
  and waiting, an unnatural stillness in the air. Cosmic-horror atmosphere,
  ominous megalithic circle, dread and wrongness.

### 15. corrupted_lighthouse

- **Campaign:** Eldritch Horror, Tier 2 (The Great Dreamer)
- **Authored name:** Corrupted Lighthouse
- **Objective:** Cleanse the corrupted lighthouse at Whisper-Cove
- **Asset:** `public/assets/encounters/corrupted_lighthouse_arrival.webp`
- **Prompt:** A gaunt coastal lighthouse on a jagged sea cliff at Whisper-Cove, its
  beacon corrupted to cast a sickly non-euclidean green-purple light out over a
  churning black ocean, barnacle-crusted stone streaked with alien growths and
  writhing shadow. Storm surf pounds the rocks below. Cosmic-horror seascape,
  drowned-god dread, oppressive and hallucinatory.

### 16. mourn_peak_summit

- **Campaign:** Eldritch Horror, Tier 2 (The Great Dreamer)
- **Authored name:** Mourn-Peak Summit
- **Objective:** Survive a vision of the Void at the summit of Mourn-Peak
- **Asset:** `public/assets/encounters/mourn_peak_summit_arrival.webp`
- **Prompt:** A bleak, wind-scoured mountain summit above the clouds where the sky
  tears open into a yawning cosmic void, impossible stars and a vast dreaming
  presence bleeding through the rift over the barren rock. Thin air, colorless
  stone, reality warping at the edges. Cosmic-horror sublime terror, vertiginous
  altitude, a vision of the Void breaking through.

## Checklist (per POI)

1. **Generate** the image from its prompt above (plus the shared STYLE preamble).
2. **Save** it to `public/assets/encounters/<poi_id>_arrival.webp`.
3. **Wire it up:** add the `<poi_id>` key to `POI_IMAGES` in
   `src/game/worldMoveController.js`, pointing at the new asset.
4. **Verify:** run `npm run audit` and confirm the MAP-01 check clears for that
   POI (no remaining "POI missing arrival image" entry).
