// Milestone Engine
// Deterministic milestone completion checks for the campaign system.
// The game engine is the judge; the AI is the narrator.
//
// See docs/CAMPAIGN_MILESTONE_SYSTEM.md for the full design.

/**
 * Check if all prerequisites for a milestone are met
 * @param {Object} milestone - The milestone to check
 * @param {Array} allMilestones - All milestones in the campaign
 * @returns {boolean}
 */
export const areRequirementsMet = (milestone, allMilestones) => {
    if (!milestone.requires || milestone.requires.length === 0) return true;
    return milestone.requires.every(reqId =>
        allMilestones.find(m => m.id === reqId)?.completed
    );
};

/**
 * Get the current state of a milestone
 * @param {Object} milestone
 * @param {Array} allMilestones
 * @returns {'completed' | 'locked' | 'active'}
 */
export const getMilestoneState = (milestone, allMilestones) => {
    if (milestone.completed) return 'completed';
    if (!areRequirementsMet(milestone, allMilestones)) return 'locked';
    return 'active';
};

/**
 * Get campaign progress summary
 * @param {Array} milestones - All milestones
 * @returns {Object} { completed, active, locked, total, isComplete, current }
 */
export const getCampaignProgress = (milestones) => {
    const completed = milestones.filter(m => m.completed);
    const active = milestones.filter(m => !m.completed && areRequirementsMet(m, milestones));
    const locked = milestones.filter(m => !m.completed && !areRequirementsMet(m, milestones));
    const current = active[0] || null;

    return {
        completed,
        active,
        locked,
        total: milestones.length,
        isComplete: completed.length === milestones.length,
        current
    };
};

/**
 * Check if a game event completes any active milestone.
 *
 * Events are objects like:
 *   { type: 'item_acquired', itemId: 'treasure_map' }
 *   { type: 'enemy_defeated', enemyId: 'shadow_overlord' }
 *   { type: 'location_visited', locationId: 'shadow_fortress' }
 *   { type: 'npc_talked', npcId: 'militia_captain' }
 *
 * @param {Array} milestones - All milestones in the campaign
 * @param {Object} event - The game event to check
 * @returns {Object|null} Result object or null if no match
 *   - { type: 'completed', milestoneId, milestone, campaignComplete }
 *   - { type: 'blocked', milestoneId, milestone, unmetRequirements }
 *   - { type: 'level_blocked', milestoneId, milestone, requiredLevel, currentLevel }
 *   - null (no match)
 */
export const checkMilestoneCompletion = (milestones, event, currentLevel = null) => {
    // First pass: check active milestones (prerequisites met)
    for (const milestone of milestones) {
        if (milestone.completed) continue;
        if (milestone.type === 'narrative') continue;
        if (!areRequirementsMet(milestone, milestones)) continue;

        if (doesEventMatchTrigger(milestone, event)) {
            // Check level gate
            if (milestone.minLevel && currentLevel !== null && currentLevel < milestone.minLevel) {
                return {
                    type: 'level_blocked',
                    milestoneId: milestone.id,
                    milestone,
                    requiredLevel: milestone.minLevel,
                    currentLevel
                };
            }

            // Milestone completed
            const updatedMilestones = milestones.map(m =>
                m.id === milestone.id ? { ...m, completed: true } : m
            );
            const campaignComplete = updatedMilestones.every(m => m.completed);

            return {
                type: 'completed',
                milestoneId: milestone.id,
                milestone,
                campaignComplete,
                updatedMilestones
            };
        }
    }

    // Second pass: check locked milestones (would match but prerequisites aren't met)
    for (const milestone of milestones) {
        if (milestone.completed) continue;
        if (milestone.type === 'narrative') continue;
        if (areRequirementsMet(milestone, milestones)) continue;

        if (doesEventMatchTrigger(milestone, event)) {
            const unmetRequirements = (milestone.requires || [])
                .filter(reqId => !milestones.find(m => m.id === reqId)?.completed)
                .map(reqId => {
                    const req = milestones.find(m => m.id === reqId);
                    return { id: reqId, text: req?.text || `Milestone #${reqId}` };
                });

            return {
                type: 'blocked',
                milestoneId: milestone.id,
                milestone,
                unmetRequirements
            };
        }
    }

    return null;
};

/**
 * Complete a narrative milestone manually (called when NPC interaction resolves)
 * @param {Array} milestones - All milestones
 * @param {number} milestoneId - ID of the narrative milestone to complete
 * @returns {Object|null} Same result format as checkMilestoneCompletion, or null if invalid
 */
export const completeNarrativeMilestone = (milestones, milestoneId) => {
    const milestone = milestones.find(m => m.id === milestoneId);
    if (!milestone || milestone.completed || milestone.type !== 'narrative') return null;
    if (!areRequirementsMet(milestone, milestones)) return null;

    const updatedMilestones = milestones.map(m =>
        m.id === milestoneId ? { ...m, completed: true } : m
    );
    const campaignComplete = updatedMilestones.every(m => m.completed);

    return {
        type: 'completed',
        milestoneId: milestone.id,
        milestone,
        campaignComplete,
        updatedMilestones
    };
};

