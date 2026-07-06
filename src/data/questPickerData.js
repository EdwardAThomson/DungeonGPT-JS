// Picker data for the Custom campaign configurator.
// Exposes game registries as selectable options for the milestone slot system.

import { ITEM_CATALOG, RARITY_RANK, maxRarityRankForTier } from '../utils/inventorySystem';
import { hasTier } from '../game/entitlements';

// ============================================================
// BUILDING TYPES
// Buildings where quest items or NPCs can be placed.
// Must match types supported by townMapGenerator.js placeBuildings().
// ============================================================
export const QUEST_BUILDINGS = [
    { id: 'tavern', name: 'Tavern', icon: '🍺', description: 'A place to gather rumors and meet contacts' },
    { id: 'inn', name: 'Inn', icon: '🏨', description: 'Lodging for travelers with secrets to share' },
    { id: 'shop', name: 'Shop', icon: '🏪', description: 'A general store with hidden wares' },
    { id: 'blacksmith', name: 'Blacksmith', icon: '⚒️', description: 'A forge where weapons are made and repaired' },
    { id: 'temple', name: 'Temple', icon: '⛪', description: 'A place of worship and ancient knowledge' },
    { id: 'guild', name: 'Guild Hall', icon: '🏛️', description: 'Headquarters of a professional guild' },
    { id: 'market', name: 'Market', icon: '🏬', description: 'A busy trading post' },
    { id: 'manor', name: 'Manor', icon: '🏰', description: 'The residence of local nobility' },
    { id: 'bank', name: 'Bank', icon: '🏦', description: 'A secure vault for valuables' },
    { id: 'archives', name: 'Archives', icon: '📚', description: 'A repository of records and old maps' },
    { id: 'library', name: 'Library', icon: '📖', description: 'A collection of tomes and scrolls' },
    { id: 'alchemist', name: 'Alchemist', icon: '⚗️', description: 'A shop of potions and reagents' },
    { id: 'foundry', name: 'Foundry', icon: '🔥', description: 'An industrial forge for heavy metalwork' },
    { id: 'warehouse', name: 'Warehouse', icon: '📦', description: 'A storage facility for trade goods' },
];

// ============================================================
// NPC ROLES
// Roles for narrative milestone NPCs.
// Must match roles supported by npcGenerator.js.
// ============================================================
export const NPC_ROLES = [
    { id: 'Guard', name: 'Guard Captain', icon: '🛡️', description: 'A military leader who can rally soldiers' },
    { id: 'Noble', name: 'Noble', icon: '👑', description: 'A person of influence and political power' },
    { id: 'Merchant', name: 'Merchant', icon: '🪙', description: 'A trader with connections and information' },
    { id: 'Priest', name: 'Priest', icon: '⛪', description: 'A spiritual leader with hidden knowledge' },
    { id: 'Guild Master', name: 'Guild Master', icon: '🏛️', description: 'Head of a professional guild' },
    { id: 'Criminal', name: 'Criminal', icon: '🗡️', description: 'An underworld figure with useful contacts' },
    { id: 'Tavern Keeper', name: 'Tavern Keeper', icon: '🍺', description: 'A barkeep who hears everything' },
    { id: 'Blacksmith', name: 'Blacksmith', icon: '⚒️', description: 'A craftsman who can forge special items' },
    { id: 'Villager', name: 'Villager', icon: '🏠', description: 'A local who knows the area' },
];

// ============================================================
// QUEST ITEMS
// Items that can be used as milestone objectives.
// Filtered from ITEM_CATALOG: quest_item type + key lore/artifact items.
// ============================================================
export const QUEST_ITEMS = Object.entries(ITEM_CATALOG)
    .filter(([, item]) => {
        // Include explicit quest items, artifacts, lore, and key story items
        const questTypes = ['quest_item', 'artifact', 'lore'];
        if (item.type && questTypes.includes(item.type)) return true;
        // Also include specific items commonly used in quest milestones
        return false;
    })
    .map(([id, item]) => ({
        id,
        name: item.name,
        rarity: item.rarity,
        icon: item.icon,
        type: item.type || 'quest_item',
    }));

