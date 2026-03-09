// Milestone Spawner
// Places milestone-required entities onto the world map and prepares
// building requirements for lazy town generation.
//
// Called after generateMapData() in NewGame.js, before resolveMilestoneCoords().

import { getSpawnRequirements } from './milestoneEngine';
import { createLogger } from '../utils/logger';

const logger = createLogger('milestone-spawner');

/**
 * Find a map tile matching a location name (town or mountain).
 * Returns { x, y } or null.
 */
const findLocationOnMap = (mapData, locationName) => {
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

        // Building type doesn't exist — find a house to swap
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
