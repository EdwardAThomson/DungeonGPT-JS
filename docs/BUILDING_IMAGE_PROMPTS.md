# Building Interior Image Prompts

Ready-to-run prompts for building interiors (see `MISSING_BUILDING_IMAGES.md`). A building
renders the placeholder in `BuildingModal` until its `.webp` exists.

**Status:** the original 9 missing roster images and the 10 expansion buildings below have
been generated and wired into map gen. The only outstanding roster image is **`workshop`**
(quest building — see below).

## Style (shared)
Painterly digital fantasy art; warm, dramatic lighting; detailed medieval/fantasy **interior**;
square or portrait composition; **no text, no UI**. Match the look of the existing
images (`bank.webp`, `temple.webp`, `tavern.webp`, …).

## How to generate
The repo's `scripts/generate_image_api.js` uses **Gemini** (`GEMINI_API_KEY` in `.env`) and writes a PNG:
```bash
node scripts/generate_image_api.js "<prompt>" public/assets/buildings/<type>.png
# then convert PNG -> WEBP (BuildingModal loads .webp), e.g.:
cwebp -q 82 public/assets/buildings/<type>.png -o public/assets/buildings/<type>.webp
```
(Alternatively drive the CF Workers-AI models from the `/debug/image-gen` page.)
File name must equal the `buildingType`: `alchemist.webp`, `market.webp`, etc.

## Prompts

### Alchemist (`alchemist.webp`) — High
Interior of a fantasy alchemist's shop: shelves crowded with glass bottles and bubbling coloured potions, a cluttered workbench with mortar and pestle and open spellbooks, dried herbs hanging from the rafters, a small cauldron with rising vapour, warm candle and lantern glow. Painterly digital fantasy art, warm dramatic lighting, richly detailed medieval interior, no text. Square composition.

### Market (`market.webp`) — High
Interior of a covered fantasy market hall: rows of wooden stalls laden with fruit, vegetables, bolts of cloth, crates and barrels, hanging lanterns and bunting, sacks of grain on the floor, warm daylight streaming through high openings. Painterly digital fantasy art, warm dramatic lighting, richly detailed medieval market interior, no text. Square composition.

### Archives (`archives.webp`) — Medium
Interior of a fantasy archive room: towering shelves and pigeonholes stuffed with rolled scrolls and bound ledgers, a reading lectern with an open tome, a wooden filing cabinet, dust motes drifting in shafts of light, flickering candle sconces. Painterly digital fantasy art, warm dramatic lighting, detailed medieval interior, no text. Square composition.

### Library (`library.webp`) — Medium
Interior of a grand fantasy library: tall bookshelves packed with leather-bound tomes, a rolling ladder, long reading tables with open books and brass candlesticks, tall arched windows pouring warm golden light, a globe on a stand. Painterly digital fantasy art, warm dramatic lighting, richly detailed medieval interior, no text. Square composition.

### Foundry (`foundry.webp`) — Medium
Interior of a fantasy foundry: a roaring furnace and forge with glowing molten metal, heavy anvils, casting moulds and crucibles, racks of tongs and hammers, drifting sparks and smoky haze, intense orange firelight against dark stone. Painterly digital fantasy art, dramatic warm lighting, detailed industrial medieval interior, no text. Square composition.

### Warehouse (`warehouse.webp`) — Medium
Interior of a fantasy storehouse: tall stacks of wooden crates and barrels, bulging sacks of goods, coiled ropes and tools, a timber loft with more storage, dusty shafts of light from high windows. Painterly digital fantasy art, warm dramatic lighting, detailed medieval interior, no text. Square composition.

### Keep (`keep.webp`) — Medium
Interior of a fantasy castle keep's great hall: tall stone walls hung with heraldic banners, a long timber feasting table, iron chandeliers, a great roaring hearth, suits of armour and crossed weapons on the walls, warm firelight and shadow. Painterly digital fantasy art, dramatic warm lighting, detailed medieval interior, no text. Square composition.

### Barn (`barn.webp`) — Low
Interior of a rustic fantasy barn: heavy wooden beams and a hayloft stacked with hay bales, animal stalls, scattered farming tools, a wooden cart, soft daylight filtering through gaps in the planks and an open door. Painterly digital fantasy art, warm dramatic lighting, detailed rural medieval interior, no text. Square composition.

### Barracks (`barracks.webp`) — Low
Interior of a fantasy barracks: rows of simple wooden bunk beds with folded blankets, weapon racks of spears and shields, armour stands, a central table with a map and tankards, hanging lanterns. Painterly digital fantasy art, warm dramatic lighting, detailed medieval military interior, no text. Square composition.

### Workshop (`workshop.webp`) — Medium (quest building, still missing)
Interior of a fantasy artificer's workshop: a cluttered workbench strewn with gears, cogs, springs and half-built clockwork devices, tools hung on a pegboard, blueprints and schematics pinned to the wall, a partly-assembled brass automaton on a stand, jars of bolts, warm lantern light and faint steam. Painterly digital fantasy art, warm dramatic lighting, richly detailed medieval/steampunk interior, no text. Square composition. (Used by the Arcane Renaissance campaign's Tinker-Row workshop.)

