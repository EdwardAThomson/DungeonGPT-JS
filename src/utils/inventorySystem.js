// Phase 4: Inventory System
// Gold management and item tracking

/**
 * Roll dice notation (e.g., "3d10", "2d6+5")
 * @param {string} notation - Dice notation
 * @returns {number} Total rolled
 */
export const rollDice = (notation) => {
  if (typeof notation === 'number') return notation;
  if (!notation || notation === '0') return 0;

  const match = notation.match(/^(\d+)d(\d+)(?:\+(\d+))?$/);
  if (!match) return parseInt(notation) || 0;

  const [, count, sides, bonus] = match;
  let total = parseInt(bonus) || 0;

  for (let i = 0; i < parseInt(count); i++) {
    total += Math.floor(Math.random() * parseInt(sides)) + 1;
  }

  return total;
};

/**
 * Parse item drop with chance (e.g., "healing_potion:50%")
 * @param {string} itemString - Item with chance notation
 * @returns {Object|null} { name, dropped } or null if not dropped
 */
export const rollItemDrop = (itemString) => {
  const match = itemString.match(/^(.+):(\d+)%$/);
  if (!match) {
    return { name: itemString, dropped: true };
  }

  const [, name, chance] = match;
  const roll = Math.random() * 100;

  return {
    name,
    chance: parseInt(chance),
    dropped: roll <= parseInt(chance)
  };
};

/**
 * Process encounter rewards
 * @param {Object} rewards - { xp, gold, items }
 * @param {string} outcome - 'criticalSuccess', 'success', 'failure', 'criticalFailure'
 * @returns {Object} { xp, gold, items }
 */
export const processRewards = (rewards, outcome) => {
  if (!rewards) return { xp: 0, gold: 0, items: [] };

  // Outcome affects rewards
  const outcomeMultipliers = {
    criticalSuccess: 1.5,
    success: 1.0,
    failure: 0.3,
    criticalFailure: 0
  };

  const multiplier = outcomeMultipliers[outcome] ?? 1.0;

  // XP
  const xp = Math.floor((rewards.xp || 0) * multiplier);

  // Gold
  let gold = 0;
  if (rewards.gold && multiplier > 0) {
    gold = Math.floor(rollDice(rewards.gold) * multiplier);
  }

  // Items (only on success or better)
  const items = [];
  if (rewards.items && multiplier >= 1.0) {
    for (const itemString of rewards.items) {
      const result = rollItemDrop(itemString);
      if (result.dropped) {
        items.push(result.name);
      }
    }
  }

  return { xp, gold, items };
};

