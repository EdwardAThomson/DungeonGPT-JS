# Missing Building Images

Building interior images needed for the BuildingModal. Output directory: `public/assets/buildings/`

Generated via `scripts/generate_image_api.js` (Gemini). See [IMAGE_GENERATION_PROMPTS.md](IMAGE_GENERATION_PROMPTS.md) for tooling and style guide.

**Style**: Interior scenes should match existing building images — painterly digital fantasy art, warm dramatic lighting, detailed medieval/fantasy interiors. Portrait or square composition. No text or UI elements.

---

## Existing Images (for reference)

| Building | File | Notes |
|----------|------|-------|
| Bank | `bank.webp` | |
| Blacksmith | `blacksmith.webp` | |
| Guild | `guild.webp` | |
| House | `house_interior_1/2/3.webp` | 3 variants |
| Inn | `inn.webp` | |
| Manor | `manor_interior_1.webp` | 1 variant |
| Shop | `shop.webp` | |
| Tavern | `tavern.webp` | |
| Temple | `temple.webp` | |

---

## Missing Images

| Building | File Needed | Appears In | Priority |
|----------|-------------|------------|----------|
| Alchemist | `alchemist.webp` | Village, Town, City | High |
| Market | `market.webp` | City | High |
| Archives | `archives.webp` | Town, City | Medium |
| Library | `library.webp` | City | Medium |
| Foundry | `foundry.webp` | City | Medium |
| Warehouse | `warehouse.webp` | Town, City | Medium |
| Keep | `keep.webp` | City (1 per city) | Medium |
| Barn | `barn.webp` | Hamlet | Low |
| Barracks | `barracks.webp` | Not currently placed | Low |
