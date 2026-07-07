// Milestone Spawner
// Places milestone-required entities onto the world map and prepares
// building requirements for lazy town generation.
//
// Two consumers:
//  - campaignLauncher (new game): spawnWorldMapEntities mutates the freshly
//    generated map before it is ever persisted.
//  - campaignChain (in-save continuation): spawnCampaignIntoWorld /
//    retroInjectQuestContent stamp the NEXT campaign's content ADDITIVELY onto the
//    live world map and the cached town maps (copy-on-write: the caller's
//    originals are never mutated; nothing existing is removed or regenerated).

import { getSpawnRequirements, getMilestoneNpcsForTown } from './milestoneEngine';
import { addAuthoredNpcToTown } from '../utils/npcGenerator';
import { createLogger } from '../utils/logger';

const logger = createLogger('milestone-spawner');

/**
 * Find a map tile matching a location name (town or mountain).
 * Returns { x, y } or null.
 */
export const findLocationOnMap = (mapData, locationName) => {
    if (!locationName || !mapData) return null;
    const target = locationName.toLowerCase();

    for (let y = 0; y < mapData.length; y++) {
        for (let x = 0; x < mapData[y].length; x++) {
            const tile = mapData[y][x];
            if (tile.townName && tile.townName.toLowerCase() === target) return { x, y };
            if (tile.mountainName && tile.mountainName.toLowerCase() === target) return { x, y };
        }
    }
    return null;
};

/**
 * Find a nearby tile to place a POI near a target coordinate.
 * Prefers mountain tiles in the same range (so a fortress stays in the mountains),
 * then falls back to any empty non-water, non-town tile.
 */
const findNearbyPlacement = (mapData, targetX, targetY) => {
    const directions = [
        [0, 1], [1, 0], [0, -1], [-1, 0],
        [1, 1], [-1, 1], [1, -1], [-1, -1]
    ];
    const targetTile = mapData[targetY][targetX];
    const rangeName = targetTile.mountainName;

    const getNeighbor = (dx, dy) => {
        const nx = targetX + dx;
        const ny = targetY + dy;
        if (ny < 0 || ny >= mapData.length || nx < 0 || nx >= mapData[0].length) return null;
        return { x: nx, y: ny, tile: mapData[ny][nx] };
    };

    const isPlaceable = (tile) =>
        !tile.poi && tile.biome !== 'water' && tile.biome !== 'deep_water';

    // Pass 1: Same mountain range (overwrite the mountain POI with the milestone POI)
    if (rangeName) {
        for (const [dx, dy] of directions) {
            const n = getNeighbor(dx, dy);
            if (n && n.tile.mountainName === rangeName && n.tile.poi === 'mountain') {
                return { x: n.x, y: n.y };
            }
        }
    }

    // Pass 2: Any empty non-water, non-town tile
    let fallback = null;
    for (const [dx, dy] of directions) {
        const n = getNeighbor(dx, dy);
        if (n && isPlaceable(n.tile)) {
            fallback = { x: n.x, y: n.y };
            break;
        }
    }
    return fallback;
};

/**
 * Which milestone-required location names are missing from a world map?
 *
 * Collects every location a campaign's milestones anchor content to (the milestone's
 * own `location`, its quest building's `location`, and its spawn's `location`) and
 * returns the names findLocationOnMap cannot resolve on `mapData`. An empty result
 * means the map can host the campaign.
 *
 * Used by launchCampaign as a guard on PROVIDED maps (New Game's preview): a preview
 * generated under different customNames (playtest 2026-07-07: a pre-template preview
 * had no Hearthmere, so "The Hearthmere Trading Post" never existed anywhere) must be
 * discarded and regenerated, mirroring campaignChain's isTemplateCompatibleWithWorld
 * check on the continuation path.
 *
 * @param {Array} mapData - 2D world map array
 * @param {Array} milestones - campaign milestones
 * @returns {Array<string>} missing location names (empty when the map is compatible)
 */