// Item definitions with rarity and value
export const ITEM_CATALOG = {
  // Common items
  'healing_potion': { name: 'Healing Potion', rarity: 'common', value: 50, effect: 'heal', amount: '2d4+2', description: 'A ruby draught that knits flesh and closes wounds in moments.', icon: 'assets/icons/items/healing_potion.webp' },
  'antidote': { name: 'Antidote', rarity: 'common', value: 25, effect: 'cure_poison', description: 'A bitter green tincture that purges venom from the blood.', icon: 'assets/icons/items/antidote.webp' },
  'rations': { name: 'Trail Rations', rarity: 'common', value: 5, stackable: true, effect: 'heal', amount: '1d4', description: 'Dried meat, hardtack, and nuts. Plain fare, but it keeps a traveler walking.', icon: 'assets/icons/items/rations.webp' },
  'torch': { name: 'Torch', rarity: 'common', value: 1, stackable: true, description: 'A pitch-soaked brand that throws back the dark for an hour or so.', icon: 'assets/icons/items/torch.webp' },
  'rope': { name: 'Rope (50ft)', rarity: 'common', value: 10, description: 'Fifty feet of sturdy hemp, good for climbs, bindings, and hasty escapes.', icon: 'assets/icons/items/rope.webp' },

  // Uncommon items
  'greater_healing_potion': { name: 'Greater Healing Potion', rarity: 'uncommon', value: 150, effect: 'heal', amount: '4d4+4', description: 'A deep-crimson elixir potent enough to mend grievous injury.', icon: 'assets/icons/items/greater_healing_potion.webp' },
  'scroll_fireball': { name: 'Fire Scroll', rarity: 'uncommon', value: 200, effect: 'spell', spell: 'fireball', description: 'A rune-scribed vellum that looses a roaring blast of flame when read aloud.', icon: 'assets/icons/items/scroll_fireball.webp' },
  'silver_dagger': { name: 'Silver Dagger', rarity: 'uncommon', value: 100, type: 'weapon', bonus: '+1', description: 'A keen blade of blessed silver, bane of beasts that shun the moon.', icon: 'assets/icons/items/silver_dagger.webp' },

  // Rare items
  'magic_weapon': { name: 'Enchanted Blade', rarity: 'rare', value: 500, type: 'weapon', bonus: '+1', description: 'A finely balanced sword humming with a faint arcane charge.', icon: 'assets/icons/items/magic_weapon.webp' },
  'hunters_longbow': { name: 'Hunter\'s Longbow', rarity: 'rare', value: 450, type: 'weapon', bonus: '+1', description: 'A masterwork yew longbow strung with sinew. Favored by rangers who strike from the treeline.', icon: 'assets/icons/items/hunters_longbow.webp' },
  'ring_protection': { name: 'Protective Ring', rarity: 'rare', value: 750, type: 'ring', bonus: '+1 defense', description: 'A silver band warded with protective glyphs that turn aside harm.', icon: 'assets/icons/items/ring_protection.webp' },
  'wardstone_pendant': { name: 'Wardstone Pendant', rarity: 'rare', value: 600, type: 'charm', bonus: '+1', description: 'A sliver of rune-cut mountain stone on a leather cord. It hums faintly when danger is near.', icon: 'assets/icons/items/gemstone.webp' },

  // Very Rare
  // #44: the obtainable +2 weapon rung (very_rare, so tier-2 drops can carry it;
  // legendary weapons are t3-gated).
  'runic_greatsword': { name: 'Runic Greatsword', rarity: 'very_rare', value: 1500, type: 'weapon', bonus: '+2', description: 'A two-handed blade etched with dwarven war-runes that flare blue mid-swing.', icon: 'assets/icons/items/runic_greatsword.webp' },
  // #44: a FINDABLE very_rare accessory (the other +2/+3 artifacts are bespoke quest
  // rewards).
  'stormbound_ring': { name: 'Stormbound Ring', rarity: 'very_rare', value: 3500, type: 'ring', bonus: '+2', description: 'A band of sky-iron that crackles with a captive storm. Lightning answers its wearer\'s call.', icon: 'assets/icons/items/stormbound_ring.webp' },
  'legendary_artifact': { name: 'Mythic Ancient Artifact', rarity: 'very_rare', value: 5000, type: 'artifact', bonus: '+2', description: 'A relic of a forgotten age, thrumming with power none fully understand.', icon: 'assets/icons/items/legendary_artifact.webp' },
  'crown_of_sunfire': { name: 'Crown of Sunfire', rarity: 'very_rare', value: 7500, type: 'artifact', bonus: '+3', description: 'A radiant golden crown that blazes with inner fire. Said to grant its wearer dominion over light and shadow.', icon: `assets/icons/items/crown_of_sunfire.webp` },
  'bell_of_the_last_tide': { name: 'Bell of the Last Tide', rarity: 'very_rare', value: 8000, type: 'artifact', bonus: '+3', description: 'A hand-bell cast from the Bell-Warden\'s bronze heart. Rung once, the tide about the bearer forgets, for a breath, which way it was going.', icon: 'assets/icons/items/bell_of_the_last_tide.webp' }, // #70: The Drowned Bells finale reward (bespoke icon landed 2026-07-06)
  'seal_of_binding': { name: 'Seal of Binding', rarity: 'very_rare', value: 6000, type: 'artifact', bonus: '+2', description: 'An ancient seal inscribed with eldritch wards. It can imprison entities from beyond the veil.', icon: `assets/icons/items/seal_of_binding.webp` },
  'purified_heart_shard': { name: 'Purified Heart Shard', rarity: 'very_rare', value: 5000, type: 'artifact', bonus: '+2', description: 'A crystallized fragment of the Rot-Heart, cleansed of corruption. It pulses with faint, warm light.', icon: `assets/icons/items/purified_heart_shard.webp` },

  // --- Tier-3 legendary shelf (#44 / T3_CAMPAIGNS_PLAN §5.3) ------------------------
  // Bespoke finale/milestone rewards for the t3 campaigns. Legendary rarity is
  // tier-gated to t3+ (maxRarityRankForTier), and no playable t3 exists yet, so these
  // are UNOBTAINABLE BY DESIGN today — pinned in progressionLint KNOWN_GAPS
  // (unobtainableGear) exactly like legendary_weapon. t3 authoring assigns them to
  // milestones; do NOT put them in shops, hoards, or tiered drop tables before then.
  // (#44 icon art: complete — every shelf item has its own webp as of 2026-07-03.)
  'legendary_weapon': { name: 'Legendary Weapon', rarity: 'legendary', value: 7500, type: 'weapon', bonus: '+3', description: 'A weapon out of legend, its edge singing with ancient might.', icon: 'assets/icons/items/legendary_weapon.webp' },
  'blade_of_the_shattered_throne': { name: 'Blade of the Shattered Throne', rarity: 'legendary', value: 10000, type: 'weapon', bonus: '+3', description: 'Reforged from the throne the Shadow Overlord broke, this blade remembers every oath sworn upon it.', icon: 'assets/icons/items/blade_of_the_shattered_throne.webp' },
  'aegis_of_dawn': { name: 'Aegis of Dawn', rarity: 'legendary', value: 8000, type: 'armor', bonus: '+5 defense', description: 'Plate armor quenched in first light. Blows that should kill are swallowed by a sunrise glow.', icon: 'assets/icons/items/aegis_of_dawn.webp' },
  'heart_of_the_last_winter': { name: 'Heart of the Last Winter', rarity: 'legendary', value: 9000, type: 'artifact', bonus: '+3', description: 'A shard of unmelting ice cut from the Blood Wendigo\'s frozen heart. Winter itself bends around its bearer.', icon: 'assets/icons/items/heart_of_the_last_winter.webp' },
  'clockwork_god_core': { name: 'Clockwork God-Core', rarity: 'legendary', value: 9000, type: 'artifact', bonus: '+3', description: 'The still-ticking heart of the Herald of the Old Gods. Its gears turn one second ahead of the world.', icon: 'assets/icons/items/clockwork_god_core.webp' },
  'crown_of_the_drowned_city': { name: 'Crown of the Drowned City', rarity: 'legendary', value: 9000, type: 'artifact', bonus: '+3', description: 'A coral-crusted diadem raised from the sunken throne room. Voices of the deep counsel whoever wears it.', icon: 'assets/icons/items/crown_of_the_drowned_city.webp' },

  'magic_item': { name: 'Magic Item', rarity: 'uncommon', value: 200, description: 'An enchanted curio crackling with minor, unpredictable magic.', icon: 'assets/icons/items/spell_scroll.webp' },
  'magic_scroll': { name: 'Enchanted Scroll', rarity: 'uncommon', value: 150, description: 'A scroll inked with shimmering sigils that unravel a stored spell.', icon: 'assets/icons/items/spell_scroll.webp' },

  // POI-specific items
  'cave_mushrooms': { name: 'Glowing Cave Mushrooms', rarity: 'common', value: 15, stackable: true, description: 'Faintly luminous fungi prized by alchemists for their glow.', icon: 'assets/icons/items/cave_mushrooms.webp' },
  'raw_gems': { name: 'Raw Gemstones', rarity: 'uncommon', value: 75, description: 'Uncut stones straight from the rock, waiting for a jeweler\'s hand.', icon: 'assets/icons/items/raw_gems.webp' },
  'spider_silk': { name: 'Giant Spider Silk', rarity: 'uncommon', value: 50, description: 'Cord-strong strands from a giant spider\'s web, light and near unbreakable.', icon: 'assets/icons/items/spider_silk.webp' },
  'bat_guano': { name: 'Alchemical Reagent', rarity: 'common', value: 10, stackable: true, description: 'A pungent reagent, essential to more than one alchemical recipe.', icon: 'assets/icons/items/bat_guano.webp' },
  'ancient_scroll': { name: 'Ancient Scroll', rarity: 'uncommon', value: 100, description: 'Brittle parchment covered in the script of a long-dead tongue.', icon: 'assets/icons/items/ancient_scroll.webp' },
  'pearl': { name: 'Pearl', rarity: 'uncommon', value: 100, description: 'A lustrous pearl from the deep, cool and perfect to the touch.', icon: 'assets/icons/items/pearl.webp' },
  'ectoplasm': { name: 'Ectoplasm', rarity: 'uncommon', value: 75, description: 'A cold, gelatinous residue left where a spirit has passed.', icon: 'assets/icons/items/ectoplasm.webp' },
  'ritual_dagger': { name: 'Ritual Dagger', rarity: 'uncommon', value: 125, type: 'weapon', bonus: '+1', description: 'A ceremonial blade etched with symbols meant for darker rites.', icon: 'assets/icons/items/ritual_dagger.webp' },
  'dark_tome': { name: 'Dark Tome', rarity: 'rare', value: 300, description: 'A grimoire bound in cracked hide, its pages whispering forbidden things.', icon: 'assets/icons/items/dark_tome.webp' },
  'spell_scroll': { name: 'Spell Scroll', rarity: 'uncommon', value: 50, description: 'A single spell captured in ink, spent the moment it is read.', icon: 'assets/icons/items/spell_scroll.webp' },
  'healing_herbs': { name: 'Healing Herbs', rarity: 'common', value: 20, stackable: true, description: 'A bundle of green sprigs that soothe wounds when crushed and applied.', icon: 'assets/icons/items/healing_herbs.webp' },
  'rare_flower': { name: 'Rare Flower', rarity: 'uncommon', value: 45, description: 'An uncommon bloom sought by herbalists and perfumers alike.', icon: 'assets/icons/items/rare_flower.webp' },
  'dryad_blessing': { name: 'Dryad\'s Blessing', rarity: 'rare', value: 0, type: 'blessing', description: 'A fading benediction of the forest, warm as dappled sunlight.', icon: 'assets/icons/items/dryad_blessing.webp' },
  'fairy_dust': { name: 'Fairy Dust', rarity: 'uncommon', value: 100, description: 'A pinch of glittering motes that tingle with mischievous magic.', icon: 'assets/icons/items/fairy_dust.webp' },
  'fey_charm': { name: 'Fey Charm', rarity: 'rare', value: 250, type: 'charm', bonus: '+1', description: 'A trinket of the Feywild that bends small luck the wearer\'s way.', icon: 'assets/icons/items/fey_charm.webp' },
  'giant_feather': { name: 'Giant Eagle Feather', rarity: 'uncommon', value: 60, description: 'An enormous feather shed by an eagle of the high peaks.', icon: 'assets/icons/items/giant_feather.webp' },
  'dragon_scale': { name: 'Dragon Scale', rarity: 'very_rare', value: 1000, description: 'A palm-sized scale, hard as steel and warm to the touch.', icon: 'assets/icons/items/dragon_scale.webp' },
  'mountain_crystal': { name: 'Mountain Crystal', rarity: 'uncommon', value: 80, description: 'A clear quartz shard cut from the roots of the mountains.', icon: 'assets/icons/items/mountain_crystal.webp' },
  'storm_crystal': { name: 'Storm Crystal', rarity: 'rare', value: 200, description: 'A crystal that snaps with captive lightning when squeezed.', icon: 'assets/icons/items/storm_crystal.webp' },
  'magical_item': { name: 'Magical Artifact', rarity: 'rare', value: 150, description: 'An artifact of clear enchantment, its purpose not yet understood.', icon: 'assets/icons/items/magical_item.webp' },
  'artifact_trinket': { name: 'Ancient Trinket', rarity: 'uncommon', value: 45, type: 'charm', bonus: '+1', description: 'A small relic of the ancients that lends a subtle edge.', icon: 'assets/icons/items/artifact_trinket.webp' },
  'enchanted_trinket': { name: 'Enchanted Trinket', rarity: 'uncommon', value: 65, type: 'charm', bonus: '+1', description: 'A charm woven with a light enchantment that steadies the hand.', icon: 'assets/icons/items/enchanted_trinket.webp' },
  'ghostly_trinket': { name: 'Ghostly Trinket', rarity: 'uncommon', value: 60, type: 'charm', bonus: '+1', description: 'A cold, translucent bauble that hums with restless spirit.', icon: 'assets/icons/items/ghostly_trinket.webp' },
  'history_tome': { name: 'Ancient History Tome', rarity: 'uncommon', value: 150, description: 'A weighty chronicle of ages past, dense with names and dates.', icon: 'assets/icons/items/history_tome.webp' },
  'forbidden_knowledge': { name: 'Forbidden Knowledge', rarity: 'rare', value: 300, description: 'Secrets no one was meant to keep, and harder still to forget.', icon: 'assets/icons/items/forbidden_knowledge.webp' },
  'spirit_essence': { name: 'Spirit Essence', rarity: 'rare', value: 120, description: 'A wisp of captured soul-stuff, faintly glowing in its vial.', icon: 'assets/icons/items/spirit_essence.webp' },
  'primal_essence': { name: 'Primal Essence', rarity: 'rare', value: 150, description: 'Raw, untamed magic of the wild world, distilled to a spark.', icon: 'assets/icons/items/primal_essence.webp' },
  'journal_page': { name: 'Torn Journal Page', rarity: 'common', value: 5, description: 'A single torn page, its hurried words trailing off mid-sentence.', icon: 'assets/icons/items/journal_page.webp' },
  'survivor_reward': { name: 'Survivor\'s Gift', rarity: 'common', value: 20, description: 'A token of thanks pressed into your hand by one you saved.', icon: 'assets/icons/items/survivor_reward.webp' },
  'salvaged_goods': { name: 'Salvaged Goods', rarity: 'common', value: 30, description: 'Odds and ends scavenged from ruin, worth a few coins to the right buyer.', icon: 'assets/icons/items/salvaged_goods.webp' },
  'wrapped_corpse_loot': { name: 'Traveler\'s Belongings', rarity: 'common', value: 25, description: 'The belongings of a fallen traveler, taken with a quiet apology.', icon: 'assets/icons/items/wrapped_corpse_loot.webp' },
  'exposed_minerals': { name: 'Exposed Minerals', rarity: 'common', value: 20, description: 'Ore-flecked rock prised loose from a fresh seam.', icon: 'assets/icons/items/exposed_minerals.webp' },
  'hard_leather': { name: 'Hardened Leather', rarity: 'common', value: 15, description: 'A cut of toughened hide, ready for the tanner or armorer.', icon: 'assets/icons/items/hard_leather.webp' },
  'poison_vial': { name: 'Poison Vial', rarity: 'uncommon', value: 45, description: 'A stoppered vial of slow, creeping venom.', icon: 'assets/icons/items/poison_vial.webp' },
  'glowing_fungi': { name: 'Glowing Cave Fungi', rarity: 'common', value: 10, stackable: true, description: 'Pale cave fungi that shed a soft, steady light.', icon: 'assets/icons/items/glowing_fungi.webp' },
  'rare_herb': { name: 'Rare Herb', rarity: 'uncommon', value: 40, description: 'A hard-to-find herb valued by healers and poisoners both.', icon: 'assets/icons/items/rare_herb.webp' },
  // Water towns Phase 6 (#65): boatwright gather target, tapped from forest trees
  // (sitePopulator HARVEST_NODES.forest + LOOT.forest). Icon BORROWS rare_ingredient
  // (an amber lump) as a single-item stand-in until dedicated art lands; placeholderIcon
  // tracks it in ITEM-05 and queues pine_resin.webp (docs/IMAGE_GENERATION_PROMPTS.md).
  'pine_resin': { name: 'Pine Resin', rarity: 'common', value: 15, stackable: true, description: 'A sticky amber lump tapped from forest pine, prized by boatwrights.', icon: 'assets/icons/items/rare_ingredient.webp', placeholderIcon: true },
  'mountain_herbs': { name: 'Mountain Herbs', rarity: 'common', value: 15, description: 'Hardy alpine sprigs with a sharp, medicinal scent.', icon: 'assets/icons/items/mountain_herbs.webp' },
  'herbal_remedy': { name: 'Herbal Remedy', rarity: 'common', value: 15, effect: 'heal', amount: '1d4', description: 'A folk poultice that eases minor hurts.', icon: 'assets/icons/items/herbal_remedy.webp' },
  'elven_rations': { name: 'Elven Waybread', rarity: 'uncommon', value: 20, stackable: true, effect: 'heal', amount: '2d4', description: 'Wafers of elven waybread; a single bite restores the weary.', icon: 'assets/icons/items/elven_rations.webp' },
  'natures_blessing': { name: 'Nature\'s Blessing', rarity: 'uncommon', value: 0, type: 'blessing', description: 'The quiet favor of the wilds, granted to those who tread lightly.', icon: 'assets/icons/items/natures_blessing.webp' },
  'elven_blessing': { name: 'Elven Blessing', rarity: 'rare', value: 0, type: 'blessing', description: 'An elven grace that lingers like the scent of spring rain.', icon: 'assets/icons/items/elven_blessing.webp' },
  'eagle_blessing': { name: 'Eagle\'s Blessing', rarity: 'rare', value: 0, type: 'blessing', description: 'A gift of the high eyries, lending keen sight and a steady nerve.', icon: 'assets/icons/items/eagle_blessing.webp' },
  'druid_token': { name: 'Druid Token', rarity: 'uncommon', value: 50, description: 'A carved acorn-and-oak sigil marking the favor of a druid circle.', icon: 'assets/icons/items/druid_token.webp' },
  'nature_charm': { name: 'Nature Charm', rarity: 'uncommon', value: 75, type: 'charm', bonus: '+1', description: 'A woven charm of leaf and vine that whispers of the green.', icon: 'assets/icons/items/nature_charm.webp' },
  'ancient_gold': { name: 'Ancient Gold Coins', rarity: 'uncommon', value: 100, description: 'Coins stamped with the faces of kings no living soul remembers.', icon: 'assets/icons/items/ancient_gold.webp' },
  'pixie_gold': { name: 'Pixie Gold', rarity: 'uncommon', value: 50, description: 'Glittering coins that may be fairy-tricked to vanish by dawn.', icon: 'assets/icons/items/pixie_gold.webp' },
  'rare_gem': { name: 'Rare Gemstone', rarity: 'rare', value: 200, description: 'A flawless gemstone that catches the light like frozen fire.', icon: 'assets/icons/items/rare_gem.webp' },
  'drowned_treasure': { name: 'Drowned Treasure', rarity: 'uncommon', value: 75, description: 'Sea-tarnished valuables recovered from a watery grave.', icon: 'assets/icons/items/drowned_treasure.webp' },
  'cult_treasure': { name: 'Cultist Treasure', rarity: 'uncommon', value: 80, description: 'Ill-gotten wealth hoarded by a secretive cult.', icon: 'assets/icons/items/cult_treasure.webp' },
  'fallen_treasure': { name: 'Fallen Treasure', rarity: 'uncommon', value: 50, description: 'Coin and trinkets left behind by those who fell here.', icon: 'assets/icons/items/fallen_treasure.webp' },
  'dragon_gold': { name: 'Dragon Hoard Gold', rarity: 'rare', value: 500, description: 'Gold from a dragon\'s hoard, still faintly warm.', icon: 'assets/icons/items/dragon_gold.webp' },
  'dragon_egg': { name: 'Dragon Egg', rarity: 'legendary', value: 5000, description: 'A leathery egg the size of a shield, pulsing with slow heat.', icon: 'assets/icons/items/dragon_egg.webp' },
  'cave_map': { name: 'Rough Cave Map', rarity: 'uncommon', value: 30, description: 'A charcoal sketch of tunnels, roughly drawn but usable.', icon: 'assets/icons/items/cave_map.webp' },
  'forest_map': { name: 'Forest Map', rarity: 'uncommon', value: 40, description: 'A hand-drawn map tracing hidden paths through the woods.', icon: 'assets/icons/items/forest_map.webp' },
  'traveler_map': { name: 'Traveler\'s Map', rarity: 'uncommon', value: 35, description: 'A well-worn road map annotated by many previous owners.', icon: 'assets/icons/items/traveler_map.webp' },
  'old_map': { name: 'Old Map', rarity: 'uncommon', value: 35, description: 'A faded map of somewhere, its landmarks half rubbed away.', icon: 'assets/icons/items/old_map.webp' },
  'hermit_wisdom': { name: 'Hermit\'s Wisdom', rarity: 'uncommon', value: 100, description: 'A cryptic scrap of advice from a recluse who sees more than he says.', icon: 'assets/icons/items/hermit_wisdom.webp' },
  'ancient_artifact': { name: 'Ancient Artifact', rarity: 'rare', value: 400, description: 'A relic of vanished craftsmanship, its makers long turned to dust.', icon: 'assets/icons/items/ancient_artifact.webp' },
  'enchanted_seed': { name: 'Enchanted Seed', rarity: 'uncommon', value: 35, description: 'A seed that quivers with the promise of unnatural growth.', icon: 'assets/icons/items/enchanted_seed.webp' },
  'enchanted_mushroom': { name: 'Enchanted Mushroom', rarity: 'uncommon', value: 30, description: 'A fungus that shimmers with mild, edible magic.', icon: 'assets/icons/items/enchanted_mushroom.webp' },
  'enchanted_staff': { name: 'Enchanted Staff', rarity: 'uncommon', value: 250, type: 'weapon', bonus: '+1', description: 'A rune-carved staff that answers a spellcaster\'s will.', icon: 'assets/icons/items/enchanted_staff.webp' },
  'mountain_view': { name: 'Memory of a View', rarity: 'common', value: 0, description: 'Not a thing at all, but the memory of a breathtaking vista.', icon: 'assets/icons/items/mountain_view.webp' },

  // Environmental / natural loot (used by environmental & POI encounters)
  'rainwater': { name: 'Collected Rainwater', rarity: 'common', value: 5, stackable: true, description: 'Fresh rain gathered in a flask, clean and cold.', icon: 'assets/icons/items/rainwater.webp' },
  'fog_essence': { name: 'Fog Essence', rarity: 'uncommon', value: 60, description: 'A vial of captured mist that curls and drifts within the glass.', icon: 'assets/icons/items/fog_essence.webp' },
  'desert_flower': { name: 'Desert Flower', rarity: 'uncommon', value: 35, description: 'A resilient bloom that hoards water beneath the desert sun.', icon: 'assets/icons/items/desert_flower.webp' },
  'frost_flower': { name: 'Frost Flower', rarity: 'uncommon', value: 35, description: 'A crystalline blossom that never melts, cold to the touch.', icon: 'assets/icons/items/frost_flower.webp' },
  'wisp_essence': { name: 'Wisp Essence', rarity: 'rare', value: 120, description: 'The captured glow of a will-o\'-wisp, dancing in its jar.', icon: 'assets/icons/items/wisp_essence.webp' },
  'cave_fish': { name: 'Cave Fish', rarity: 'common', value: 8, stackable: true, description: 'A pale, blind fish caught in a lightless underground pool.', icon: 'assets/icons/items/cave_fish.webp' },
  'beast_hide': { name: 'Beast Hide', rarity: 'common', value: 20, description: 'The thick pelt of a wild beast, good for leather or trade.', icon: 'assets/icons/items/beast_hide.webp' },
  'enchanted_tusk': { name: 'Enchanted Tusk', rarity: 'rare', value: 150, description: 'A great tusk humming faintly with residual magic.', icon: 'assets/icons/items/enchanted_tusk.webp' },

  // Generic loot
  'gold_coins': { name: 'Gold Coins', rarity: 'common', value: 0, isGold: true, description: 'A handful of glittering gold coins.', icon: 'assets/icons/items/gold_coins.webp' },
  'old_coins': { name: 'Ancient Coins', rarity: 'common', value: 25, description: 'A pouch of tarnished coins from an older, colder mint.', icon: 'assets/icons/items/old_coins.webp' },
  'treasure_map': { name: 'Treasure Map', rarity: 'rare', value: 0, type: 'quest_item', description: 'An X-marked chart promising riches to whoever can read it.', icon: 'assets/icons/items/treasure_map.webp' },
  // Quest items
  'quest_clue': { name: 'Mysterious Clue', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'A puzzling scrap of evidence that hints at something larger.', icon: 'assets/icons/items/quest_clue.webp' },
  'quest_key': { name: 'Ornate Key', rarity: 'rare', value: 0, type: 'quest_item', description: 'An ornate key wrought for a lock you have yet to find.', icon: 'assets/icons/items/quest_key.webp' },
  'quest_letter': { name: 'Sealed Letter', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'A wax-sealed letter meant for particular eyes only.', icon: 'assets/icons/items/quest_letter.webp' },
  'mysterious_letter': { name: 'Mysterious Letter', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'An unsigned letter whose message raises more questions than answers.', icon: 'assets/icons/items/mysterious_letter.webp' },

  // Monster drops
  'wolf_pelt': { name: 'Wolf Pelt', rarity: 'common', value: 15, stackable: true, description: 'The grey pelt of a wolf, warm and worth a modest sum.', icon: 'assets/icons/items/wolf_pelt.webp' },
  'wolf_fang': { name: 'Wolf Fang', rarity: 'common', value: 10, stackable: true, description: 'A curved fang taken as a trophy from a fallen wolf.', icon: 'assets/icons/items/wolf_fang.webp' },
  'goblin_ear': { name: 'Goblin Ear', rarity: 'common', value: 5, stackable: true, description: 'A grisly bounty token: proof of one goblin fewer.', icon: 'assets/icons/items/goblin_ear.webp' },
  'spider_venom': { name: 'Spider Venom', rarity: 'uncommon', value: 35, description: 'A vial of milked venom, sold to alchemists at a good price.', icon: 'assets/icons/items/spider_venom.webp' },
  'bandit_badge': { name: 'Bandit Badge', rarity: 'common', value: 20, description: 'A crude insignia marking membership in some road-gang.', icon: 'assets/icons/items/bandit_badge.webp' },
  'bear_claw': { name: 'Bear Claw', rarity: 'uncommon', value: 25, description: 'A thick, curved claw, prized by hunters as a charm.', icon: 'assets/icons/items/bear_claw.webp' },
  'bear_pelt': { name: 'Bear Pelt', rarity: 'uncommon', value: 40, description: 'A heavy bear hide, coveted for winter cloaks.', icon: 'assets/icons/items/bear_pelt.webp' },
  'venom_sac': { name: 'Venom Sac', rarity: 'uncommon', value: 45, description: 'An intact poison gland, delicate and best handled with care.', icon: 'assets/icons/items/venom_sac.webp' },

  // Encounter loot
  'rusty_dagger': { name: 'Rusty Dagger', rarity: 'common', value: 5, type: 'weapon', description: 'A pitted, neglected blade, barely better than none at all.', icon: 'assets/icons/items/rusty_dagger.webp' },
  'shortsword': { name: 'Shortsword', rarity: 'common', value: 25, type: 'weapon', bonus: '+1', description: 'A serviceable soldier\'s blade, well balanced and reliable.', icon: 'assets/icons/items/shortsword.webp' },
  'leather_armor': { name: 'Leather Armor', rarity: 'common', value: 30, type: 'armor', bonus: '+1 defense', description: 'Supple boiled-leather protection for those who value speed.', icon: 'assets/icons/items/leather_armor.webp' },
  // Icon BORROWS hard_leather (a single-item stand-in) until dedicated armor art lands;
  // placeholderIcon tracks it in ITEM-05 and queues studded_leather.webp.
  'studded_leather': { name: 'Studded Leather', rarity: 'uncommon', value: 90, type: 'armor', bonus: '+2 defense', description: 'Leather reinforced with iron studs, tougher without the weight of mail.', icon: 'assets/icons/items/hard_leather.webp', placeholderIcon: true },
  // Icon BORROWS beast_hide (a single-item stand-in) until dedicated armor art lands;
  // placeholderIcon tracks it in ITEM-05 and queues hide_armor.webp.
  'hide_armor': { name: 'Hide Armor', rarity: 'uncommon', value: 80, type: 'armor', bonus: '+2 defense', description: 'Layered beast-hide armor, crude but surprisingly sturdy.', icon: 'assets/icons/items/beast_hide.webp', placeholderIcon: true },
  'scale_mail': { name: 'Scale Mail', rarity: 'rare', value: 350, type: 'armor', bonus: '+3 defense', description: 'Overlapping metal scales that turn aside all but the hardest blows.', icon: 'assets/icons/items/dragon_scale.webp' },
  'dragonscale_plate': { name: 'Dragonscale Plate', rarity: 'very_rare', value: 1500, type: 'armor', bonus: '+4 defense', description: 'Armor forged from dragon scales, nearly impervious and light for its strength.', icon: 'assets/icons/items/dragon_scale.webp' },
  'artifact_fragment': { name: 'Artifact Fragment', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'A broken piece of some greater relic, meaningless until made whole.', icon: 'assets/icons/items/artifact_fragment.webp' },
  'inspiration': { name: 'Minstrel\'s Blessing', rarity: 'uncommon', value: 0, type: 'buff', description: 'A minstrel\'s rousing gift, lifting the heart before the fight.', icon: 'assets/icons/items/inspiration.webp' },
  'divine_blessing': { name: 'Divine Blessing', rarity: 'rare', value: 0, type: 'blessing', description: 'A god\'s favor settling over you like a warm shield.', icon: 'assets/icons/items/divine_blessing.webp' },
  'ancient_knowledge': { name: 'Ancient Knowledge', rarity: 'rare', value: 0, type: 'lore', description: 'Wisdom recovered from the ages, worth more than gold to a scholar.', icon: 'assets/icons/items/ancient_knowledge.webp' },
  'cursed_item': { name: 'Cursed Trinket', rarity: 'rare', value: 0, type: 'cursed', description: 'A trinket that feels wrong in the hand and colder by the hour.', icon: 'assets/icons/items/cursed_item.webp' },
  'rare_ore': { name: 'Rare Ore', rarity: 'uncommon', value: 60, description: 'A vein-rich chunk of uncommon metal, sought by smiths.', icon: 'assets/icons/items/rare_ore.webp' },
  'family_heirloom': { name: 'Family Heirloom', rarity: 'uncommon', value: 50, description: 'A modest keepsake carrying more sentiment than coin.', icon: 'assets/icons/items/family_heirloom.webp' },
  'ale_mug': { name: 'Ale Mug', rarity: 'common', value: 2, effect: 'heal', amount: '1d4', description: 'A frothy mug of ale; a swig steadies the nerves and dulls the aches.', icon: 'assets/icons/items/ale_mug.webp' },
  'bar_stool_leg': { name: 'Bar Stool Leg', rarity: 'common', value: 1, type: 'weapon', description: 'A stout length of table-wood, improvised weapon of many a brawl.', icon: 'assets/icons/items/bar_stool_leg.webp' },
  'stolen_goods': { name: 'Stolen Goods', rarity: 'uncommon', value: 35, description: 'Pilfered valuables best sold where no one asks questions.', icon: 'assets/icons/items/stolen_goods.webp' },
  'poisoned_dagger': { name: 'Poisoned Dagger', rarity: 'uncommon', value: 75, type: 'weapon', bonus: '+1', description: 'A wickedly coated blade that bites long after it cuts.', icon: 'assets/icons/items/poisoned_dagger.webp' },
  'rare_ingredient': { name: 'Rare Ingredient', rarity: 'uncommon', value: 40, description: 'A scarce component demanded by finicky alchemists.', icon: 'assets/icons/items/rare_ingredient.webp' },

  // Encounter reward items
  'medical_journal': { name: 'Medical Journal', rarity: 'uncommon', value: 30, description: 'A physician\'s notebook, full of remedies and grim case studies.', icon: 'assets/icons/items/medical_journal.webp' },
  'medicine_kit': { name: 'Medicine Kit', rarity: 'uncommon', value: 45, effect: 'heal', amount: '2d4', description: 'Bandages, salves, and needles for treating wounds in the field.', icon: 'assets/icons/items/medicine_kit.webp' },
  'uncovered_ruins': { name: 'Ruins Map Fragment', rarity: 'uncommon', value: 50, type: 'quest_item', description: 'A fragment of a map leading back to the ruins you found.', icon: 'assets/icons/items/uncovered_ruins.webp' },
  'map_fragment': { name: 'Map Fragment', rarity: 'uncommon', value: 25, description: 'A torn corner of some larger chart, tantalizingly incomplete.', icon: 'assets/icons/items/map_fragment.webp' },

  // Campaign quest items — each is a UNIQUE, campaign-specific objective item, kept
  // distinct from the generic loot ids above (map_fragment, treasure_map, ...) so a
  // random loot drop of the generic item can never complete a quest milestone. Value
  // is 0 (quest items are not a gold source) and each reuses its generic sibling's
  // icon since the art fits. Their type is 'quest_item' like treasure_map.
  //
  // `placeholderIcon: true` marks that the icon is BORROWED from another item until
  // dedicated art is generated; see docs/IMAGE_GENERATION_PROMPTS.md ("dedicated
  // quest-item icons" queue). It is a first-class, greppable flag: the content audit
  // lists every placeholder (ITEM-05, warn) and fails (ITEM-06, error) on any NEW
  // quest item that borrows another item's icon WITHOUT the flag. Clear a placeholder
  // by generating the dedicated .webp, repointing `icon`, and removing this field.
  'goblin_scouts_map': { name: 'Goblin Scout\'s Map', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'A crude map daubed by a goblin scout, marking its warband\'s routes.', icon: 'assets/icons/items/map_fragment.webp', placeholderIcon: true },
  'hidden_map': { name: 'Hidden Map', rarity: 'rare', value: 0, type: 'quest_item', description: 'A concealed chart revealing a place meant to stay lost.', icon: 'assets/icons/items/treasure_map.webp', placeholderIcon: true },
  'caravan_ledger': { name: 'Caravan Ledger', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'A merchant caravan\'s accounts, its entries hinting at foul play.', icon: 'assets/icons/items/map_fragment.webp', placeholderIcon: true },
  'sun_kings_star_chart': { name: 'Sun-Kings\' Star-Chart', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'A gilded chart of the heavens as the Sun-Kings once read them.', icon: 'assets/icons/items/ancient_scroll.webp', placeholderIcon: true },
  'frostbound_ledger': { name: 'Frostbound Ledger', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'A frost-rimed record book, its ink cracking with cold.', icon: 'assets/icons/items/map_fragment.webp', placeholderIcon: true },
  'famine_winter_saga': { name: 'The Famine-Winter Saga', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'An epic recounting the long, starving winter of ages past.', icon: 'assets/icons/items/history_tome.webp', placeholderIcon: true },
  'moorland_herbs': { name: 'Moorland Herbs', rarity: 'common', value: 0, type: 'quest_item', description: 'Bitter herbs gathered from the windswept moors.', icon: 'assets/icons/items/healing_herbs.webp', placeholderIcon: true },
  'mutated_specimen': { name: 'Mutated Specimen', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'A grotesque, twisted creature preserved for grim study.', icon: 'assets/icons/items/venom_sac.webp', placeholderIcon: true },
  'automaton_control_rod': { name: 'Automaton Control Rod', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'A humming brass rod that commands a clockwork construct.', icon: 'assets/icons/items/enchanted_trinket.webp', placeholderIcon: true },
  'stolen_aether_blueprints': { name: 'Stolen Aether Blueprints', rarity: 'uncommon', value: 0, type: 'quest_item', description: 'Stolen schematics detailing a forbidden aether-engine.', icon: 'assets/icons/items/ancient_scroll.webp', placeholderIcon: true },
  'cult_journal': { name: 'Cult Journal', rarity: 'common', value: 0, type: 'quest_item', description: 'A cultist\'s diary, its later entries sliding into madness.', icon: 'assets/icons/items/journal_page.webp', placeholderIcon: true },
  'forbidden_ritual_text': { name: 'Forbidden Ritual Text', rarity: 'rare', value: 0, type: 'quest_item', description: 'Instructions for a rite that should never be performed.', icon: 'assets/icons/items/dark_tome.webp', placeholderIcon: true }
};

