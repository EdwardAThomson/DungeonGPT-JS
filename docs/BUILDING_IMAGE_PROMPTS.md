# Building Interior Image Prompts

Ready-to-run prompts for the **9 missing** building interiors (see `MISSING_BUILDING_IMAGES.md`).
They render the placeholder in `BuildingModal` until these exist.

## Style (shared)
Painterly digital fantasy art; warm, dramatic lighting; detailed medieval/fantasy **interior**;
square or portrait composition; **no text, no UI, no people**. Match the look of the existing
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
Interior of a fantasy alchemist's shop: shelves crowded with glass bottles and bubbling coloured potions, a cluttered workbench with mortar and pestle and open spellbooks, dried herbs hanging from the rafters, a small cauldron with rising vapour, warm candle and lantern glow. Painterly digital fantasy art, warm dramatic lighting, richly detailed medieval interior, no text, no people.

### Market (`market.webp`) — High
Interior of a covered fantasy market hall: rows of wooden stalls laden with fruit, vegetables, bolts of cloth, crates and barrels, hanging lanterns and bunting, sacks of grain on the floor, warm daylight streaming through high openings. Painterly digital fantasy art, warm dramatic lighting, bustling and detailed, no text, no people.

### Archives (`archives.webp`) — Medium
Interior of a fantasy archive room: towering shelves and pigeonholes stuffed with rolled scrolls and bound ledgers, a reading lectern with an open tome, a wooden filing cabinet, dust motes drifting in shafts of light, flickering candle sconces. Painterly digital fantasy art, warm dramatic lighting, detailed medieval interior, no text, no people.

### Library (`library.webp`) — Medium
Interior of a grand fantasy library: tall bookshelves packed with leather-bound tomes, a rolling ladder, long reading tables with open books and brass candlesticks, tall arched windows pouring warm golden light, a globe on a stand. Painterly digital fantasy art, warm dramatic lighting, richly detailed, no text, no people.

### Foundry (`foundry.webp`) — Medium
Interior of a fantasy foundry: a roaring furnace and forge with glowing molten metal, heavy anvils, casting moulds and crucibles, racks of tongs and hammers, drifting sparks and smoky haze, intense orange firelight against dark stone. Painterly digital fantasy art, dramatic warm lighting, detailed industrial medieval interior, no text, no people.

### Warehouse (`warehouse.webp`) — Medium
Interior of a fantasy storehouse: tall stacks of wooden crates and barrels, bulging sacks of goods, coiled ropes and tools, a timber loft with more storage, dusty shafts of light from high windows. Painterly digital fantasy art, warm dramatic lighting, detailed, no text, no people.

### Keep (`keep.webp`) — Medium
Interior of a fantasy castle keep's great hall: tall stone walls hung with heraldic banners, a long timber feasting table, iron chandeliers, a great roaring hearth, suits of armour and crossed weapons on the walls, warm firelight and shadow. Painterly digital fantasy art, dramatic warm lighting, detailed medieval interior, no text, no people.

### Barn (`barn.webp`) — Low
Interior of a rustic fantasy barn: heavy wooden beams and a hayloft stacked with hay bales, animal stalls, scattered farming tools, a wooden cart, soft daylight filtering through gaps in the planks and an open door. Painterly digital fantasy art, warm natural lighting, detailed rural medieval interior, no text, no people.

### Barracks (`barracks.webp`) — Low
Interior of a fantasy barracks: rows of simple wooden bunk beds with folded blankets, weapon racks of spears and shields, armour stands, a central table with a map and tankards, hanging lanterns. Painterly digital fantasy art, warm dramatic lighting, detailed medieval military interior, no text, no people.