---

## Future/Expansion Ideas

Draft prompts for potential new buildings to expand the world:

### Town Hall (`townhall.webp`)
Interior of a grand fantasy town hall: a large ornate wooden desk, parchment maps of the region spread out, high-backed wooden chairs for a council, tall windows, warm lantern light. Painterly digital fantasy art, warm dramatic lighting, detailed medieval civic interior, no text. Square composition.

### Jail (`jail.webp`)
Interior of a fantasy guardhouse jail: a heavy oak desk with a ledger, weapon racks on the stone walls, thick iron bars leading to dark stone cells in the back, shadows and flickering torchlight. Painterly digital fantasy art, dramatic moody lighting, detailed medieval interior, no text. Square composition.

### Mill (`mill.webp`)
Interior of a rustic fantasy mill: massive wooden gears and grinding stones, heavy sacks of flour stacked high, flour dust motes dancing in shafts of sunlight, a large stone oven radiating warmth. Painterly digital fantasy art, warm dramatic lighting, detailed medieval interior, no text. Square composition.

### Apothecary (`apothecary.webp`)
Interior of a rustic fantasy apothecary: wooden shelves filled with drying herbs, roots, and mundane remedies, a wooden counter, soft natural sunlight pouring through an open window, potted plants. Painterly digital fantasy art, warm dramatic lighting, detailed medieval interior, no text. Square composition.

### Stables (`stables.webp`)
Interior of a fantasy stable: heavy wooden horse stalls, scattered hay bales, saddles and leather tack hanging on the walls, a wooden pitchfork, warm lantern light, dust motes in the air. Painterly digital fantasy art, warm dramatic lighting, detailed medieval interior, no text. Square composition.

### Fletcher (`fletcher.webp`)
Interior of a fantasy fletcher's workshop: workbenches covered with unfinished wooden bows, barrels of arrows, scattered feathers and tools, wood shavings on the floor. Painterly digital fantasy art, warm dramatic lighting, detailed medieval interior, no text. Square composition.

### Tailor (`tailor.webp`)
Interior of a fantasy tailor shop: a large wooden loom, spinning wheels, colorful bolts of cloth stacked on shelves, wooden mannequins, needles and thread scattered on a table. Painterly digital fantasy art, warm dramatic lighting, detailed medieval interior, no text. Square composition.

### Mage Tower (`magetower.webp`)
Interior of a circular stone mage tower observatory: an intricate brass astrolabe on a pedestal, glowing arcane crystals on stands, a large telescope pointing out a tall window, glowing magical runes, swirling starry light. Painterly digital fantasy art, dramatic magical lighting, detailed fantasy interior, no text. Square composition.

### Shrine (`shrine.webp`)
Interior of a small humble fantasy shrine: a simple stone altar with a wooden idol, lit votive candles and incense, small offerings, warm intimate lighting in a small dark room. Painterly digital fantasy art, dramatic warm lighting, detailed medieval interior, no text. Square composition.

### Harbor Master (`harbormaster.webp`)
Interior of a fantasy harbor master's office overlooking the water: a wooden desk covered in shipping manifests, a large brass spyglass, rolled nautical charts, fishing nets and rope in the corner, sunlight reflecting off the sea outside the window. Painterly digital fantasy art, warm dramatic lighting, detailed medieval nautical interior, no text. Square composition.

### Bathhouse (`bathhouse.webp`)
Interior of a relaxing fantasy bathhouse: tiled warm-water pools with rising steam, brass fixtures, wooden benches with folded towels, hanging paper lanterns, potted ferns, soft hazy atmosphere. Painterly digital fantasy art, warm dramatic lighting, detailed medieval interior, no text. Square composition.

### Theater (`theater.webp`)
Interior of a fantasy theater stage: a raised wooden stage, heavy red velvet curtains pulled back, wooden benches in rows, scattered props, a lute leaning against a stool, warm footlights casting shadows. Painterly digital fantasy art, dramatic moody lighting, detailed medieval interior, no text. Square composition.

### Gambling Den (`gamblingden.webp`)
Interior of a shady fantasy gambling den: dimly lit round tables covered in cards and dice, piles of gold and silver coins, thick hazy smoke in the air, low hanging lamps casting harsh light, shadows in the corners. Painterly digital fantasy art, dramatic moody lighting, detailed medieval interior, no text. Square composition.

### Brewery (`brewery.webp`)
Interior of a fantasy brewery: massive glowing copper vats and intricate brass piping, bubbling amber liquids, stacks of heavy wooden kegs, scattered malt sacks, warm amber light and steam. Painterly digital fantasy art, warm dramatic lighting, detailed industrial medieval interior, no text. Square composition.