// --- Rarity-by-tier loot gating ---------------------------------------------
// High-rarity loot must not drop during low-tier play. Rarities are ranked; each
// campaign tier has a maximum allowed rank. This is applied to RANDOM drops only
// (encounter/POI loot rolled by encounterResolver). Hand-authored template/milestone
// rewards are honored as explicit design and are NOT clamped here.
//
// PREMIUM HOOK: very_rare (and legendary) are also intended to become a premium
// entitlement later. When an entitlements system exists (e.g. src/utils/entitlements.js
// exposing something like `userTier`/`hasEntitlement('premium_loot')`), gate very_rare
// here by lowering `maxRarityRankForTier` to `rare` for non-entitled users (or filter in
// `filterDropsByTier`). No entitlement system exists yet, so only the level/tier gate is
// wired up now.

export const RARITY_RANK = {
  common: 0,
  uncommon: 1,
  rare: 2,
  very_rare: 3,
  legendary: 4
};

/**
 * Resolve a campaign tier from an available signal. Prefers an explicit tier
 * (settings.tier / template tier); otherwise derives it from party level
 * (Tier 1 = Lv 1-2, Tier 2 = Lv 3-4, ...). Defaults to Tier 1.
 * @param {{ tier?: number, level?: number }} ctx
 * @returns {number} Tier (>= 1)
 */
