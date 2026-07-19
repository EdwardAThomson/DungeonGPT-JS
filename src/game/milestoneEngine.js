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
 * Migrate legacy `type: 'narrative'` milestones to an engine-completable type, keyed off
 * their authored `spawn`. Narrative milestones were completed by an AI judgment marker, which
 * is being retired (#76: the engine referees, the LLM only narrates). Without a marker path a
 * narrative milestone can never complete — and since campaign completion needs EVERY milestone
 * done, it would strand the whole campaign. Every narrative milestone in the wild carries a
 * spawn (npc/poi/item — built-in campaigns were converted to `talk` during NPC grounding; the
 * custom-game builder's "Speak with X" slot spawns an npc), so the spawn tells us the real
 * mechanical type:
 *   - spawn npc  -> talk     (trigger.npc  = spawn.id; completes via the Talk button)
 *   - spawn poi  -> location (trigger.location = spawn.id)
 *   - spawn item -> item     (trigger.item = spawn.id)
 * A narrative milestone with no convertible spawn (not observed in practice) is left as-is and
 * logged, so it fails visibly rather than silently corrupting a save. Idempotent: only touches
 * `type === 'narrative'`; returns the SAME array reference when nothing changed (cheap load skip).
 *
 * @param {Array} milestones
 * @returns {Array} migrated milestones (same ref if unchanged)
 */
const SPAWN_TYPE_TO_MILESTONE = { npc: 'talk', poi: 'location', item: 'item' };
const TRIGGER_FIELD_FOR_TYPE = { talk: 'npc', location: 'location', item: 'item' };
export const migrateNarrativeMilestones = (milestones) => {
    if (!Array.isArray(milestones) || milestones.length === 0) return milestones;
    let changed = false;
    const migrated = milestones.map((m) => {
        if (!m || m.type !== 'narrative') return m;
        const spawnType = m.spawn && m.spawn.type;
        const newType = SPAWN_TYPE_TO_MILESTONE[spawnType];
        // No convertible spawn (not observed in practice): leave it as-is rather than
        // guessing a trigger. It keeps its `narrative` type and simply won't auto-complete.
        if (!newType || !m.spawn.id) return m;
        changed = true;
        const field = TRIGGER_FIELD_FOR_TYPE[newType];
        return { ...m, type: newType, trigger: { ...(m.trigger || {}), [field]: m.spawn.id } };
    });
    return changed ? migrated : milestones;
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
 * Should a building's quest-item search affordance render for this stamped item id?
 *
 * Buildings keep their `questItemId` stamped in the cached town map forever, and
 * with in-save continuation a save can outlive the campaign that stamped it. The
 * search is offered ONLY while the stamp matches an item milestone in the CURRENT
 * campaign that is not yet completed:
 *   - matches a current, uncompleted item milestone -> searchable
 *   - matches a current, completed milestone        -> claimed, hidden
 *   - matches nothing current (a completed previous campaign's stamp) -> stale
 *     history, hidden; never resurface "Search for the Goblin Scout's Map" in
 *     Chapter 2.
 *
 * @param {Array} milestones - CURRENT campaign milestones (settings.milestones)
 * @param {string} itemId - the building's stamped questItemId
 * @returns {boolean}
 */
export const isQuestItemSearchable = (milestones, itemId) => {
    if (!Array.isArray(milestones) || !itemId) return false;
    return milestones.some(m =>
        !m.completed &&
        (m.trigger?.item === itemId || (m.spawn?.type === 'item' && m.spawn?.id === itemId))
    );
};

/**
 * Which milestone POIs should the world map show?
 *
 * Two rules:
 *  1. CURRENT campaign POIs stay hidden until their milestone's prerequisites are
 *     met (the classic reveal: you find the hideout only after tracking it).
 *  2. POIs stamped on the map that the CURRENT milestones do not reference are
 *     history from a completed previous campaign (in-save continuation): they are
 *     permanently visible landmarks in a persistent world and must never vanish.
 *
 * Returns null when nothing needs filtering (no current POI milestones and no
 * stamped history); callers treat null as "show everything".
 *
 * @param {Array} milestones - CURRENT campaign milestones
 * @param {Array} worldMap - the live world map (for stamped-history detection)
 * @returns {Set<string>|null} visible poi ids, or null for no filtering
 */
export const computeVisibleMilestonePois = (milestones, worldMap) => {
    const ms = Array.isArray(milestones) ? milestones : [];
    const currentPoiMilestones = ms.filter(m => m.spawn?.type === 'poi');
    if (currentPoiMilestones.length === 0) return null; // nothing to gate: show all

    const visible = new Set();
    for (const m of currentPoiMilestones) {
        if (m.completed || areRequirementsMet(m, ms)) visible.add(m.spawn.id);
    }

    // Preserve history: any milestone POI already stamped on the map whose id the
    // current campaign doesn't reference belongs to a completed prior chapter.
    const referenced = new Set(currentPoiMilestones.map(m => m.spawn.id));
    if (Array.isArray(worldMap)) {
        for (const row of worldMap) {
            for (const tile of row || []) {
                if (tile?.milestonePoi && tile.poi && !referenced.has(tile.poi)) {
                    visible.add(tile.poi);
                }
            }
        }
    }

    return visible;
};

/**
 * Which milestone POIs should still GLOW (the "go here next" findability highlight).
 *
 * Distinct from computeVisibleMilestonePois: a POI stays visible on the map forever
 * once revealed (completed objectives and prior-chapter landmarks remain drawn), but
 * it should only glow while its objective is ACTIVE, i.e. revealed (prerequisites met)
 * and not yet completed. A finished objective (e.g. a cleared goblin hideout) keeps
 * its sprite but drops the glow, and prior-chapter POIs never glow.
 *
 * Returns a Set (possibly empty) of glowing poi ids. Callers treat an absent/undefined
 * value as "no glow".
 *
 * @param {Array} milestones - CURRENT campaign milestones
 * @returns {Set<string>} poi ids that should glow
 */
export const computeActiveMilestonePois = (milestones) => {
    const ms = Array.isArray(milestones) ? milestones : [];
    const active = new Set();
    for (const m of ms) {
        if (m.spawn?.type === 'poi' && !m.completed && areRequirementsMet(m, ms)) {
            active.add(m.spawn.id);
        }
    }
    return active;
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
 * Find the location milestone the party can SEARCH on a world tile, if any.
 *
 * Location milestones spawn a POI (`spawn.type === 'poi'`, `trigger.location` = the
 * poi id, stamped on the tile as `tile.poi`). Reaching the tile no longer completes
 * the milestone on its own; instead the arrival modal offers a "Search this location"
 * action that fires the `location_visited` event. This resolver decides whether that
 * action should appear: an active location milestone (not completed, prerequisites
 * met) whose `trigger.location` matches the tile's poi id (or, defensively, a
 * town-name-derived id, mirroring the movement handler's locationId derivation).
 *
 * The level gate (`minLevel`) is intentionally NOT applied here: the button still
 * shows so the player can try; the engine returns `level_blocked` on the click and the
 * handler surfaces a "not yet seasoned enough" line, matching the boss-fight behaviour.
 *
 * @param {Array} milestones - All campaign milestones
 * @param {Object} tile - The world tile the party arrived at
 * @returns {Object|null} { locationId, name, milestoneId } or null
 */
export const getMilestoneLocationForTile = (milestones, tile) => {
    if (!Array.isArray(milestones) || !tile) return null;
    const locationId = tile.poi
        || (tile.townName ? String(tile.townName).toLowerCase().replace(/\s+/g, '_') : null);
    if (!locationId) return null;

    const m = milestones.find(m =>
        m.type === 'location' && !m.completed && m.trigger?.location === locationId &&
        areRequirementsMet(m, milestones)
    );
    if (!m) return null;
    return { locationId: m.trigger.location, name: m.spawn?.name || m.location || m.trigger.location, milestoneId: m.id };
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
                    // Force multiRound so the boss resolves as a real multi-round fight whose
                    // 'victory' outcome fires enemy_defeated. A single-round authored encounter
                    // reports only outcomeTier (never result.outcome === 'victory'), so
                    // isEncounterVictory stays false and the milestone silently never completes
                    // (audit 2026-07-18). MS-08 guards against authoring one, this heals it.
                    encounter: { ...combat.encounter, milestoneId: combat.id, isMilestoneBoss: true, multiRound: true }
                };
            }
        }
    }

    return null;
};

/**
 * Shared fuzzy text comparison for AI [COMPLETE_MILESTONE: <text>] markers.
 *
 * Both the narrative marker path (findMarkerMilestoneIndex) and the talk marker path
 * (resolveTalkMarkerMilestone) MUST use identical matching so their behaviour cannot
 * drift. The rule is a lowercased, either-contains test: the marker text contains the
 * milestone text, or the milestone text contains the marker text.
 *
 * @param {string} milestoneText - The milestone's authored text
 * @param {string} needle - The already-lowercased, trimmed marker text
 * @returns {boolean}
 */
const markerTextMatches = (milestoneText, needle) => {
    const text = (milestoneText || '').toLowerCase();
    if (!text || !needle) return false;
    return text.includes(needle) || needle.includes(text);
};

/**
 * Normalize a marker's captured text to the lowercased, trimmed needle used for
 * matching. Returns '' for empty/blank input so callers can bail out.
 *
 * @param {string} markerText
 * @returns {string}
 */
const toMarkerNeedle = (markerText) => {
    if (!markerText) return '';
    return String(markerText).toLowerCase().trim();
};

/**
 * Find the milestone an AI [COMPLETE_MILESTONE: <text>] marker refers to.
 *
 * Fuzzy text match (either string contains the other), restricted to milestones the
 * AI is allowed to complete: `type: 'narrative'`, or legacy untyped milestones (old
 * saves stored milestones as bare strings, normalized without a type). Mechanical
 * types (item / combat / location / talk) are engine-detected and must never be
 * completed by a stray marker. A locked narrative milestone (prerequisites unmet)
 * whose text leaks into the prompt is also rejected.
 *
 * @param {Array} milestones - Normalized milestone objects ({ text, type?, completed? })
 * @param {string} markerText - The text captured from the marker
 * @returns {number} Index into `milestones`, or -1 if no eligible match
 */
export const findMarkerMilestoneIndex = (milestones, markerText) => {
    if (!Array.isArray(milestones) || !markerText) return -1;
    const needle = toMarkerNeedle(markerText);
    if (!needle) return -1;
    return milestones.findIndex(m => {
        if (!m || m.completed) return false;
        if (m.type && m.type !== 'narrative') return false;
        if (!areRequirementsMet(m, milestones)) return false;
        return markerTextMatches(m.text, needle);
    });
};

/**
 * Resolve the single talk milestone an AI [COMPLETE_MILESTONE: <text>] marker should
 * complete during free-text play (the "dual completion" path for talk milestones).
 *
 * This is the anti-flakiness core: it is deliberately strict and fails closed. A talk
 * milestone qualifies ONLY if ALL of the following hold:
 *   - it is not completed and has `type: 'talk'`
 *   - its prerequisites are met (never a locked/future objective)
 *   - the marker text fuzzy-matches its text using the SAME either-contains test that
 *     findMarkerMilestoneIndex uses (shared markerTextMatches helper)
 *   - its NPC is actually present in the current scene: presentNpcIds includes
 *     `trigger.npc` (presentNpcIds = the milestoneNpcIds of NPCs placed in the town)
 *
 * The milestone is returned ONLY when EXACTLY ONE candidate qualifies. Zero or more
 * than one qualifying candidate returns null (ambiguity => no completion). Actual
 * completion + rewards are still routed through the engine's npc_talked event; this
 * function only decides which (if any) talk milestone the marker legitimately targets.
 *
 * @param {Array} milestones - All campaign milestones (normalized objects)
 * @param {string} markerText - The text captured from the [COMPLETE_MILESTONE] marker
 * @param {Array<string>} presentNpcIds - milestoneNpcIds of NPCs present in the scene
 * @returns {Object|null} The single qualifying talk milestone, or null (fail closed)
 */
export const resolveTalkMarkerMilestone = (milestones, markerText, presentNpcIds) => {
    if (!Array.isArray(milestones)) return null;
    const needle = toMarkerNeedle(markerText);
    if (!needle) return null;
    const present = Array.isArray(presentNpcIds) ? presentNpcIds : [];
    if (present.length === 0) return null;

    const candidates = milestones.filter(m =>
        m &&
        !m.completed &&
        m.type === 'talk' &&
        areRequirementsMet(m, milestones) &&
        markerTextMatches(m.text, needle) &&
        present.includes(m.trigger?.npc)
    );

    // Single-candidate rule: exactly one qualifier, or nothing (fail closed).
    return candidates.length === 1 ? candidates[0] : null;
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
        isMilestoneBoss: true,
        // See getMilestoneBossForTile: a single-round boss can never report victory, so
        // the milestone would never complete. Force the multi-round fight path.
        multiRound: true
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