export const findMissingMilestoneLocations = (mapData, milestones) => {
    const names = new Set();
    for (const m of milestones || []) {
        if (m.location) names.add(m.location);
        if (m.building?.location) names.add(m.building.location);
        if (m.spawn?.location) names.add(m.spawn.location);
    }
    return [...names].filter((name) => !findLocationOnMap(mapData, name));
};

/**
 * Process milestone spawn requirements and modify the world map.
 *
 * - Adds milestone POIs to world map tiles (e.g., shadow_fortress)
 * - Collects required buildings per town for lazy injection
 * - Collects enemy/item spawn metadata
 *
 * @param {Array} mapData - 2D world map array from generateMapData()
 * @param {Array} milestones - Milestones with spawn/building configs
 * @returns {Object} { requiredBuildings, spawnedPois, enemySpawns, itemSpawns }
 */
export const spawnWorldMapEntities = (mapData, milestones) => {
    if (!mapData || !milestones || milestones.length === 0) {
        return { requiredBuildings: {}, spawnedPois: [], enemySpawns: [], itemSpawns: [] };
    }

    const spawns = getSpawnRequirements(milestones);
    const spawnedPois = [];
    const enemySpawns = [];
    const itemSpawns = [];

    // 1. Place POIs on the world map
    for (const poi of spawns.pois) {
        const target = findLocationOnMap(mapData, poi.location);
        if (!target) {
            logger.warn(`[SPAWN] Could not find location "${poi.location}" for POI "${poi.id}"`);
            continue;
        }

        // Try to place on the target tile if it has no POI, otherwise find adjacent
        const tile = mapData[target.y][target.x];
        let placedAt = null;

        if (!tile.poi) {
            // Target tile is free — place directly
            tile.poi = poi.id;
            tile.poiName = poi.name;
            tile.milestonePoi = true;
            placedAt = target;
        } else {
            // Target tile occupied (e.g., it's a mountain) — find adjacent
            const adj = findNearbyPlacement(mapData, target.x, target.y);
            if (adj) {
                const adjTile = mapData[adj.y][adj.x];
                adjTile.poi = poi.id;
                adjTile.poiName = poi.name;
                adjTile.milestonePoi = true;
                placedAt = adj;
            } else {
                logger.warn(`[SPAWN] No space near "${poi.location}" for POI "${poi.id}"`);
            }
        }

        if (placedAt) {
            spawnedPois.push({ id: poi.id, name: poi.name, ...placedAt });
            logger.info(`[SPAWN] Placed POI "${poi.name}" at (${placedAt.x}, ${placedAt.y})`);
        }
    }

    // 2. Collect required buildings per town (for lazy town generation)
    const requiredBuildings = {};
    for (const building of spawns.buildings) {
        const townName = building.location;
        if (!townName) continue;
        // Validate the target town exists on the map. If it doesn't, the building
        // requirement would never be consumed (the town is never entered), so the
        // quest building silently never appears — warn loudly instead.
        if (!findLocationOnMap(mapData, townName)) {
            logger.warn(`[SPAWN] Quest building "${building.name}" targets town "${townName}", which is not on the map — it will not appear.`);
        }
        if (!requiredBuildings[townName]) requiredBuildings[townName] = [];

        // Find associated quest item for this milestone's building
        const associatedItem = spawns.items.find(i => i.milestoneId === building.milestoneId);

        requiredBuildings[townName].push({
            type: building.type,
            name: building.name,
            milestoneId: building.milestoneId,
            questItem: associatedItem ? { id: associatedItem.id, name: associatedItem.name } : null
        });
    }

    // 3. Collect enemy spawn metadata (for encounter overrides)
    for (const enemy of spawns.enemies) {
        const target = findLocationOnMap(mapData, enemy.location);
        enemySpawns.push({
            id: enemy.id,
            name: enemy.name,
            location: enemy.location,
            milestoneId: enemy.milestoneId,
            mapX: target?.x ?? null,
            mapY: target?.y ?? null
        });
        if (target) {
            // Mark the tile as having a milestone enemy
            const tile = mapData[target.y][target.x];
            tile.milestoneEnemy = enemy.id;
            tile.milestoneEnemyName = enemy.name;
        }
    }

    // 4. Collect item spawn metadata
    for (const item of spawns.items) {
        const target = findLocationOnMap(mapData, item.location);
        itemSpawns.push({
            id: item.id,
            name: item.name,
            location: item.location,
            milestoneId: item.milestoneId,
            mapX: target?.x ?? null,
            mapY: target?.y ?? null
        });
    }

    if (spawnedPois.length > 0) logger.info(`[SPAWN] Placed ${spawnedPois.length} POIs on world map`);
    if (Object.keys(requiredBuildings).length > 0) logger.info(`[SPAWN] ${Object.keys(requiredBuildings).length} towns need quest buildings`);
    if (enemySpawns.length > 0) logger.info(`[SPAWN] ${enemySpawns.length} enemies registered for encounters`);
    if (itemSpawns.length > 0) logger.info(`[SPAWN] ${itemSpawns.length} items registered for discovery`);

    return { requiredBuildings, spawnedPois, enemySpawns, itemSpawns };
};