export const resolveTier = ({ tier, level } = {}) => {
  if (tier != null && !Number.isNaN(Number(tier))) return Math.max(1, Number(tier));
  if (level != null && !Number.isNaN(Number(level))) {
    return Math.max(1, Math.ceil(Number(level) / 2));
  }
  return 1;
};

/**
 * Maximum rarity RANK a given tier may receive from random drops.
 * Tier 1 (Lv 1-2) caps at `rare`; Tier 2 unlocks `very_rare`; Tier 3+ unlocks all.
 * @param {number} tier
 * @returns {number} Max allowed rank (see RARITY_RANK)
 */
export const maxRarityRankForTier = (tier) => {
  const t = resolveTier({ tier });
  if (t <= 1) return RARITY_RANK.rare; // Tier 1: common..rare only
  if (t === 2) return RARITY_RANK.very_rare; // Tier 2: adds very_rare
  return RARITY_RANK.legendary; // Tier 3+: everything
};

/**
 * Whether a catalog item may be granted as a random drop at the given tier/level.
 * Unknown item keys are allowed (fail-open, consistent with renderer fallbacks).
 * @param {string} itemKey - ITEM_CATALOG key
 * @param {{ tier?: number, level?: number }} ctx
 * @returns {boolean}
 */
export const isItemAllowedForTier = (itemKey, ctx = {}) => {
  const item = ITEM_CATALOG[itemKey];
  if (!item) return true;
  const rank = RARITY_RANK[item.rarity] ?? RARITY_RANK.common;
  return rank <= maxRarityRankForTier(resolveTier(ctx));
};

