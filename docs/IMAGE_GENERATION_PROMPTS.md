# Image Generation Prompts

Prompts for generating game art via `scripts/generate_image_api.js` (Gemini).

```bash
# Single image
node scripts/generate_image_api.js "prompt text" output.png

# Batch (edit generate_batch_api.js items array, then)
node scripts/generate_batch_api.js
```

---

## Style Guide

**Item icons** use: *"Painterly digital fantasy art with rich [material] textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset."*

**Encounter/boss images** should use: *"Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition (16:9). No text or UI elements."*

**Template cards** should use: *"Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition (16:9). Rich color palette, painterly style. No text, no UI, no borders."*

---

## 1. Quest Boss Encounter Images

Output directory: `public/assets/encounters/bosses/`

### Heroic Fantasy — Tier 1 - COMPLETE

| Key | Prompt |
|-----|--------|
| `goblin_chieftain` | A snarling goblin chieftain in crude iron crown and patchwork armor, standing atop a pile of stolen goods in a torch-lit cave. Green skin, red eyes, wielding a jagged scimitar. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |
| `orc_warchief` | A massive orc warchief in blood-spattered plate armor, roaring a battle cry on a burning battlefield. Tusked face scarred from countless fights, wielding a two-handed war axe. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |
| `troll_bridge_guard` | A hulking moss-covered troll blocking a narrow stone bridge over a misty gorge. Massive club in hand, tiny intelligent eyes glaring. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |
| `bandit_king` | A charismatic bandit king in a weathered leather longcoat, seated on a makeshift throne of stolen crates in a forest hideout. Scarred face, confident smirk, dual daggers at his belt. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |

### Heroic Fantasy — Tier 2 - COMPLETE

| Key | Prompt |
|-----|--------|
| `shadow_overlord` | A towering shadow overlord in ornate black armor wreathed in dark purple energy, standing in a ruined throne room. Glowing violet eyes beneath a horned crown, tendrils of shadow swirling around armored gauntlets. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |
| `warlord` | An iron warlord in battle-scarred full plate armor standing before a burning castle. Grizzled face, commanding presence, holding a massive greatsword planted point-down. Army banners in the background. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |
| `dragon_wyrm` | A fearsome red wyrm dragon coiled atop a mountain of gold in a vast cavern. Scales gleaming like molten iron, wings spread wide, breathing a torrent of flame. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |
| `fallen_paladin` | A fallen paladin in cracked and tarnished silver armor, corrupted holy symbols glowing sickly green. Standing in a desecrated chapel, broken stained glass behind. Eyes burning with unholy light. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |

### Grimdark Survival — Tier 1 - COMPLETE

| Key | Prompt |
|-----|--------|
| `blightspawn` | A grotesque blightspawn creature — a writhing mass of fungal growths and rotting flesh shambling through a diseased swamp. Glowing spores drift from its body. Dark fantasy digital painting, dramatic cinematic lighting, sickly green and brown palette. Landscape composition 16:9. No text or UI elements. |
| `plague_rat_king` | A massive plague rat king — an enormous diseased rat with matted fur and glowing yellow eyes, surrounded by a swarm of smaller rats in a flooded sewer tunnel. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |
| `carrion_hag` | A hunched carrion hag with long clawed fingers and tattered robes, stirring a bubbling cauldron in a bone-strewn forest clearing. Pale skin, hollow black eyes, necklace of small skulls. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |
| `feral_ghoul` | A feral ghoul crouched on a ruined stone wall at night, emaciated grey body with exposed muscle, jaw unhinged in a silent scream. Moonlit graveyard behind. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |

### Grimdark Survival — Tier 2 - COMPLETE

| Key | Prompt |
|-----|--------|
| `rot_heart` | The Rot-Heart — a massive pulsating organic mass of corrupted flesh and vines in the center of a dead forest. Beating like a giant heart, dark ichor oozing from cracks, roots spreading corruption outward. Dark fantasy digital painting, dramatic cinematic lighting, sickly palette. Landscape composition 16:9. No text or UI elements. |
| `lich` | A bone tyrant lich in tattered royal robes, sitting on a throne of fused skeletons in a frozen crypt. Glowing blue eyes in a crowned skull, spectral energy crackling between skeletal fingers. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. |
| `plague_lord` | A plague lord in corroded armor dripping with toxic slime, standing in a field of dead crops. Bloated body, a cloud of buzzing flies, wielding a massive rusted flail. Dark fantasy digital painting, dramatic cinematic lighting, sickly green palette. Landscape composition 16:9. No text or UI elements. |
| `blood_wendigo` | A blood wendigo — a towering gaunt creature with antlers made of bone, blood-streaked white fur, standing in a blizzard-swept dead forest. Hollow eyes glowing red, elongated claws. Dark fantasy digital painting, dramatic cinematic lighting, cold blue and crimson palette. Landscape composition 16:9. No text or UI elements. |