// Items that make sense as loot/search objectives (broader than just quest_item type)
export const SEARCHABLE_ITEMS = Object.entries(ITEM_CATALOG)
    .filter(([, item]) => {
        // Exclude consumables and basic supplies — those aren't quest objectives
        const excludeKeys = ['rations', 'torch', 'rope', 'healing_potion', 'greater_healing_potion', 'antidote'];
        if (excludeKeys.includes(item.name?.toLowerCase())) return false;
        // Include anything with value or quest significance
        return item.rarity === 'rare' || item.rarity === 'very_rare' ||
               item.type === 'quest_item' || item.type === 'artifact' || item.type === 'lore' ||
               item.type === 'weapon' || item.type === 'armor' || item.type === 'ring';
    })
    .map(([id, item]) => ({
        id,
        name: item.name,
        rarity: item.rarity,
        icon: item.icon,
        type: item.type || 'misc',
    }));

// ============================================================
// CUSTOM-QUEST ITEM FILTERING (entitlement pass, 2026-07-06)
// ============================================================

// Flagship campaign rewards and the t3 legendary shelf: bespoke finale/milestone
// prizes (see inventorySystem.js ITEM_CATALOG and progressionLint KNOWN_GAPS
// .unobtainableGear). They are campaign rewards, NOT custom-quest material, so they
// are excluded from the custom builder for EVERY account tier — placing one as a
// slot-1 objective would hand out a +3 artifact at level 1. bell_of_the_last_tide
// in particular is the premium-only Drowned Bells finale reward (#70). Keep this
// list in sync with the legendary shelf when t3 authoring adds rewards.
export const CUSTOM_QUEST_EXCLUDED_ITEMS = Object.freeze([
    'aegis_of_dawn',
    'bell_of_the_last_tide',
    'blade_of_the_shattered_throne',
    'clockwork_god_core',
    'crown_of_the_drowned_city',
    'heart_of_the_last_winter',
    'legendary_weapon',
]);

/**
 * The items a custom quest may offer as a slot-1 objective at a given campaign tier.
 * Single source of truth for the builder's item dropdown AND its lookups, so an id
 * outside the ceiling can neither be listed nor resolved into a milestone.
 *
 * Two gates, mirroring the random-drop ceiling (maxRarityRankForTier):
 *   1. The flagship/unobtainable set above is excluded at every tier.
 *   2. Rarity is capped by campaign tier (t1: up to rare, t2: adds very_rare,
 *      t3: everything). Tier 3 is a Members benefit (same lock as the builder's
 *      Tier selector), so a non-member asking for tier 3 is coerced down to the
 *      tier-2 ceiling at the source rather than trusting UI state.
 *
 * @param {number} tier - campaign tier (1-3), defaults to 1; invalid values clamp to 1
 * @returns {Array<{id: string, name: string, rarity: string, icon: string, type: string}>}
 */
export const getCustomQuestItems = (tier = 1) => {
    const requestedTier = Math.max(1, Number(tier) || 1);
    const effectiveTier = requestedTier >= 3 && !hasTier('member') ? 2 : requestedTier;
    const maxRank = maxRarityRankForTier(effectiveTier);
    return SEARCHABLE_ITEMS.filter((item) =>
        !CUSTOM_QUEST_EXCLUDED_ITEMS.includes(item.id) &&
        (RARITY_RANK[item.rarity] ?? RARITY_RANK.common) <= maxRank
    );
};