/**
 * Filter a list of catalog keys down to those allowed to drop at the given tier/level.
 * @param {string[]} itemKeys
 * @param {{ tier?: number, level?: number }} ctx
 * @returns {string[]}
 */
export const filterDropsByTier = (itemKeys, ctx = {}) => {
  if (!Array.isArray(itemKeys)) return [];
  return itemKeys.filter((key) => isItemAllowedForTier(key, ctx));
};

/**
 * Add item to inventory
 * @param {Array} inventory - Current inventory
 * @param {string} itemKey - Item key from ITEM_CATALOG
 * @param {number} quantity - Amount to add (default 1)
 * @returns {Array} Updated inventory
 */
export const addItem = (inventory, itemKey, quantity = 1) => {
  const itemDef = ITEM_CATALOG[itemKey];
  const newInventory = [...inventory];

  // Check if stackable item already exists
  if (itemDef?.stackable) {
    const existing = newInventory.find(i => i.key === itemKey);
    if (existing) {
      existing.quantity += quantity;
      return newInventory;
    }
  }

  // Add new item
  newInventory.push({
    key: itemKey,
    name: itemDef?.name || itemKey,
    rarity: itemDef?.rarity || 'common',
    value: itemDef?.value || 0,
    quantity,
    ...(itemDef || {})
  });

  return newInventory;
};