/**
 * Inject required buildings into a freshly generated town map.
 * Called from useGameMap.js after generateTownMap().
 *
 * Finds buildings of the required type already in the town, or swaps
 * a house for the quest building if the type doesn't exist.
 *
 * @param {Object} townMapData - Town map from generateTownMap()
 * @param {Array} requiredBuildings - Buildings needed for this town
 * @returns {Object} Modified townMapData (mutated in place)
 */
export const injectQuestBuildings = (townMapData, requiredBuildings) => {
    if (!townMapData || !requiredBuildings || requiredBuildings.length === 0) {
        return townMapData;
    }

    const mapData = townMapData.mapData;

    for (const req of requiredBuildings) {
        // Check if a building of this type already exists
        let existingBuilding = null;
        for (let y = 0; y < mapData.length; y++) {
            for (let x = 0; x < mapData[y].length; x++) {
                const tile = mapData[y][x];
                if (tile.type === 'building' && tile.buildingType === req.type) {
                    existingBuilding = { x, y, tile };
                    break;
                }
            }
            if (existingBuilding) break;
        }

        if (existingBuilding) {
            // Building type exists — just update the name if we have a quest-specific one
            if (req.name) {
                existingBuilding.tile.buildingName = req.name;
                existingBuilding.tile.questBuilding = true;
            }
            if (req.questItem) {
                existingBuilding.tile.questItemId = req.questItem.id;
                existingBuilding.tile.questItemName = req.questItem.name;
            }
            logger.debug(`[SPAWN] Quest building "${req.name}" already exists as ${req.type} in town`);
            continue;
        }

        // Building type doesn't exist. Maintainer decision (2026-07-04): do NOT
        // convert houses (people live there; the Elder's house was systematically
        // the one converted). Place a NEW building on a free grass tile instead,
        // preferring a spot adjacent to the built-up area so the venue sits in
        // town rather than in a field.
        const stampQuestBuilding = (tile) => {
            tile.type = 'building';
            tile.buildingType = req.type;
            tile.buildingName = req.name || req.type;
            tile.questBuilding = true;
            tile.walkable = false;
            tile.poi = null;
            if (req.questItem) {
                tile.questItemId = req.questItem.id;
                tile.questItemName = req.questItem.name;
            }
        };
        let spot = null;
        let fallbackSpot = null;
        for (let y = 1; y < mapData.length - 1 && !spot; y++) {
            for (let x = 1; x < mapData[y].length - 1 && !spot; x++) {
                const tile = mapData[y][x];
                if (tile.type !== 'grass' || tile.poi) continue;
                if (!fallbackSpot) fallbackSpot = tile;
                const nearBuilding = [[0, -1], [0, 1], [-1, 0], [1, 0]].some(([dx, dy]) => {
                    const n = mapData[y + dy] && mapData[y + dy][x + dx];
                    return n && n.type === 'building';
                });
                if (nearBuilding) spot = tile;
            }
        }
        spot = spot || fallbackSpot;
        if (spot) {
            stampQuestBuilding(spot);
            logger.info(`[SPAWN] Placed NEW quest building "${req.name}" (${req.type}) on free ground`);
            continue;
        }

        // Last resort only (no free ground at all): swap a house. The retro path
        // rehomes the displaced residents (rehomeDisplacedNpcs).
        let houseToSwap = null;
        for (let y = 0; y < mapData.length; y++) {
            for (let x = 0; x < mapData[y].length; x++) {
                const tile = mapData[y][x];
                if (tile.type === 'building' && tile.buildingType === 'house') {
                    houseToSwap = { x, y, tile };
                    break;
                }
            }
            if (houseToSwap) break;
        }

        if (houseToSwap) {
            houseToSwap.tile.buildingType = req.type;
            houseToSwap.tile.buildingName = req.name || req.type;
            houseToSwap.tile.questBuilding = true;
            if (req.questItem) {
                houseToSwap.tile.questItemId = req.questItem.id;
                houseToSwap.tile.questItemName = req.questItem.name;
            }
            logger.info(`[SPAWN] Swapped house for quest building "${req.name}" (${req.type}) at (${houseToSwap.x}, ${houseToSwap.y})`);
        } else {
            logger.warn(`[SPAWN] No house available to swap for quest building "${req.name}" (${req.type})`);
        }
    }

    return townMapData;
};

