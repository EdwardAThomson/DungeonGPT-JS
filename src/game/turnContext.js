// Turn-context serialisers: the pure builders that turn game state into the prompt text
// for a free-text player turn (milestones, side quests, location + NPCs). Extracted from
// useGameInteraction.js so the hook, scripts/quest-harness.mjs and the typed-decision eval
// (docs/TYPED_DECISION_EVAL_PLAN.md) share one serialiser and cannot drift apart.
import { areRequirementsMet } from './milestoneEngine';
import { getStepHint } from './questHints';

// Helper function to normalize milestones (backward compatibility)
export const normalizeMilestones = (milestones) => {
    if (!milestones || milestones.length === 0) return [];

    // Check if already in new format (array of objects)
    if (typeof milestones[0] === 'object' && milestones[0].hasOwnProperty('text')) {
        return milestones;
    }

    // Old format (array of strings) - convert to new format
    return milestones.map((text, index) => ({
        id: index + 1,
        text,
        completed: false,
        location: null
    }));
};

// Helper function to get milestone status for prompts
export const getMilestoneStatus = (milestones) => {
    const normalized = normalizeMilestones(milestones);
    const completed = normalized.filter(m => m.completed);
    const remaining = normalized.filter(m => !m.completed);
    const active = remaining.filter(m => areRequirementsMet(m, normalized));
    const locked = remaining.filter(m => !areRequirementsMet(m, normalized));
    const current = active[0] || null;

    return { current, completed, remaining, active, locked, all: normalized };
};

// Format milestone status as prompt text with type and state info
export const formatMilestonePromptText = (milestoneStatus) => {
    const { completed, active, locked } = milestoneStatus;
    if (completed.length === 0 && active.length === 0 && locked.length === 0) return '';

    let text = '';
    if (active.length > 0) {
        text += '\nActive Milestones: ' + active.map((m, i) => {
            const typeTag = m.type ? ` [${m.type}]` : '';
            const levelTag = m.minLevel ? ` (Lv.${m.minLevel}+)` : '';
            let line = `${m.text}${typeTag}${levelTag}`;
            // Ground authored NPC objectives: name the canonical figure + venue so the
            // model reuses them instead of inventing a name ("Jorik", "the mayor").
            if (m.spawn?.type === 'npc' && m.spawn.name) {
                const who = m.spawn.role ? `${m.spawn.name} (${m.spawn.role})` : m.spawn.name;
                const where = m.building?.name || m.spawn.location;
                line += ` — speak with ${who}${where ? ` at ${where}` : ''}`;
                if (m.spawn.personality) line += `; ${m.spawn.personality}`;
            }
            // Talk objectives complete via the engine's Talk action (npc_talked), never by
            // the model. Cue the model to steer the party toward that conversation without
            // adjudicating it (the "outcomes are the engine's" protocol rule covers the rest).
            if (i === 0 && m.type === 'talk') {
                const who = m.spawn?.name || 'this person';
                line += ` (guide the party toward speaking with ${who}; the game completes this when they do — do not declare it done yourself)`;
            }
            return line;
        }).join('; ');
    }
    if (completed.length > 0) {
        text += '\nCompleted: ' + completed.map(m => m.text).join('; ');
    }
    if (locked.length > 0) {
        text += '\nLocked (prerequisites not met): ' + locked.map(m => m.text).join('; ');
    }
    return text;
};

// Ground ACTIVE side quests in the prompt so the DM narrates their real sources instead
// of inventing locations ("the herbalist in the next valley") for quest items. Compact:
// title + current step + the factual questHints source line, capped at a few quests.
export const formatSideQuestPromptText = (sideQuests) => {
    const active = (sideQuests || []).filter(q => q && q.status === 'active').slice(0, 3);
    if (active.length === 0) return '';
    const lines = active.map(q => {
        const step = (q.milestones || []).find(m => !m.completed);
        if (!step) return q.title;
        const hint = getStepHint(step, q);
        return `${q.title}: ${step.text}${hint ? ` [${hint}]` : ''}`;
    });
    return `\nActive Side Quests: ${lines.join('; ')}. Quest items and objectives are found exactly where these bracketed hints say; do not invent other locations, vendors, or sources for them.`;
};

// Convert tile distance to a narrative descriptor
export const describeDistance = (dist) => {
    if (dist <= 2) return 'nearby';
    if (dist <= 5) return 'not far';
    if (dist <= 10) return 'some distance away';
    return 'far away';
};

// Convert compass direction from dx/dy
export const describeDirection = (dx, dy) => {
    const ns = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
    const ew = dx > 0 ? 'east' : dx < 0 ? 'west' : '';
    return ns + ew || 'nearby';
};

// Find nearby POIs on the world map (towns, caves, etc.)
export const findNearbyLandmarks = (worldMap, px, py, maxDist = 12) => {
    if (!worldMap) return [];
    const landmarks = [];
    const height = worldMap.length;
    const width = worldMap[0]?.length || 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (x === px && y === py) continue;
            const tile = worldMap[y]?.[x];
            if (!tile?.poi) continue;

            const dist = Math.abs(x - px) + Math.abs(y - py); // Manhattan distance
            if (dist > maxDist) continue;

            const label = tile.poi === 'town' && tile.townName
                ? `${tile.townName} (${tile.townSize || 'settlement'})`
                : tile.poi === 'mountain' && tile.mountainName
                    ? tile.mountainName
                    : null;

            // Only include named landmarks (towns, named mountains) — skip generic forest/mountain tiles
            if (!label) continue;

            landmarks.push({
                label,
                dist,
                direction: describeDirection(x - px, y - py),
                proximity: describeDistance(dist)
            });
        }
    }

    // Sort by distance, take closest few
    landmarks.sort((a, b) => a.dist - b.dist);
    return landmarks.slice(0, 4);
};

