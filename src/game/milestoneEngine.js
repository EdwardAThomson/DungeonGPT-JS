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
        default:
            return false;
    }
};