// --- In-save continuation (same-world sequels) --------------------------------

/**
 * Spawn the NEXT campaign's entities onto an EXISTING world map, copy-on-write.
 *
 * The live map is deep-copied and spawnWorldMapEntities runs against the copy, so
 * the caller can hand the result to setWorldMap while the original state object
 * stays untouched (React state discipline + the never-mutate-a-loaded-map rule).
 * Everything already on the map survives; occupied target tiles fall back to the
 * existing adjacent-placement logic and misses are logged, never fatal.
 *
 * @param {Array} worldMap - the live (persisted) world map
 * @param {Array} milestones - the NEW campaign's milestones
 * @returns {{ mapData, spawnResult }} mapData is the new map copy
 */
export const spawnCampaignIntoWorld = (worldMap, milestones) => {
    const mapData = JSON.parse(JSON.stringify(worldMap));
    const spawnResult = spawnWorldMapEntities(mapData, milestones);
    return { mapData, spawnResult };
};

/**
 * Retro-inject the NEXT campaign's quest buildings and milestone NPCs into towns
 * that are ALREADY CACHED in the save (a targeted additive mutation, never a
 * regeneration; see QUEST_CHAINING_PLAN). Towns not yet cached need nothing here:
 * the lazy first-visit path reads the updated settings (requiredBuildings +
 * milestones) and injects at generation time as usual.
 *
 * Copy-on-write: returns a NEW cache object; only towns that actually receive a
 * building or NPC are cloned, every other town keeps its exact stored object.
 *
 * NPC rule (shared-building conflict): if the target building already houses an
 * NPC from a PRIOR campaign (any milestoneNpcId not in the new campaign), the new
 * authored NPC REPLACES it (narratively the same contact promoted into the new
 * chapter, e.g. Captain Ulric becoming Marshal Ulric), so shared venues never
 * accumulate duplicate quest-givers.
 *
 * @param {Object} args
 * @param {Object} args.townMapsCache - the save's cached town maps (name-keyed)
 * @param {Object} args.requiredBuildings - new campaign's per-town building reqs
 * @param {Array} args.milestones - the NEW campaign's milestones
 * @param {number|string} args.worldSeed - save's world seed (deterministic NPCs)
 * @returns {Object} new townMapsCache
 */