### Arcane Renaissance — Tier 1 - COMPLETE

| Key | Prompt |
|-----|--------|
| `rogue_automaton` | A rogue automaton — a malfunctioning clockwork humanoid with exposed gears and sparking wires, rampaging through a Renaissance-style workshop. Brass and copper body, one eye flickering. Dark fantasy digital painting with steampunk elements, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |
| `clockwork_spider` | A giant clockwork spider with brass legs and a crystal core, descending from the ceiling of an arcane laboratory. Gears whirring, magical energy crackling between legs. Dark fantasy digital painting with steampunk elements, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |
| `rune_golem` | A massive rune golem made of carved stone blocks covered in glowing blue arcane runes, standing guard in a ruined magical academy. Cracks leaking magical energy. Dark fantasy digital painting, dramatic cinematic lighting, blue magical glow. Landscape composition 16:9. No text or UI elements. |
| `mad_alchemist` | A mad alchemist in a stained leather apron surrounded by bubbling apparatus in a chaotic laboratory. Wild eyes behind cracked goggles, holding a volatile glowing flask. Explosions of color. Dark fantasy digital painting with Renaissance elements, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |

### Arcane Renaissance — Tier 2 - COMPLETE

| Key | Prompt |
|-----|--------|
| `old_god_herald` | The Herald of the Old Gods — a towering mechanical angel made of brass and crystal, hovering above a ruined city. Wings of interlocking gears, face a featureless golden mask, arcane energy pouring from its chest. Dark fantasy digital painting, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |
| `arcane_colossus` | An arcane colossus — a building-sized construct of stone and metal animated by swirling magical energy, striding through a city of towers. Rune-covered body, glowing eyes, crushing buildings underfoot. Dark fantasy digital painting, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |
| `leyline_dragon` | A leyline dragon — a serpentine dragon made partially of crystallized magical energy, coiled around an arcane spire. Translucent scales revealing veins of pure mana, eyes like stars. Dark fantasy digital painting, dramatic cinematic lighting, vibrant magical colors. Landscape composition 16:9. No text or UI elements. |

### Eldritch Horror — Tier 1 - COMPLETE

| Key | Prompt |
|-----|--------|
| `cult_leader` | The Hooded Priest — a robed cultist leader performing a ritual in a candlelit underground chamber. Face hidden in shadow beneath a deep hood, hands raised over a glowing eldritch sigil on the floor. Dark fantasy digital painting, Lovecraftian atmosphere, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |
| `deep_one_scout` | A deep one scout — a fish-human hybrid creature emerging from dark ocean water onto a moonlit rocky shore. Scales glistening, bulging black eyes, webbed claws gripping barnacle-covered rocks. Dark fantasy digital painting, Lovecraftian atmosphere, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |
| `shadow_stalker` | A shadow stalker — a barely-visible humanoid shape made of living darkness, slipping between the pillars of a fog-shrouded alley. Only glowing white eyes visible, tendrils of shadow reaching outward. Dark fantasy digital painting, Lovecraftian atmosphere, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |
| `worm_that_walks` | The Worm That Walks — a vaguely humanoid shape composed entirely of thousands of writhing worms and maggots, wearing a tattered robe in a decrepit library. Dark fantasy digital painting, Lovecraftian atmosphere, body horror, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |

### Eldritch Horror — Tier 2 - COMPLETE

| Key | Prompt |
|-----|--------|
| `great_dreamer` | The Great Dreamer — a colossal tentacled entity slumbering beneath a dark ocean, visible through fractured reality. Mountainous body, countless tendrils, one enormous eye half-open. Tiny ships on the surface for scale. Dark fantasy digital painting, cosmic horror, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |
| `void_leviathan` | A void leviathan — an impossibly large serpentine creature swimming through a starfield of warped space. Body covered in eyes that see into other dimensions, reality bending around it. Dark fantasy digital painting, cosmic horror, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |
| `psionic_devourer` | A psionic devourer — a gaunt floating figure with translucent crystalline skin revealing a pulsing brain-like mass within its elongated skull. No mouth or nose, just three asymmetric glowing eyes. Thin clawed hands outstretched, violet psychic energy arcing between its fingers and nearby shattered crystals. Ornate chitinous armor fused to its body. Hovering in a vast underground chamber lined with glowing psionic geodes. Dark fantasy digital painting, Lovecraftian atmosphere, dramatic cinematic lighting. Landscape composition 16:9. No text or UI elements. |