/**
 * Has the quest item hidden in a building already been claimed? True when the
 * milestone that item belongs to is completed. Buildings keep their questItemId
 * stamped in the cached town map forever, so the search UI gates on this instead.
 * @param {Array} milestones - All campaign milestones
 * @param {string} itemId - The building's questItemId
 * @returns {boolean}
 */
export const isMilestoneItemClaimed = (milestones, itemId) => {
    if (!Array.isArray(milestones) || !itemId) return false;
    return milestones.some(m =>
        m.completed &&
        (m.trigger?.item === itemId || (m.spawn?.type === 'item' && m.spawn?.id === itemId))
    );
};

/**
 * Find the milestone item gatherable on a world tile, if any.
 *
 * Covers item milestones authored at WILDERNESS locations (building: null) — e.g.
 * "Gather healing herbs from the Grey Moors". Town-building item milestones are
 * excluded: those are collected via the building search (questItemId path). Matching
 * is by the tile's named location (mountainName / poiName / townName) against the
 * milestone's spawn location, only while the milestone is active.
 *
 * @param {Array} milestones - All campaign milestones
 * @param {Object} tile - The world tile the party arrived at
 * @returns {Object|null} { itemId, name, milestoneId } or null
 */
export const getMilestoneItemForTile = (milestones, tile) => {
    if (!Array.isArray(milestones) || !tile) return null;
    const tileNames = [tile.mountainName, tile.poiName, tile.townName]
        .filter(Boolean)
        .map((n) => String(n).toLowerCase());
    if (tileNames.length === 0) return null;

    const m = milestones.find(m =>
        m.type === 'item' && !m.completed && m.trigger?.item && !m.building &&
        m.spawn?.type === 'item' &&
        tileNames.includes(String(m.spawn.location || m.location || '').toLowerCase()) &&
        areRequirementsMet(m, milestones)
    );
    if (!m) return null;
    return { itemId: m.trigger.item, name: m.spawn.name || m.trigger.item, milestoneId: m.id };
};

/**
 * Find the milestone boss fight waiting on a world tile, if any.
 *
 * Two ways a tile hosts a boss:
 *  1. The spawner stamped the enemy directly (`tile.milestoneEnemy`, e.g. the tile
 *     findLocationOnMap resolved for the enemy's authored location).
 *  2. The tile is a spawned milestone POI (e.g. the Goblin Hideout) and an ACTIVE
 *     combat milestone is authored at the same location — the boss lairs in its POI.
 *
 * Only returns a fight while the combat milestone is active (not completed,
 * prerequisites met), so e.g. the chieftain only appears once the hideout is found.
 *
 * @param {Array} milestones - All campaign milestones
 * @param {Object} tile - The world tile the party arrived at
 * @returns {Object|null} { enemyId, name, encounter } or null
 */
export const getMilestoneBossForTile = (milestones, tile) => {
    if (!Array.isArray(milestones) || !tile) return null;

    // 1) Tile stamped with the enemy directly.
    if (tile.milestoneEnemy) {
        const encounter = getMilestoneEncounter(milestones, tile.milestoneEnemy);
        if (encounter) {
            return { enemyId: tile.milestoneEnemy, name: tile.milestoneEnemyName || encounter.name, encounter };
        }
    }

    // 2) Milestone POI tile: match an active combat milestone at the same authored location.
    if (tile.milestonePoi && tile.poi) {
        const owner = milestones.find(m => m.spawn?.type === 'poi' && m.spawn.id === tile.poi);
        const loc = owner?.spawn?.location || owner?.location;
        if (loc) {
            const combat = milestones.find(m =>
                m.type === 'combat' && !m.completed && m.trigger?.enemy && m.encounter &&
                (m.location === loc || m.spawn?.location === loc) &&
                areRequirementsMet(m, milestones)
            );
            if (combat) {
                return {
                    enemyId: combat.trigger.enemy,
                    name: combat.spawn?.name || combat.encounter.name,
                    encounter: { ...combat.encounter, milestoneId: combat.id, isMilestoneBoss: true }
                };
            }
        }
    }

    return null;
};

/**
 * Find the milestone an AI [COMPLETE_MILESTONE: <text>] marker refers to.
 *
 * Fuzzy text match (either string contains the other), restricted to milestones the
 * AI is allowed to complete: `type: 'narrative'`, or legacy untyped milestones (old
 * saves stored milestones as bare strings, normalized without a type). Mechanical
 * types (item / combat / location / talk) are engine-detected and must never be
 * completed by a stray marker.
 *
 * @param {Array} milestones - Normalized milestone objects ({ text, type?, completed? })
 * @param {string} markerText - The text captured from the marker
 * @returns {number} Index into `milestones`, or -1 if no eligible match
 */
export const findMarkerMilestoneIndex = (milestones, markerText) => {
    if (!Array.isArray(milestones) || !markerText) return -1;
    const needle = String(markerText).toLowerCase().trim();
    if (!needle) return -1;
    return milestones.findIndex(m => {
        if (!m || m.completed) return false;
        if (m.type && m.type !== 'narrative') return false;
        const text = (m.text || '').toLowerCase();
        if (!text) return false;
        return text.includes(needle) || needle.includes(text);
    });
};

