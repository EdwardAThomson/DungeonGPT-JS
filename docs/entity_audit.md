# Entity Audit: Story Templates vs Game Registries

**Date:** 2026-03-08
**Scope:** All Tier 1 and Tier 2 story templates in `src/data/storyTemplates.js`

## Summary

| Category | Templates Reference | Registry | Status |
|----------|-------------------|----------|--------|
| Items | 28 unique items | `ITEM_CATALOG` (inventorySystem.js) | All present |
| Buildings | 12 types + 5 new | `placeBuildings()` (townMapGenerator.js) | 5 added (see below) |
| Enemies | ~30+ unique | Inline in encounter data | No registry needed |
| NPCs | ~20+ unique | Inline in encounter data | No registry needed |
| POIs | ~15 types | Inline in map generator | No registry needed |

## Items Audit

All 28 items referenced across story template milestones are present in `ITEM_CATALOG`:

- healing_potion, greater_healing_potion, antidote, rations, torch, rope
- silver_dagger, magic_weapon, ring_protection, legendary_weapon
- ancient_scroll, spell_scroll, dark_tome, forbidden_knowledge
- healing_herbs, rare_herb, rare_ingredient
- raw_gems, gemstone, rare_gem, dragon_scale
- quest_clue, quest_key, quest_letter, mysterious_letter, treasure_map
- artifact_fragment, legendary_artifact

### Missing Encounter Reward Items (Fixed)

4 items referenced by random encounter rewards were missing from `ITEM_CATALOG` and have been added:

| Item Key | Name | Rarity | Notes |
|----------|------|--------|-------|
| `medical_journal` | Medical Journal | uncommon | Encounter loot |
| `medicine_kit` | Medicine Kit | uncommon | Healing effect (2d4) |
| `uncovered_ruins` | Ruins Map Fragment | uncommon | Quest item |
| `nature_blessing` | Nature's Blessing | rare | Blessing type |

## Buildings Audit

### Existing Building Types (12)
Already supported in `townMapGenerator.js`:
- barn, inn, shop, blacksmith, tavern, temple
- market, manor, guild, bank, keep, house

### Missing Building Types (5) - Added
Referenced by Tier 2 templates but were not in the town map generator:

| Building Type | Emoji | Used By Template | Context |
|--------------|-------|-----------------|---------|
| `archives` | 📚 | arcane-renaissance-t2 | Magical research location |
| `alchemist` | ⚗️ | arcane-renaissance-t2 | Potion/reagent shop |
| `foundry` | 🔥 | heroic-fantasy-t2 | Weapon crafting |
| `warehouse` | 📦 | grimdark-survival-t2 | Supply storage |
| `library` | 📖 | eldritch-horror-t2 | Research/lore location |

Each building type was added with:
- Emoji rendering in `getTownTileEmoji()`
- Name generation with 6 thematic names each
- Support in both primary and fallback placement code paths

## Enemies & NPCs

Enemies and NPCs are defined inline within encounter data objects (not in a central registry). They are dynamically referenced by the AI dungeon master during gameplay. No registry gap exists - the AI generates appropriate dialogue and behavior based on encounter context.

## POIs (Points of Interest)

POI types (ruins, cave, shrine, etc.) are generated procedurally by the map generator and referenced by encounter templates. These are also inline/dynamic and don't require a separate registry.

## Recommendations

1. **Phase 3 consideration:** Extract building types into a registry (similar to `ITEM_CATALOG`) for easier management as more templates are added
2. **Phase 3 consideration:** Consider an enemy/NPC registry if Tier 3 templates need more structured entity references
3. **Image generation:** The 4 new items need icon images (`assets/icons/items/*.webp`)