---

## 2. Template Adventure Card Images

Output directory: `public/assets/templates/`

These are wide banner images shown on the adventure selection cards.

### Tier 1 Templates - COMPLETE

| Key | Prompt |
|-----|--------|
| `heroic-fantasy-t1` | A small band of adventurers approaching a goblin-infested village at sunset. Smoke rising from thatched roofs, distant green figures on the walls. Rolling green hills, warm golden light. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Rich color palette, painterly style. No text, no UI, no borders. |
| `grimdark-survival-t1` | A desolate blighted village with withered crops and dying trees under an overcast grey sky. A lone figure walking a muddy road toward crumbling buildings. Crows circling overhead, sickly mist. Epic dark fantasy illustration, sweeping landscape. Wide cinematic composition 16:9. Muted desaturated palette, painterly style. No text, no UI, no borders. |
| `arcane-renaissance-t1` | A Renaissance-style city with brass spires and clockwork towers, a malfunctioning automaton sparking in the town square. Citizens fleeing, gears scattered. Warm amber and copper tones. Epic fantasy illustration with steampunk elements, sweeping cityscape. Wide cinematic composition 16:9. Rich color palette, painterly style. No text, no UI, no borders. |
| `eldritch-horror-t1` | A fog-shrouded coastal village at night with hooded figures gathering around a bonfire on the beach. Strange symbols drawn in the sand, an unnatural green glow from the waves. Epic dark fantasy illustration, Lovecraftian atmosphere. Wide cinematic composition 16:9. Dark moody palette, painterly style. No text, no UI, no borders. |

### Tier 2 Templates - COMPLETE

| Key | Prompt |
|-----|--------|
| `heroic-fantasy-t2` | An epic vista of a dark fortress atop a craggy mountain, lightning striking its towers. An army with golden banners marching up the winding path. Dramatic sunset sky in orange and purple. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Rich vibrant palette, painterly style. No text, no UI, no borders. |
| `grimdark-survival-t2` | A massive pulsating organic growth consuming a dead forest, dark tendrils spreading across the land. A small party of grim warriors at the edge, looking in. Sickly red sky. Epic dark fantasy illustration, sweeping landscape. Wide cinematic composition 16:9. Dark desaturated palette with sickly accents, painterly style. No text, no UI, no borders. |
| `arcane-renaissance-t2` | A towering mechanical angel hovering above a sprawling Renaissance city, arcane energy raining down. Citizens looking up in awe and terror. Grand architecture, magical auroras in the sky. Epic fantasy illustration with arcane elements, sweeping cityscape. Wide cinematic composition 16:9. Rich magical palette, painterly style. No text, no UI, no borders. |
| `eldritch-horror-t2` | A vast dark ocean under alien stars, the silhouette of an impossibly large tentacled entity rising from the depths. Tiny ships capsizing in the waves. Unnatural purple and green aurora. Epic cosmic horror illustration, sweeping seascape. Wide cinematic composition 16:9. Dark palette with eldritch glows, painterly style. No text, no UI, no borders. |

### Tier 3 Templates - COMPLETE

| Key | Prompt |
|-----|--------|
| `heroic-fantasy-t3` | A shattered throne room floating in a void between dimensions, broken columns and cracked marble suspended in space. A lone hero silhouetted against a rift of golden light. Epic fantasy illustration, surreal otherworldly landscape. Wide cinematic composition 16:9. Rich dramatic palette, painterly style. No text, no UI, no borders. |
| `grimdark-survival-t3` | An endless frozen wasteland under a dying red sun, skeletal ruins of a civilization buried in ice. A small group of survivors trudging through deep snow, their breath visible. Epic dark fantasy illustration, desolate landscape. Wide cinematic composition 16:9. Cold blue and crimson palette, painterly style. No text, no UI, no borders. |
| `arcane-renaissance-t3` | A colossal clockwork god — a mountain-sized mechanical deity — rising from the earth, gears the size of buildings turning. A city crumbling at its feet, magical lightning arcing from its body. Epic fantasy illustration, apocalyptic scale. Wide cinematic composition 16:9. Dramatic palette, painterly style. No text, no UI, no borders. |
| `eldritch-horror-t3` | A drowned city rising from a black ocean, impossible non-Euclidean architecture glistening with brine. Tentacles coiling between spires, a sickly green light from below. Ships caught in the geometry. Epic cosmic horror illustration, nightmarish seascape. Wide cinematic composition 16:9. Dark eldritch palette, painterly style. No text, no UI, no borders. |

