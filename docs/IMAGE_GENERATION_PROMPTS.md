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

## Generation queue (2026-07-03 — wave 3 additions)

Style base for item icons: *"Painterly digital fantasy art with rich [material] textures,
dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal
background (#2c2c2c). Professional 2D game asset."* Boss art follows the existing
`bosses/` portrait conventions. Placeholders are marked `TODO(#44 icon art)` /
`TODO(t3 boss art)` in code; drop the finished file in and delete the TODO.

### Item icons (`public/assets/icons/items/`)
| File | Prompt | Priority |
|---|---|---|
| `hunters_longbow.webp` | A masterwork yew longbow with a sinew string and leather grip. Painterly digital fantasy art with rich wood and leather textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | HIGH (worst placeholder: borrows a sword) |
| `runic_greatsword.webp` | A two-handed dark-steel greatsword covered in glowing blue dwarven war-runes. Painterly digital fantasy art with rich metal textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | HIGH (shares the legendary sword icon) |
| `stormbound_ring.webp` | A sky-iron ring crackling with miniature captive lightning. Painterly digital fantasy art with rich metal textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | medium |
| `blade_of_the_shattered_throne.webp` | A regal longsword reforged from a broken obsidian throne, adorned with gold filigree. Painterly digital fantasy art with rich obsidian and gold textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | low (t3, unobtainable yet) |
| `aegis_of_dawn.webp` | An ornate plate cuirass glowing with sunrise light along its edges. Painterly digital fantasy art with rich gilded steel textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | low (t3) |
| `heart_of_the_last_winter.webp` | A heart-shaped shard of unmelting blue ice, with frost mist coiling off it. Painterly digital fantasy art with rich ice textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | low (t3) |
| `clockwork_god_core.webp` | A spherical brass-and-crystal mechanical heart, with visible gears and a golden inner glow. Painterly digital fantasy art with rich brass textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | low (t3) |
| `crown_of_the_drowned_city.webp` | A coral-crusted diadem encrusted with pearls and seaweed, emitting a faint abyssal glow. Painterly digital fantasy art with rich coral textures, dramatic cinematic lighting, and deep shadows. Perfectly centered on a solid dark charcoal background (#2c2c2c). Professional 2D game asset. | low (t3) |

### Template cards (`public/assets/templates/`, 16:9 cinematic per existing card conventions)
| File | Prompt | Priority |
|---|---|---|
| `desert-expedition-t1.webp` | A merchant caravan crossing endless golden dunes toward a half-buried ruin, heat shimmer in the air under harsh noon light. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Rich warm color palette, painterly style. No text, no UI, no borders. | HIGH (premium card renders bare gradient today) |
| `frozen-frontier-t1.webp` | A small party of fur-cloaked adventurers approaching a palisade village in deep snow, a vibrant aurora overhead in the blue dusk sky. Epic fantasy illustration, sweeping landscape with dramatic sky. Wide cinematic composition 16:9. Cold blue and vibrant palette, painterly style. No text, no UI, no borders. | HIGH (premium card renders bare gradient today) |

### Boss portraits (`public/assets/encounters/bosses/`)
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

## Generation queue additions (2026-07-04 — t2 sequels)

| File | Subject | Priority |
|---|---|---|
| `public/assets/templates/desert-expedition-t2.webp` | Ruined spire half-sunken in a dune sea under a bruised sky, colossal wyrm-shape coiling beneath the sand, 16:9 | HIGH (premium card renders gradient) |
| `public/assets/templates/frozen-frontier-t2.webp` | False-spring thaw over a buried barrow field, gaunt spirit silhouette in the meltwater mist, 16:9 | HIGH (premium card renders gradient) |
| `public/assets/encounters/bosses/dune_wyrm.webp` | Colossal sand-scaled wyrm erupting from a dune, sun-bleached bone frills [sand and scale] | medium (shares dragon_wyrm) |
| `public/assets/encounters/bosses/pale_hunger.webp` | Gaunt frost-revenant famine spirit, ribs of ice, antlered skull, trailing snow [ice and bone] | medium (shares blood_wendigo) |