// Move cached NPCs out of a house that a retro quest-injection just converted
// into a quest venue. Cached towns never re-run populateTown, so without this
// the old residents would be listed inside the new building forever. Milestone
// NPCs are left alone (their venue IS their home).
const rehomeDisplacedNpcs = (townClone, convertedCoords) => {
    const convertedSet = new Set(convertedCoords);
    const npcs = townClone.npcs || [];
    const mapData = townClone.mapData || [];
    const houses = [];
    mapData.forEach((row, y) => row.forEach((tile, x) => {
        if (tile.type === 'building' && tile.buildingType === 'house') houses.push({ x, y, tile });
    }));
    if (houses.length === 0) return;
    let next = 0;
    for (const npc of npcs) {
        if (npc.milestoneNpcId || !npc.location) continue;
        const home = npc.location.homeCoords;
        const homeKey = home ? `${home.x},${home.y}` : null;
        const workKey = `${npc.location.x},${npc.location.y}`;
        if (!convertedSet.has(homeKey) && !convertedSet.has(workKey)) continue;
        const dest = houses[next++ % houses.length];
        if (convertedSet.has(homeKey)) npc.location.homeCoords = { x: dest.x, y: dest.y };
        if (convertedSet.has(workKey)) {
            npc.location.x = dest.x;
            npc.location.y = dest.y;
            npc.location.buildingName = dest.tile.buildingName || npc.location.buildingName;
            npc.location.buildingType = 'house';
        }
    }
};

export const retroInjectQuestContent = ({ townMapsCache, requiredBuildings, milestones, worldSeed }) => {
    const cache = { ...(townMapsCache || {}) };
    const reqs = requiredBuildings || {};

    for (const townName of Object.keys(cache)) {
        const buildings = reqs[townName] || [];
        const npcs = getMilestoneNpcsForTown(milestones || [], townName);
        if (buildings.length === 0 && npcs.length === 0) continue;

        const townClone = JSON.parse(JSON.stringify(cache[townName]));

        if (buildings.length > 0) {
            // injectQuestBuildings may SWAP a house into the quest venue. At initial
            // generation that's invisible (populateTown runs afterwards), but cached
            // towns carry their NPC roster forever, so anyone homed in the swapped
            // house (the family, often the village Elder, who lives in the FIRST
            // house in scan order, exactly the house the swap picks) would haunt
            // the new venue: "Leader of Millhaven" standing in the archives.
            // Snapshot house tiles, inject, then rehome the displaced.
            const houseCoords = new Set();
            (townClone.mapData || []).forEach((row, y) => row.forEach((tile, x) => {
                if (tile.type === 'building' && tile.buildingType === 'house') houseCoords.add(`${x},${y}`);
            }));
            injectQuestBuildings(townClone, buildings);
            const converted = [...houseCoords].filter((k) => {
                const [x, y] = k.split(',').map(Number);
                return townClone.mapData[y][x].buildingType !== 'house';
            });
            if (converted.length > 0) rehomeDisplacedNpcs(townClone, converted);
            logger.info(`[RETRO] Injected ${buildings.length} quest building(s) into cached town "${townName}"`);
        }

        for (const spec of npcs) {
            // Skip if this exact authored NPC is already in the roster (idempotence).
            if ((townClone.npcs || []).some((n) => n.milestoneNpcId === spec.id)) continue;
            const seed = (parseInt(worldSeed) || 1) + (spec.milestoneId || 0) * 977 + String(townName).length * 31;
            const placed = addAuthoredNpcToTown(townClone, spec, seed);
            if (placed) {
                logger.info(`[RETRO] Placed milestone NPC "${spec.name}" in cached town "${townName}"`);
            } else {
                logger.warn(`[RETRO] Could not place milestone NPC "${spec.name}" in cached town "${townName}" (no matching building)`);
            }
        }

        cache[townName] = townClone;
    }

    return cache;
};