// Surface the NPCs actually present in the town so the DM narrates and names the
// real placed people (e.g. Captain Marta) rather than inventing names. Token-conscious:
// the current building's occupants (with the milestone NPC's personality) plus a short
// town roster, capped. Reads townMapData.npcs written by populateTown.
export const formatTownNpcs = (townMap, pos) => {
    const npcs = townMap?.npcs;
    if (!Array.isArray(npcs) || npcs.length === 0) return '';

    const label = (n) => {
        const role = n.job || n.title || n.role || 'townsfolk';
        return `${n.name} (${role})`;
    };

    let out = '';

    // Occupants of the building the party is standing on.
    if (pos) {
        const here = npcs.filter(n => n.location?.x === pos.x && n.location?.y === pos.y);
        if (here.length > 0) {
            out += ` Present here: ${here.map(n => {
                let s = label(n);
                if (n.personality) s += ` — ${n.personality}`;
                return s;
            }).join('; ')}.`;
        }
    }

    // A short town roster, milestone NPCs first, capped to stay token-light.
    const roster = [...npcs]
        .sort((a, b) => (b.milestoneNpcId ? 1 : 0) - (a.milestoneNpcId ? 1 : 0))
        .slice(0, 6);
    if (roster.length > 0) {
        out += ` Notable townsfolk: ${roster.map(label).join('; ')}.`;
        out += ' Use these exact names for the people the party meets; do not invent names or officials for anyone listed here.';
    }

    return out;
};

// Build rich location context based on whether player is inside a town, at a town edge, or on the world map
export const buildLocationContext = (worldTile, worldPos, locationCtx, worldMap) => {
    const { isInsideTown, currentTownTile, currentTownMap, townPlayerPosition } = locationCtx;
    const biome = worldTile?.biome || 'Unknown Area';

    if (isInsideTown && currentTownTile) {
        const townName = currentTownTile.townName || 'Town';
        const townSize = currentTownTile.townSize || 'settlement';
        let info = `The party is INSIDE ${townName}, a ${townSize}.`;

        // Determine what the player is standing on within the town
        if (currentTownMap?.mapData && townPlayerPosition) {
            const townTile = currentTownMap.mapData[townPlayerPosition.y]?.[townPlayerPosition.x];
            if (townTile) {
                if (townTile.type === 'building') {
                    const name = townTile.buildingName || townTile.buildingType || 'a building';
                    info += ` They are at ${name}.`;
                } else if (townTile.type === 'town_square') {
                    info += ' They are in the town square.';
                } else if (townTile.type?.includes('path') || townTile.type === 'grass') {
                    info += ' They are walking along a street.';
                }
            }

            // List nearby buildings for richer context
            const buildings = [];
            const mapData = currentTownMap.mapData;
            const seen = new Set();
            for (let dy = -3; dy <= 3; dy++) {
                for (let dx = -3; dx <= 3; dx++) {
                    const t = mapData[townPlayerPosition.y + dy]?.[townPlayerPosition.x + dx];
                    if (t?.type === 'building') {
                        const bName = t.buildingName || t.buildingType;
                        if (bName && !seen.has(bName)) {
                            seen.add(bName);
                            buildings.push(bName);
                        }
                    }
                }
            }
            if (buildings.length > 0) {
                info += ` Nearby: ${buildings.join(', ')}.`;
            }
        }

        // Name the NPCs actually placed in this town (occupants here + short roster).
        info += formatTownNpcs(currentTownMap, townPlayerPosition);

        return info;
    }

    // On the world map
    let info = `The party is traveling through ${biome} terrain.`;

    if (worldTile?.poi === 'town' && worldTile?.townName) {
        info += ` They are standing at the edge of ${worldTile.townName}, a ${worldTile.townSize || 'settlement'}. They have not entered the town.`;
    } else if (worldTile?.poi === 'cave_entrance') {
        info += ' There is a cave entrance here.';
    } else if (worldTile?.poi) {
        info += ` Point of interest: ${worldTile.poi}.`;
    }

    // Add nearby landmarks for world map orientation
    const landmarks = findNearbyLandmarks(worldMap, worldPos.x, worldPos.y);
    if (landmarks.length > 0) {
        const parts = landmarks.map(l => `${l.label} (${l.proximity}, to the ${l.direction})`);
        info += ` Landmarks: ${parts.join('; ')}.`;
    }

    return info;
};

// Structured NPC roster for the party's current town: the same people formatTownNpcs names
// in prose, but with their persisted ids so a typed decision ("who is the player talking
// to?") can answer with an entity id instead of a free-text name. Ids are the uuids
// populateTown stamps on every NPC (stored in townMapsCache); authored milestone NPCs also
// carry milestoneNpcId/milestoneId. `here` marks occupants of the party's current tile.
// Returns [] outside a town or for a town with no NPCs.
export const buildNpcRoster = (locationCtx) => {
    const { isInsideTown, currentTownMap, townPlayerPosition } = locationCtx || {};
    const npcs = currentTownMap?.npcs;
    if (!isInsideTown || !Array.isArray(npcs)) return [];
    const pos = townPlayerPosition;
    return npcs
        .filter(n => n && n.id && n.name)
        .map(n => ({
            id: n.id,
            name: n.name,
            role: n.job || n.title || n.role || 'townsfolk',
            here: !!pos && n.location?.x === pos.x && n.location?.y === pos.y,
            ...(n.milestoneNpcId ? { milestoneNpcId: n.milestoneNpcId } : {}),
            ...(n.milestoneId != null ? { milestoneId: n.milestoneId } : {}),
        }));
};