/**
 * Remove item from inventory
 * @param {Array} inventory - Current inventory
 * @param {string} itemKey - Item key to remove
 * @param {number} quantity - Amount to remove (default 1)
 * @returns {Array} Updated inventory
 */
export const removeItem = (inventory, itemKey, quantity = 1) => {
  const newInventory = [...inventory];
  const index = newInventory.findIndex(i => i.key === itemKey);

  if (index === -1) return newInventory;

  if (newInventory[index].quantity > quantity) {
    newInventory[index].quantity -= quantity;
  } else {
    newInventory.splice(index, 1);
  }

  return newInventory;
};

/**
 * Add gold to character
 * @param {Object} character - Character object
 * @param {number} amount - Gold to add
 * @returns {Object} Updated character
 */
export const addGold = (character, amount) => {
  return {
    ...character,
    gold: (character.gold || 0) + amount
  };
};

/**
 * Remove gold from character
 * @param {Object} character - Character object
 * @param {number} amount - Gold to remove
 * @returns {Object|null} Updated character or null if insufficient funds
 */
export const removeGold = (character, amount) => {
  if ((character.gold || 0) < amount) return null;

  return {
    ...character,
    gold: character.gold - amount
  };
};

/**
 * Get inventory value
 * @param {Array} inventory - Inventory array
 * @returns {number} Total value in gold
 */
export const getInventoryValue = (inventory) => {
  return inventory.reduce((total, item) => {
    return total + (item.value * (item.quantity || 1));
  }, 0);
};

/**
 * Get rarity color for display
 * @param {string} rarity - Item rarity
 * @returns {string} CSS color
 */
export const getRarityColor = (rarity) => {
  const colors = {
    common: '#9d9d9d',
    uncommon: '#1eff00',
    rare: '#0070dd',
    very_rare: '#a335ee',
    legendary: '#ff8000'
  };
  return colors[rarity] || colors.common;
};