---

## Batch Generation Script

To generate all boss images, add these to `generate_batch_api.js`:

```javascript
// Example: Boss encounter batch
const items = [
    { key: 'goblin_chieftain', prompt: '...' },
    // Copy prompts from tables above
];

// Update output path:
const outputPath = path.join(__dirname, `../public/assets/encounters/bosses/${item.key}.png`);
```

To generate all template cards:
```javascript
const outputPath = path.join(__dirname, `../public/assets/templates/${item.key}.png`);
```

## Generation queue (2026-07-03 — wave 3 additions) - COMPLETE

Style base for item icons: *"Painterly digital fantasy art with rich [material] textures,
dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal
background (#2c2c2c). Professional 2D game asset."* Boss art follows the existing
`bosses/` portrait conventions. Placeholders are marked `TODO(#44 icon art)` /
`TODO(t3 boss art)` in code; drop the finished file in and delete the TODO.

### Item icons (`public/assets/icons/items/`)
| File | Prompt | Priority |
|---|---|---|
| `hunters_longbow.webp` | A masterwork yew longbow with a sinew string and leather grip. Painterly digital fantasy art with rich wood and leather textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | DONE 2026-07-06 |
| `runic_greatsword.webp` | A two-handed dark-steel greatsword covered in glowing blue dwarven war-runes. Painterly digital fantasy art with rich metal textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | DONE 2026-07-06 |
| `stormbound_ring.webp` | A sky-iron ring crackling with miniature captive lightning. Painterly digital fantasy art with rich metal textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium |
| `blade_of_the_shattered_throne.webp` | A regal longsword reforged from a broken obsidian throne, adorned with gold filigree. Painterly digital fantasy art with rich obsidian and gold textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | low (t3, unobtainable yet) |
| `aegis_of_dawn.webp` | An ornate plate cuirass glowing with sunrise light along its edges. Painterly digital fantasy art with rich gilded steel textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | low (t3) |
| `heart_of_the_last_winter.webp` | A heart-shaped shard of unmelting blue ice, with frost mist coiling off it. Painterly digital fantasy art with rich ice textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | low (t3) |
| `clockwork_god_core.webp` | A spherical brass-and-crystal mechanical heart, with visible gears and a golden inner glow. Painterly digital fantasy art with rich brass textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | low (t3) |
| `crown_of_the_drowned_city.webp` | A coral-crusted diadem encrusted with pearls and seaweed, emitting a faint abyssal glow. Painterly digital fantasy art with rich coral textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | low (t3) |

### Template cards (`public/assets/templates/`, 16:9 cinematic per existing card conventions) - COMPLETE
| File | Prompt | Priority |
|---|---|---|
| `desert-expedition-t1.webp` | A merchant caravan crossing endless golden dunes toward a half-buried ruin, heat shimmer in the air under harsh noon light. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Rich warm color palette, painterly style. No text, no UI, no borders. | DONE 2026-07-06 |
| `frozen-frontier-t1.webp` | A small party of fur-cloaked adventurers approaching a palisade village in deep snow, a vibrant aurora overhead in the blue dusk sky. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Cold blue and vibrant palette, painterly style. No text, no UI, no borders. | DONE 2026-07-06 |

### Boss portraits (`public/assets/encounters/bosses/`) - COMPLETE
| File | Prompt | Priority |
|---|---|---|
| `hoarfrost_wraith.webp` | A spectral figure made of jagged ice and frozen mist, with hollow glacial eyes, and a snowstorm swirling through its ethereal body. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (live premium boss; placeholder reuses shadow_stalker) |
| `ash_titan.webp` | A colossal humanoid formed of cracked volcanic rock and smouldering ash, veins of magma glowing brightly, looming menacingly through thick smoke. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | low (t3 quest enemy; placeholder reuses rune_golem) |
| `deathless_king.webp` | A skeletal monarch seated on a black throne, wearing tattered regal robes and a crown of cold blue fire. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | low (t3; placeholder reuses lich) |

Already wired from the unused library (no generation needed): elder_wyrm→leyline_dragon,
aether_ascendant→psionic_devourer, sleeper_beneath→void_leviathan; and the 2026-07-03
boss-portrait repair — 9 of 10 template bosses had shipped pointing at a dagger ITEM icon;
now: shadow_overlord/blightspawn/rot_heart/rogue_automaton/old_god_herald/great_dreamer use
their own portraits, Sandstorm Cult Leader→cult_leader, Hooded Priest→worm_that_walks,
Hoarfrost Wraith→shadow_stalker (bespoke queued above). Guard: src/data/artIntegrity.test.js
now fails CI on any declared-but-missing art path.

## Generation queue additions (2026-07-04 — t2 sequels) - COMPLETE

| File | Subject | Priority |
|---|---|---|
| `public/assets/templates/desert-expedition-t2.webp` | Ruined spire half-sunken in a dune sea under a bruised sky, colossal wyrm-shape coiling beneath the sand. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Rich desert palette, painterly style. No text, no UI, no borders. | DONE 2026-07-06 |
| `public/assets/templates/frozen-frontier-t2.webp` | False-spring thaw over a buried barrow field, gaunt spirit silhouette in the meltwater mist. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Cold blue palette, painterly style. No text, no UI, no borders. | DONE 2026-07-06 |
| `public/assets/encounters/bosses/dune_wyrm.webp` | Colossal sand-scaled wyrm erupting from a dune, sun-bleached bone frills. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | DONE 2026-07-06 |
| `public/assets/encounters/bosses/pale_hunger.webp` | Gaunt frost-revenant famine spirit, ribs of ice, antlered skull, trailing snow. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | DONE 2026-07-06 |
| `public/assets/encounters/cave_site_arrival.webp` | Yawning cave mouth in a rocky hillside, faint torchlight from within, adventurers' packs at the threshold. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (playtest 2026-07-04: cave arrival modal shows NO image — buildPoiEncounter carries no image field; interim option: reuse existing cave_entrance.webp) |
| `public/assets/encounters/ruins_site_arrival.webp` | Crumbling moss-eaten ruins under a brooding sky, broken columns and a sunken vault stair, crows circling. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (same gap as caves; site arrival modals are imageless) |
| `public/assets/encounters/goblin_hideout.webp` | A palisaded goblin war-camp built into a rocky hollow, crude totems and smoking cookfires, glinting eyes in the shadows. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (playtest 2026-07-04: goblin hideout arrival modal shows no image) |
| `public/assets/encounters/mountain_site_arrival.webp` | A wind-scoured mountain pass between jagged snow-dusted peaks, a narrow trail winding toward a dark crevice, eagles overhead. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (playtest 2026-07-04: mountain arrival modal shows no image) |
| `public/assets/encounters/forest_site_arrival.webp` | A dense ancient forest edge, gnarled oaks over a mossy deer-trail vanishing into green gloom, shafts of pale light. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (same gap suspected for forests; hills likely too) |
| `public/assets/icons/items/bell_of_the_last_tide.webp` | A hand-bell cast from dark bronze with a verdigris tide-pattern, faint water shimmer around the rim. Painterly digital fantasy art with rich metal textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | HIGH when The Drowned Bells loads (finale reward icon) |


## Generation queue (2026-07-06 — tidewater ladder cards) - COMPLETE

Audit result: every previously queued file exists on disk (verified 2026-07-06);
the only remaining art gap is the three tidewater campaign cards, authored today
and server-delivered (no gradient guard covers them since they live in the
database, not the public bundle). Cards go in `public/assets/templates/`,
16:9 cinematic per the house card style.

| File | Prompt | Priority |
|---|---|---|
| `tidewater-t1.webp` | A weathered fishing crew on a grey estuary quay hauling a net holding a barnacled bronze bell fragment, the tide visibly running the wrong way past channel markers, brooding overcast light. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Muted sea-green and slate palette, painterly style. No text, no UI, no borders. | DONE 2026-07-06 |
| `tidewater-t2.webp` | A drowned stone bell tower bared at dead low tide off a marshy shore, seaweed-draped causeway leading out, a lone lantern-lit rowboat approaching in blue dusk. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Cold teal and lantern-amber palette, painterly style. No text, no UI, no borders. | DONE 2026-07-06 |
| `tidewater-t3.webp` | A Venice-like canal city at a river mouth under storm light, bridges and bell towers half-flooded, a great bronze bell glowing faintly beneath the harbor water. Epic fantasy illustration, sweeping cityscape with dramatic sky. Wide cinematic composition 16:9. Deep teal, verdigris and storm-grey palette, painterly style. No text, no UI, no borders. | DONE 2026-07-06 |

## Generation queue (2026-07-08, milestone POI arrival images)

Sixteen milestone POIs render their "you have arrived" modal with no image
because they have no key in `POI_IMAGES` (`src/game/worldMoveController.js`).
These are the MAP-01 items from the content audit (`npm run audit`). Each image
is an establishing arrival shot in the house encounter style (the "Dark fantasy
digital painting" descriptor from the Style Guide), with the POI-specific twist:
an atmospheric matte-painting of the location with no people or creatures in the
foreground and a slightly muted, cohesive palette so the set reads as one series
alongside the existing `*_site_arrival.webp` art. Prompts below are already
grounded in each POI's authored name and parent campaign.

Wiring after generation: save each file at the path below, then add its
`<poi_id>` key to `POI_IMAGES` in `src/game/worldMoveController.js` pointing at
the asset (e.g. `shadow_fortress: '/assets/encounters/shadow_fortress_arrival.webp',`).
The MAP-01 audit check clears for that POI once the key exists and the file is present.

### Arrival images (`public/assets/encounters/`)
| File | Prompt | Priority |
|---|---|---|
| `public/assets/encounters/shadow_fortress_arrival.webp` | A brooding black-stone fortress rising from rolling green hills at dusk in the Greenridge Hills, its jagged towers wreathed in unnatural shadow that swallows the fading light, iron gates and battlements looming over a worn approach road, dark banners hanging still, storm light bruising the sky behind the keep. Classic high-fantasy castle architecture, ominous and imposing. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Heroic Fantasy T2, Crown of Sunfire) |
| `public/assets/encounters/sandstorm_hideout_arrival.webp` | A hidden cultist hideout tucked into a cleft of wind-carved red-rock desert bluffs, half-buried by drifting sand and shrouded by a distant advancing sandstorm on the horizon, rough-hewn entrances and tattered cloth awnings marking the lair among the rocks, harsh sun bleaching the cracked stone. Arid, hostile, desolate expedition atmosphere. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Desert Expedition T1, The Sunscorched Road) |
| `public/assets/encounters/sunken_spire_arrival.webp` | The tip of an ancient, ornately carved stone spire jutting up out of a sea of desert dunes below the Scorched Bluffs, most of the tower swallowed and buried beneath the sand, a dark opening at its crown descending into shadow underground. Sun-scorched, timeless, mysterious lost-civilization mood, heat haze shimmering over the endless sand. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Desert Expedition T2, The Waking Sands) |
| `public/assets/encounters/glacier_hollow_arrival.webp` | A vast hollow cavern carved into the blue heart of a glacier high in the jagged snow-capped Rimefang Peaks, its icy mouth glowing with cold cerulean light, frost-rimed rock and hanging icicles framing the entrance, a bitter wind lifting snow across the frozen approach. Arctic, still, the haunted stillness of a wraith's frozen lair. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Frozen Frontier T1, The Deepening Frost) |
| `public/assets/encounters/silent_steading_arrival.webp` | An abandoned frontier farmstead of timber longhouses and snow-laden roofs standing utterly silent in a frozen valley outside Frosthollow, no smoke from the chimneys, doors left ajar, fresh snowfall blanketing an empty yard, tracks half-erased, an eerie unnatural quiet hanging over the deserted steading. Cold grey overcast light, foreboding arctic emptiness. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Frozen Frontier T2, The Hungering Thaw) |
| `public/assets/encounters/famine_barrow_arrival.webp` | An ancient burial barrow of piled stone and moss newly exposed by melting glacial ice high on a bleak mountain slope, its dark lintelled entrance yawning open where the thaw has stripped away the snow, meltwater trickling over cold grey stone, ravens circling a colorless sky. Grim, ominous, a tomb of old famine-winter dread laid bare. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Frozen Frontier T2, The Hungering Thaw) |
| `public/assets/encounters/abandoned_well_arrival.webp` | A crumbling old stone village well in the muddy center of a blighted, half-deserted hamlet at Mudhollow, its water gone black and foul with sickly green scum around the rim, sagging thatched hovels and dead trees surrounding the mire under a heavy grey sky. Bleak, plague-touched, grimdark survival atmosphere, everything damp and rotting. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Grimdark Survival T1, The Blighted Village) |
| `public/assets/encounters/grimstead_cellar_arrival.webp` | The gaping stone-arched entrance to a dark cellar beneath a ruined village house in Grimstead, worn steps descending into blackness, walls streaked with creeping blight and pale fungus, a single ruined door hanging off its hinges, faint sickly light within. Damp, oppressive, diseased grimdark dungeon-mouth mood under a dim overcast day. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Grimdark Survival T1, The Blighted Village) |
| `public/assets/encounters/ironhold_ruins_arrival.webp` | The broken shell of a once-great fortress-town, Ironhold, now a windswept ruin of shattered walls and toppled towers on a bleak moor, defensible stone still standing enough to shelter a camp, rusting iron gates and collapsed ramparts under a bruised, colorless sky. Desolate, hard-bitten last-stronghold survival mood, cold wind and dead grass. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Grimdark Survival T2, The Rot-Heart) |
| `public/assets/encounters/rot_tunnels_arrival.webp` | The dripping mouth of a foul underground tunnel network beneath the village of Rotfall, slick walls thick with wet black rot, pulsing veins of pale fungus and clinging slime, a faint diseased bioluminescence glowing deeper in. Claustrophobic, visceral, decaying grimdark dungeon entrance. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Grimdark Survival T2, The Rot-Heart) |
| `public/assets/encounters/gear_end_sewers_arrival.webp` | A grimy magitech sewer tunnel beneath an industrial clockwork city district, brass pipes and turning brass gears set into dripping brick walls, faint aetheric blue lamplight glinting off oily water and rusted machinery, steam curling from riveted valves. Gritty steampunk-fantasy undercity, mechanical and dim, the hidden lair of a rogue automaton. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Arcane Renaissance T1, The Rogue Automaton) |
| `public/assets/encounters/coghill_foundry_arrival.webp` | The wrecked ruin of a great industrial foundry on Cog-Hill, roof blown open by a catastrophic explosion, twisted brass machinery and shattered boilers strewn amid scorched brickwork and drifting smoke, broken gears and cracked aether conduits sparking faintly. Steampunk-fantasy magitech disaster, smoldering wreckage under a grey industrial sky, embers still glowing. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Arcane Renaissance T2, Herald of the Old Gods) |
| `public/assets/encounters/desecrated_shrine_arrival.webp` | A once-holy woodland shrine desecrated by a cult at Grey-Haven, its stone altar cracked and daubed with unnatural sigils, guttering candles and strange offerings scattered in the gloom of a mist-choked grey forest clearing, wrong geometry and a faint sickly glow suggesting something profane. Cosmic-horror dread, cold fog, the sense of a violated sacred place, unsettling and wrong. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Eldritch Horror T1, The Blackwood Cult) |
| `public/assets/encounters/cult_meeting_place_arrival.webp` | A ring of ancient standing stones atop grassy burial barrows in The Barrows under a bruised twilight sky, cold blue mist pooling between the monoliths, faint carved eldritch symbols on the weathered stones, empty and waiting with an unnatural stillness in the air. Cosmic-horror atmosphere, ominous megalithic circle, dread and wrongness. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Eldritch Horror T1, The Blackwood Cult) |
| `public/assets/encounters/corrupted_lighthouse_arrival.webp` | A gaunt coastal lighthouse on a jagged sea cliff at Whisper-Cove, its beacon corrupted to cast a sickly non-euclidean green-purple light out over a churning black ocean, barnacle-crusted stone streaked with alien growths and writhing shadow, storm surf pounding the rocks below. Cosmic-horror seascape, drowned-god dread, oppressive and hallucinatory. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Eldritch Horror T2, The Great Dreamer) |
| `public/assets/encounters/mourn_peak_summit_arrival.webp` | A bleak, wind-scoured mountain summit above the clouds where the sky tears open into a yawning cosmic void, impossible stars and a vast dreaming presence bleeding through the rift over the barren rock, thin air, colorless stone, reality warping at the edges. Cosmic-horror sublime terror, vertiginous altitude, a vision of the Void breaking through. No people or creatures in the foreground. Dark fantasy digital painting, dramatic cinematic lighting, moody atmosphere. Landscape composition 16:9. No text or UI elements. | medium (MAP-01; Eldritch Horror T2, The Great Dreamer) |