/**
 * Apply milestone rewards to a hero using the same pattern as encounterController
 * @param {Object} milestone - The completed milestone
 * @returns {Object} Processed rewards { xp, gold, items }
 */
export const getMilestoneRewards = (milestone) => {
    if (!milestone.rewards) return { xp: 0, gold: 0, items: [] };
    return {
        xp: milestone.rewards.xp || 0,
        gold: milestone.rewards.gold || 0,
        items: milestone.rewards.items || []
    };
};

/**
 * Get the encounter definition for a combat milestone (to feed into resolveEncounter)
 * @param {Array} milestones - All milestones
 * @param {string} enemyId - Enemy ID from the trigger
 * @returns {Object|null} Encounter definition or null
 */
export const getMilestoneEncounter = (milestones, enemyId) => {
    const milestone = milestones.find(m =>
        m.type === 'combat' &&
        m.trigger?.enemy === enemyId &&
        !m.completed &&
        areRequirementsMet(m, milestones)
    );
    if (!milestone?.encounter) return null;
    return {
        ...milestone.encounter,
        milestoneId: milestone.id,
        isMilestoneBoss: true
    };
};

/**
 * Get all entities that need to be spawned for a campaign's milestones
 * @param {Array} milestones - All milestones
 * @returns {Object} { items, enemies, npcs, pois, buildings }
 */
export const getSpawnRequirements = (milestones) => {
    const items = [];
    const enemies = [];
    const npcs = [];
    const pois = [];
    const buildings = [];

    for (const m of milestones) {
        if (m.spawn) {
            switch (m.spawn.type) {
                case 'item': items.push({ ...m.spawn, milestoneId: m.id }); break;
                case 'enemy': enemies.push({ ...m.spawn, milestoneId: m.id }); break;
                case 'npc': npcs.push({ ...m.spawn, milestoneId: m.id }); break;
                case 'poi': pois.push({ ...m.spawn, milestoneId: m.id }); break;
            }
        }
        if (m.building) {
            buildings.push({ ...m.building, milestoneId: m.id });
        }
    }

    return { items, enemies, npcs, pois, buildings };
};

/**
 * Get the authored (canonical) NPCs a campaign wants placed in a given town.
 *
 * Reads every milestone whose `spawn.type === 'npc'` and returns those whose NPC
 * (or associated quest building) is located in `townName`. Each entry pairs the
 * spawn's identity with its building so town generation can bind the NPC to the
 * right building and the prompt/journal can name who and where.
 *
 * @param {Array} milestones - All campaign milestones (from settings.milestones)
 * @param {string} townName - The town being generated
 * @returns {Array<Object>} [{ id, name, role, personality, milestoneId, location, building }]
 *   `building` is `{ type, name }` or null.
 */
export const getMilestoneNpcsForTown = (milestones, townName) => {
    if (!Array.isArray(milestones) || !townName) return [];
    const target = String(townName).toLowerCase();
    const result = [];

    for (const m of milestones) {
        if (m.spawn?.type !== 'npc' || !m.spawn.name) continue;
        // The NPC lives where the spawn (or its quest building) says it does.
        const loc = m.spawn.location || m.building?.location;
        if (!loc || String(loc).toLowerCase() !== target) continue;

        result.push({
            id: m.spawn.id,
            name: m.spawn.name,
            role: m.spawn.role || 'Villager',
            gender: m.spawn.gender || null,
            personality: m.spawn.personality || null,
            milestoneId: m.id,
            location: loc,
            building: m.building ? { type: m.building.type, name: m.building.name } : null
        });
    }

    return result;
};

/**
 * Extract location names from milestones, categorized as town or mountain.
 * Used to inject campaign-required names into the map generator so milestone
 * locations actually appear on the generated map.
 *
 * Town milestones (item, narrative) → towns array
 * Wilderness milestones (location, combat) → mountains array
 *
 * @param {Array} milestones - All milestones
 * @returns {Object} { towns: string[], mountains: string[] }
 */
export const getMilestoneLocationNames = (milestones) => {
    const towns = [];
    const mountains = [];
    const seen = new Set();

    for (const m of milestones) {
        if (!m.location || seen.has(m.location)) continue;
        seen.add(m.location);

        if (m.type === 'location' || m.type === 'combat') {
            mountains.push(m.location);
        } else {
            towns.push(m.location);
        }
    }

    return { towns, mountains };
};

// --- Internal helpers ---

const doesEventMatchTrigger = (milestone, event) => {
    const trigger = milestone.trigger;
    if (!trigger) return false;

    switch (milestone.type) {
        case 'item':
            return event.type === 'item_acquired' && event.itemId === trigger.item;
        case 'combat':
            return event.type === 'enemy_defeated' && event.enemyId === trigger.enemy;
        case 'location':
            return event.type === 'location_visited' && event.locationId === trigger.location;
        case 'talk':
            return event.type === 'npc_talked' && event.npcId === trigger.npc;
        default:
            return false;
    }
};
