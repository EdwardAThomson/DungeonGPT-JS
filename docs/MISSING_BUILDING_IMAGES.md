# Missing Building Images

Building interior images for the BuildingModal. Output directory: `public/assets/buildings/`
(BuildingModal loads `/assets/buildings/{buildingType}.webp`; `house`/`manor` use the
`*_interior_*.webp` variants).

Generated via `scripts/generate_image_api.js` (Gemini). See
[IMAGE_GENERATION_PROMPTS.md](IMAGE_GENERATION_PROMPTS.md) for tooling and
[BUILDING_IMAGE_PROMPTS.md](BUILDING_IMAGE_PROMPTS.md) for ready-to-run prompts.

**Style**: match existing images — painterly digital fantasy art, warm dramatic lighting,
detailed medieval/fantasy interiors, portrait or square, no text/UI/people.

---

## Existing images

Core: `bank`, `blacksmith`, `guild`, `inn`, `shop`, `tavern`, `temple`,
`house_interior_1/2/3`, `manor_interior_1`, `town_interior_hero`.

Previously-missing roster (now generated): `alchemist`, `archives`, `barn`, `barracks`,
`foundry`, `keep`, `library`, `market`, `warehouse`.

Newly-added building types (generated + now wired into map gen + icons + legend):
`apothecary`, `fletcher`, `harbormaster`, `jail`, `magetower`, `mill`, `shrine`,
`stables`, `tailor`, `townhall`.

> Coverage is enforced by `src/utils/buildingArt.test.js`: every building type that can be
> *placed* must have both a map icon and an interior image, so no placed building falls
> back to the placeholder.

---

## Missing images

| Building | File needed | Appears in | Priority |
|----------|-------------|------------|----------|
| Workshop | `workshop.webp` | Quest building (e.g. Tinker-Row, Arcane Renaissance campaign) — injected via `injectQuestBuildings`, not in the normal roster | Medium |

Until `workshop.webp` exists, a placed workshop shows the BuildingModal placeholder and
renders with the fallback house icon on the town map.