## Generation queue (2026-07-10, dedicated quest-item icons)

Every `type: 'item'` milestone in the built-in campaigns (`src/data/storyTemplates.js`)
BORROWS a lookalike icon rather than having its own art. All twelve are in
`ITEM_CATALOG` (`src/utils/inventorySystem.js`) with an `icon:` that points at a
DIFFERENT item's file (e.g. `frostbound_ledger` -> `map_fragment.webp`). Because a
borrowed file exists on disk, `src/data/artIntegrity.test.js` stays green, so this art
debt is invisible to the guard. The prompts below give each quest item its own on-theme
icon following the item-icon Style Guide (centered on solid dark charcoal #2c2c2c).

Wiring after generation (a separate, later change, NOT part of this queue): save each
file at the path below, then repoint that item's `icon:` in `ITEM_CATALOG` from the
borrowed file to `assets/icons/items/<item_id>.webp`. Do NOT repoint an icon before its
file exists on disk or `artIntegrity.test.js` goes red. Until then the icons keep
borrowing. (Premium campaigns live in a separate private repo and follow the same
borrow pattern; their quest items need an equivalent sweep there.)

### Item icons (`public/assets/icons/items/`)
| File | Prompt | Priority |
|---|---|---|
| `goblin_scouts_map.webp` | A crude goblin-drawn map on a torn scrap of greasy hide, scrawled with jagged charcoal trails, clumsy skull glyphs and a smear of dried warpaint. Painterly digital fantasy art with rich hide and charcoal textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Heroic Fantasy T1, The Goblin Threat) |
| `hidden_map.webp` | An old concealed parchment map, half-unrolled to reveal an inked coastline and a secret route traced in faded red, a broken wax seal at one corner. Painterly digital fantasy art with rich parchment and ink textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Heroic Fantasy T2, Crown of Sunfire) |
| `caravan_ledger.webp` | A dust-worn merchant caravan ledger, a battered leather-bound account book with a broken brass clasp, its trade tallies penned in fading ink and grains of desert sand caught in the pages. Painterly digital fantasy art with rich leather and parchment textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Desert Expedition T1, The Sunscorched Road) |
| `sun_kings_star_chart.webp` | An ancient desert astronomical chart on sun-bleached vellum, gold-inked constellations arcing around a radiant engraved sun sigil, its edges brittle and cracked. Painterly digital fantasy art with rich vellum and gold-leaf textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Desert Expedition T2, The Waking Sands) |
| `frostbound_ledger.webp` | A frost-rimed leather-bound ledger, its dark cover glazed with a lattice of ice crystals and its frozen pages edged in pale hoarfrost, faint cold mist coiling from it. Painterly digital fantasy art with rich frosted leather and ice textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Frozen Frontier T1, The Deepening Frost) |
| `famine_winter_saga.webp` | A weathered saga-tome bound in cracked grey leather with iron corner-caps, its brittle vellum pages inscribed with old runic verse recounting a famine winter, cold and forbidding. Painterly digital fantasy art with rich aged leather and vellum textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Frozen Frontier T2, The Hungering Thaw) |
| `moorland_herbs.webp` | A bundle of freshly gathered moorland herbs tied with rough twine, muted green leaves and pale medicinal roots still dusted with dark peat, a few small flowers among the stems. Painterly digital fantasy art with rich botanical and earthy textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Grimdark Survival T1, The Blighted Village) |
| `mutated_specimen.webp` | A grotesque mutated biological specimen sealed in a stoppered glass jar, pallid tumorous flesh and malformed limbs suspended in murky greenish preserving fluid, wax-sealed lid. Painterly digital fantasy art with rich glass and diseased-flesh textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Grimdark Survival T2, The Rot-Heart) |
| `automaton_control_rod.webp` | A slender brass control rod studded with fine clockwork gears and etched with aetheric glyphs, a small glowing blue crystal set at its tip. Painterly digital fantasy art with rich brass and crystal textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Arcane Renaissance T1, The Rogue Automaton) |
| `stolen_aether_blueprints.webp` | A rolled set of stolen aether-tech blueprints on deep blue drafting paper, luminous cyan schematic lines diagramming a great machine, one corner curling open. Painterly digital fantasy art with rich paper and glowing-ink textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Arcane Renaissance T2, Herald of the Old Gods) |
| `cult_journal.webp` | A small worn cultist's journal bound in dark frayed cloth, its curling pages scrawled with frantic handwriting and unsettling occult sigils, a leather cord wrapping the cover. Painterly digital fantasy art with rich cloth and ink textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Eldritch Horror T1, The Blackwood Cult) |
| `forbidden_ritual_text.webp` | A forbidden grimoire bound in black leather and clasped with tarnished iron, warped eldritch runes glowing faintly sickly-green across its swollen cover. Painterly digital fantasy art with rich black leather and iron textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium (Eldritch Horror T2, The Great Dreamer) |