// ============================================================
// POI TYPES
// Points of interest for location milestones (placed on world map).
// ============================================================
export const POI_TYPES = [
    { id: 'ruins', name: 'Ancient Ruins', icon: '🏛️', terrain: 'any' },
    { id: 'cave', name: 'Dark Cave', icon: '🕳️', terrain: 'mountain' },
    { id: 'fortress', name: 'Fortress', icon: '🏰', terrain: 'mountain' },
    { id: 'shrine', name: 'Hidden Shrine', icon: '⛩️', terrain: 'any' },
    { id: 'grove', name: 'Sacred Grove', icon: '🌳', terrain: 'forest' },
    { id: 'tower', name: 'Abandoned Tower', icon: '🗼', terrain: 'any' },
    { id: 'tomb', name: 'Ancient Tomb', icon: '⚰️', terrain: 'any' },
    { id: 'mine', name: 'Abandoned Mine', icon: '⛏️', terrain: 'mountain' },
    { id: 'camp', name: 'Hidden Camp', icon: '🏕️', terrain: 'forest' },
    { id: 'lake', name: 'Cursed Lake', icon: '🌊', terrain: 'any' },
];

// ============================================================
// THEME NAMES
// Theme-appropriate name pools for towns and mountains.
// Used by the Custom tab to auto-populate customNames.
// ============================================================
export const THEME_NAMES = {
    'heroic-fantasy': {
        towns: ['Willowdale', 'Brightholm', 'Kingsreach', 'Sunhaven', 'Goldcrest', 'Thornwall', 'Riverbend', 'Stormgate'],
        mountains: ['The Dragon Peaks', 'The Silver Mountains', 'The Titan Range', 'The Crown Heights'],
    },
    'grimdark-survival': {
        towns: ['Ashford', 'Bleakhaven', 'Rotmere', 'Gallowsend', 'Dusthollow', 'Cinderfall', 'Blackmire', 'Dreadwick'],
        mountains: ['The Blighted Crags', 'The Bone Ridges', 'The Ashen Peaks', 'The Iron Wastes'],
    },
    'arcane-renaissance': {
        towns: ['Luxara', 'Gearhaven', 'Crystalport', 'Artifice', 'Runespire', 'Aetherton', 'Cogsworth', 'Luminos'],
        mountains: ['The Leyline Spires', 'The Crystal Range', 'The Arcane Peaks', 'The Copper Heights'],
    },
    'eldritch-horror': {
        towns: ['Ravenmoor', 'Innsport', 'Saltmarrow', 'Gloomhaven', 'Misthollow', 'Wychford', 'Deepwater', 'Fogmere'],
        mountains: ['The Whispering Peaks', 'The Sunken Range', 'The Nameless Crags', 'The Hollow Mountains'],
    },
};

// ============================================================
// THEME DEFAULTS
// Default tone settings per theme. Applied when user picks a theme.
//
// NOTE: these ids are campaign GENRES (tone presets), not world-biome themes. The
// premium-gated content (sand/desert + snow world-gen) keys off the separate world-biome
// `theme` ids ('desert', 'snow') listed in PREMIUM_THEMES (src/game/entitlements.js), which
// are passed to the map generator — not these genre ids. None of the genres below are
// premium today; keep premium theme ids in entitlements.js (single source of truth) rather
// than scattering them here.
// ============================================================
export const THEME_DEFAULTS = {
    'heroic-fantasy': {
        name: 'Heroic Fantasy',
        icon: '⚔️',
        grimnessLevel: 'Noble',
        darknessLevel: 'Bright',
        magicLevel: 'High Magic',
        technologyLevel: 'Medieval',
        responseVerbosity: 'Descriptive',
    },
    'grimdark-survival': {
        name: 'Grimdark Survival',
        icon: '💀',
        grimnessLevel: 'Grim',
        darknessLevel: 'Dark',
        magicLevel: 'Low Magic',
        technologyLevel: 'Medieval',
        responseVerbosity: 'Concise',
    },
    'arcane-renaissance': {
        name: 'Arcane Renaissance',
        icon: '🔮',
        grimnessLevel: 'Neutral',
        darknessLevel: 'Grey',
        magicLevel: 'Arcane Tech',
        technologyLevel: 'Renaissance',
        responseVerbosity: 'Moderate',
    },
    'eldritch-horror': {
        name: 'Eldritch Horror',
        icon: '🐙',
        grimnessLevel: 'Bleak',
        darknessLevel: 'Dark',
        magicLevel: 'High Magic',
        technologyLevel: 'Medieval',
        responseVerbosity: 'Descriptive',
    },
};
