import { useState, useEffect, useRef } from 'react';
import { generateMapData, getTile, findStartingTown, enrichWorldMap } from '../utils/mapGenerator';
import { generateTownMap } from '../utils/townMapGenerator';
import { analyzeTownWater, getTownRoadEdges } from '../utils/townWater';
import { generateSiteMap } from '../utils/siteMapGenerator';
import { populateTown } from '../utils/npcGenerator';
import { injectQuestBuildings } from '../game/milestoneSpawner';
import { createLogger } from '../utils/logger';

const logger = createLogger('game-map');

const useGameMap = (loadedConversation, hasAdventureStarted, isLoading, setError, worldSeed, generatedMap = null, requiredBuildings = null, initialTownMapsCache = null, mapTheme = 'grassland') => {
    // --- State Initialization --- //

    const [mapAndPosition] = useState(() => {
        if (loadedConversation?.world_map && loadedConversation?.player_position) {
            const map = loadedConversation.world_map;

            // --- MIGRATION: patch old saves ---
            logger.debug('Checking map data compatibility');
            let coordPatch = 0;
            let biomePatch = 0;
            for (let y = 0; y < map.length; y++) {
                for (let x = 0; x < map[y].length; x++) {
                    const t = map[y][x];
                    // (a) tiles missing x/y coordinates
                    if (t.x === undefined || t.y === undefined) {
                        t.x = x;
                        t.y = y;
                        coordPatch++;
                    }
                    // (b) very old maps stored forest/mountains as a *biome*; the renderer
                    // now expects them as a POI on plains (unknown biomes fall back to plains
                    // with no terrain sprite, which would otherwise lose that art).
                    if (!t.poi && (t.biome === 'forest' || t.biome === 'mountains')) {
                        t.poi = t.biome === 'forest' ? 'forest' : 'mountain';
                        t.biome = 'plains';
                        biomePatch++;
                    }
                }
            }
            if (coordPatch > 0) logger.info(`Patched ${coordPatch} tiles with coordinates`);
            if (biomePatch > 0) logger.info(`Converted ${biomePatch} legacy forest/mountain biome tiles to POIs`);

            // Legacy upgrade: add hills/ruins/cave POIs to maps generated before they
            // existed (idempotent — no-op once present). Persists on the next autosave.
            enrichWorldMap(map, worldSeed);

            return {
                map: map,
                position: loadedConversation.player_position
            };
        }

        // Use provided map or generate new one
        // generatedMap should already have town names assigned from GameSettings
        const newMap = generatedMap || generateMapData(10, 10, worldSeed);
        const startingPos = findStartingTown(newMap);
        logger.debug('Starting town found', startingPos);

        // Mark starting position as explored
        newMap[startingPos.y][startingPos.x].isExplored = true;

        return {
            map: newMap,
            position: startingPos
        };
    });

    const [worldMap, setWorldMap] = useState(mapAndPosition.map);
    const [playerPosition, setPlayerPosition] = useState(mapAndPosition.position);

    const rawSubMaps = loadedConversation?.sub_maps || loadedConversation?.subMaps;
    const subMapsData = typeof rawSubMaps === 'string' ? JSON.parse(rawSubMaps) : rawSubMaps;

    // Multi-level map system
    const [currentMapLevel, setCurrentMapLevel] = useState(subMapsData?.currentMapLevel || 'world');
    const [currentTownMap, setCurrentTownMap] = useState(subMapsData?.currentTownMap || null);
    const [townPlayerPosition, setTownPlayerPosition] = useState(subMapsData?.townPlayerPosition || null);
    const [currentTownTile, setCurrentTownTile] = useState(subMapsData?.currentTownTile || null);
    const [isInsideTown, setIsInsideTown] = useState(subMapsData?.isInsideTown || false);
    const [townMapsCache, setTownMapsCache] = useState(subMapsData?.townMapsCache || initialTownMapsCache || {});

    // Wilderness site sub-maps (caves / ruins) — parallel to the town sub-map system.
    const [currentSiteMap, setCurrentSiteMap] = useState(subMapsData?.currentSiteMap || null);
    const [sitePlayerPosition, setSitePlayerPosition] = useState(subMapsData?.sitePlayerPosition || null);
    const [currentSiteTile, setCurrentSiteTile] = useState(subMapsData?.currentSiteTile || null);
    const [isInsideSite, setIsInsideSite] = useState(subMapsData?.isInsideSite || false);
    const [siteMapsCache, setSiteMapsCache] = useState(subMapsData?.siteMapsCache || {});
    const [siteError, setSiteError] = useState(null);

    // On mount: sync currentTownMap with cache to ensure discoveredBuildings is up to date
    useEffect(() => {
        if (currentTownMap && currentTownMap.townName && townMapsCache[currentTownMap.townName]) {
            const cachedDiscovered = townMapsCache[currentTownMap.townName].discoveredBuildings || [];
            const currentDiscovered = currentTownMap.discoveredBuildings || [];

            logger.debug('Initial discoveredBuildings sync check', {
                townName: currentTownMap.townName,
                cachedDiscovered,
                currentDiscovered
            });

            if (cachedDiscovered.length > 0 && cachedDiscovered.length !== currentDiscovered.length) {
                logger.debug('Syncing discoveredBuildings from cache on mount');
                setCurrentTownMap(prev => ({
                    ...prev,
                    discoveredBuildings: cachedDiscovered
                }));
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only on mount

    // Visited tracking
    const [visitedBiomes, setVisitedBiomes] = useState(() => new Set(subMapsData?.visitedBiomes || []));
    const [visitedTowns, setVisitedTowns] = useState(() => new Set(subMapsData?.visitedTowns || []));

    const trackBiomeVisit = (biome) => {
        if (!biome) return;
        setVisitedBiomes(prev => {
            if (prev.has(biome)) return prev;
            const next = new Set(prev);
            next.add(biome);
            return next;
        });
    };

    const trackTownVisit = (town) => {
        if (!town) return;
        setVisitedTowns(prev => {
            if (prev.has(town)) return prev;
            const next = new Set(prev);
            next.add(town);
            return next;
        });
    };

    const markBuildingDiscovered = (townName, x, y) => {
        if (!townName) return;

        const coord = `${x},${y}`;

        setTownMapsCache(prev => {
            const townData = prev[townName];
            if (!townData) return prev;

            const discovered = townData.discoveredBuildings || [];
            if (discovered.includes(coord)) return prev;

            return {
                ...prev,
                [townName]: {
                    ...townData,
                    discoveredBuildings: [...discovered, coord]
                }
            };
        });
    };

    // Keep currentTownMap in sync with townMapsCache (for discoveredBuildings updates)
    useEffect(() => {
        if (currentTownMap && currentTownMap.townName) {
            const cachedData = townMapsCache[currentTownMap.townName];
            const currentDiscovered = currentTownMap.discoveredBuildings || [];
            const cachedDiscovered = cachedData?.discoveredBuildings || [];

            logger.debug('Checking discoveredBuildings sync', {
                townName: currentTownMap.townName,
                currentDiscovered,
                cachedDiscovered,
                needsSync: cachedDiscovered.length !== currentDiscovered.length
            });

            if (cachedDiscovered.length > currentDiscovered.length) {
                logger.debug('Syncing discoveredBuildings from cache');
                setCurrentTownMap(prev => ({
                    ...prev,
                    discoveredBuildings: cachedDiscovered
                }));
            }
        }
    }, [townMapsCache, currentTownMap]);

    const [isMapModalOpen, setIsMapModalOpen] = useState(false);
    const [townError, setTownError] = useState(null);

    // Validate and regenerate town map if needed
    useEffect(() => {
        if (currentTownMap && currentTownTile) {
            const isValid = currentTownMap.mapData &&
                currentTownMap.width &&
                currentTownMap.height &&
                currentTownMap.entryPoint &&
                typeof currentTownMap.townName === 'string';

            if (!isValid) {
                logger.warn('Invalid town map data detected, regenerating');
                const townSize = currentTownTile.townSize || currentTownTile.poiType || 'village';
                const townName = currentTownTile.townName || currentTownTile.poi || 'Town';

                if (!worldSeed) {
                    logger.error('Cannot regenerate town: worldSeed missing');
                    setTownError('This save file is missing its World Seed and cannot be repaired.');
                    return;
                }

                const rawSeed = parseInt(worldSeed) + ((currentTownTile.x || 0) * 1000) + ((currentTownTile.y || 0) * 10000);
                const seed = Number.isFinite(rawSeed) ? rawSeed : Math.floor(Math.random() * 1000000);
                const newTownMap = generateTownMap(
                    townSize,
                    townName,
                    getTownRoadEdges(worldMap, currentTownTile.x, currentTownTile.y),
                    seed,
                    currentTownTile.hasRiver,
                    currentTownTile.riverDirection,
                    mapTheme,
                    analyzeTownWater(worldMap, currentTownTile.x, currentTownTile.y)
                );

                // Inject quest buildings if needed
                if (requiredBuildings?.[townName]) {
                    injectQuestBuildings(newTownMap, requiredBuildings[townName]);
                }

                // POPULATE TOWN
                const npcs = populateTown(newTownMap, seed);
                newTownMap.npcs = npcs;

                setCurrentTownMap(newTownMap);
                setTownPlayerPosition({ x: newTownMap.entryPoint.x, y: newTownMap.entryPoint.y });
            }
        }
    }, []);

    // --- Handlers --- //

    const handleEnterLocation = (encounter, setConversation, conversation) => {
        if (!encounter) return;

        logger.info('Entering location', encounter.name);

        if (['town', 'city', 'village', 'hamlet'].includes(encounter.poiType)) {
            const townTile = encounter.tile;
            const townSize = townTile.townSize || encounter.poiType;
            const townName = encounter.name;

            let townMapData = townMapsCache[townName];

            if (!townMapData) {
                logger.info('Generating new town map', townName);
                const rawSeed = worldSeed ? (parseInt(worldSeed) + ((townTile.x || 0) * 1000) + ((townTile.y || 0) * 10000)) : (loadedConversation?.sessionId || Math.floor(Math.random() * 1000000));
                const seed = Number.isFinite(rawSeed) ? rawSeed : Math.floor(Math.random() * 1000000);
                townMapData = generateTownMap(townSize, townName, getTownRoadEdges(worldMap, townTile.x, townTile.y), seed, townTile.hasRiver, townTile.riverDirection, mapTheme, analyzeTownWater(worldMap, townTile.x, townTile.y));

                // Inject quest buildings if needed
                if (requiredBuildings?.[townName]) {
                    injectQuestBuildings(townMapData, requiredBuildings[townName]);
                }

                // POPULATE TOWN WITH NPCs
                logger.debug('Populating town with NPCs');
                const npcs = populateTown(townMapData, seed);
                townMapData.npcs = npcs;

                setTownMapsCache(prev => ({ ...prev, [townName]: townMapData }));
            } else {
                logger.debug('Loading cached town map', townName);
            }

            setCurrentTownMap(townMapData);
            setCurrentTownTile(townTile);
            setTownPlayerPosition({ x: townMapData.entryPoint.x, y: townMapData.entryPoint.y });
            setCurrentMapLevel('town');
            setIsInsideTown(true);
            trackTownVisit(townName);

            const enterMessage = {
                role: 'system',
                content: `You have entered ${townName}.`
            };
            setConversation([...conversation, enterMessage]);
            setIsMapModalOpen(true);
        } else if (['cave_entrance', 'cave', 'ruins'].includes(encounter.poiType)) {
            // Wilderness site (cave / ruin). Seed-deterministic + cached by type+coords,
            // mirroring towns. The world tile's biome themes the ruin's open ground.
            const tile = encounter.tile;
            const poiType = encounter.poiType;
            const key = `${poiType}_${tile.x},${tile.y}`;

            let siteMap = siteMapsCache[key];
            if (!siteMap) {
                const rawSeed = worldSeed ? (parseInt(worldSeed) + ((tile.x || 0) * 1000) + ((tile.y || 0) * 10000)) : Math.floor(Math.random() * 1000000);
                const seed = Number.isFinite(rawSeed) ? rawSeed : Math.floor(Math.random() * 1000000);
                const names = poiType === 'ruins'
                    ? ['Ancient Ruins', 'The Fallen Hold', 'Crumbled Watchtower', 'Forgotten Stones', 'The Old Keep']
                    : ['Cavern', 'Hollow Deep', 'The Undervault', 'Echo Hollow', 'Gloomcave'];
                const name = names[Math.abs(seed) % names.length];
                siteMap = generateSiteMap(poiType, name, 'south', seed, { biome: tile.biome });
                setSiteMapsCache(prev => ({ ...prev, [key]: siteMap }));
                logger.info('Generated new site map', { poiType, name, key });
            } else {
                logger.debug('Loading cached site map', key);
            }

            setCurrentSiteMap(siteMap);
            setCurrentSiteTile(tile);
            setSitePlayerPosition({ x: siteMap.entryPoint.x, y: siteMap.entryPoint.y });
            setCurrentMapLevel('site');
            setIsInsideSite(true);
            setSiteError(null);

            setConversation([...conversation, { role: 'system', content: `You venture into ${siteMap.name}.` }]);
            setIsMapModalOpen(true);
        }
    };

    const handleLeaveSite = (setConversation, conversation) => {
        if (!currentSiteMap || !sitePlayerPosition) return;
        const { entryPoint } = currentSiteMap;
        const dist = Math.abs(sitePlayerPosition.x - entryPoint.x) + Math.abs(sitePlayerPosition.y - entryPoint.y);
        if (dist > 1) {
            setSiteError('You must be at the entrance (the lit exit) to leave.');
            return;
        }
        setSiteError(null);
        setCurrentMapLevel('world');
        setCurrentSiteMap(null);
        setSitePlayerPosition(null);
        setCurrentSiteTile(null);
        setIsInsideSite(false);
        setConversation([...conversation, { role: 'system', content: `You leave ${currentSiteMap.name} and return to the wilds.` }]);
    };

    const handleSiteTileClick = (clickedX, clickedY) => {
        if (!sitePlayerPosition || !currentSiteMap || isLoading) return;
        const distance = Math.abs(clickedX - sitePlayerPosition.x) + Math.abs(clickedY - sitePlayerPosition.y);
        if (distance === 0) return;
        if (distance > 5) { setError('You can move up to 5 tiles at a time.'); return; }
        const targetTile = currentSiteMap.mapData[clickedY] && currentSiteMap.mapData[clickedY][clickedX];
        if (!targetTile) return;
        if (!targetTile.walkable) { setError('You cannot move there.'); return; }
        setSiteError(null);
        setSitePlayerPosition({ x: clickedX, y: clickedY });
    };

    const handleEnterCurrentTown = (setConversation, conversation) => {
        // Prevent entering towns before adventure starts
        if (!hasAdventureStarted) {
            logger.debug('Cannot enter town - adventure has not started');
            return;
        }

        const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);
        if (!currentTile || currentTile.poi !== 'town') return;

        const poiType = currentTile.poiType || currentTile.poi;
        const townSize = currentTile.townSize || poiType;
        const townName = currentTile.townName || currentTile.poi;

        let townMapData = townMapsCache[townName];

        logger.debug('Town cache lookup', {
            townName,
            hasCachedData: !!townMapData,
            cachedDiscoveredBuildings: townMapData?.discoveredBuildings || []
        });

        if (!townMapData) {
            logger.info('Generating new town map', townName);
            const tileX = currentTile.x !== undefined ? currentTile.x : playerPosition.x;
            const tileY = currentTile.y !== undefined ? currentTile.y : playerPosition.y;

            // Robust determinism for legacy saves: Hashing stable data points (World Signature)
            const getLegacySeed = (conv) => {
                const sid = conv?.sessionId || '';
                const ts = conv?.timestamp || '';
                const heroes = (conv?.selected_heroes || []).map(h => h.characterName).sort().join('');
                const signature = `${sid}-${ts}-${heroes}`;

                let hash = 0;
                for (let i = 0; i < signature.length; i++) {
                    const char = signature.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash | 0; // Convert to 32bit integer
                }
                return Math.abs(hash);
            };

            const effectiveSeed = worldSeed || getLegacySeed(loadedConversation);

            if (!worldSeed) {
                logger.warn('worldSeed missing for legacy save, using world signature seed', effectiveSeed);
            }

            const seed = effectiveSeed + (tileX * 1000) + (tileY * 10000);

            if (isNaN(seed)) {
                logger.error('Critical failure: generated town seed is NaN', { effectiveSeed, tileX, tileY });
                setTownError('Could not generate a valid town seed from this save file.');
                return;
            }

            logger.debug('Using town seed', seed);
            townMapData = generateTownMap(townSize, townName, getTownRoadEdges(worldMap, tileX, tileY), seed, currentTile.hasRiver, currentTile.riverDirection, mapTheme, analyzeTownWater(worldMap, tileX, tileY));

            // Inject quest buildings if needed
            if (requiredBuildings?.[townName]) {
                injectQuestBuildings(townMapData, requiredBuildings[townName]);
            }

            // POPULATE TOWN WITH NPCs
            logger.debug('Populating town with NPCs');
            const npcs = populateTown(townMapData, seed);
            townMapData.npcs = npcs;

            setTownMapsCache(prev => ({ ...prev, [townName]: townMapData }));
        }

        // If already inside, just switch to town view (don't add message)
        if (isInsideTown && currentTownTile?.townName === townName) {
            setCurrentMapLevel('town');
            return;
        }

        setCurrentTownMap(townMapData);
        setCurrentTownTile(currentTile);
        setTownPlayerPosition({ x: townMapData.entryPoint.x, y: townMapData.entryPoint.y });
        setCurrentMapLevel('town');
        setIsInsideTown(true);
        trackTownVisit(townName);

        const enterMessage = {
            role: 'system',
            content: `You have entered ${townName}.`
        };
        setConversation([...conversation, enterMessage]);
    };

    const handleLeaveTown = (setConversation, conversation) => {
        if (!currentTownMap || !townPlayerPosition) return;

        const entryPoint = currentTownMap.entryPoint;
        const playerX = townPlayerPosition.x;
        const playerY = townPlayerPosition.y;

        const isAtEntry = playerX === entryPoint.x && playerY === entryPoint.y;
        const isAdjacentRight = playerX === entryPoint.x + 1 && playerY === entryPoint.y;

        if (!isAtEntry && !isAdjacentRight) {
            setTownError('You must be at the town entrance (marked with yellow outline) to leave.');
            return;
        }

        setTownError(null);
        setCurrentMapLevel('world');
        setCurrentTownMap(null);
        setTownPlayerPosition(null);
        setCurrentTownTile(null);
        setIsInsideTown(false);

        const exitMessage = {
            role: 'system',
            content: `You have left the town and returned to the world map.`
        };
        setConversation([...conversation, exitMessage]);
    };

    const handleTownTileClick = (clickedX, clickedY, setConversation, conversation) => {
        if (!townPlayerPosition || !currentTownMap || isLoading) return;

        const currentX = townPlayerPosition.x;
        const currentY = townPlayerPosition.y;

        const distance = Math.abs(clickedX - currentX) + Math.abs(clickedY - currentY);

        if (distance === 0) return;

        if (distance > 5) {
            setError('You can move up to 5 tiles at a time in town.');
            return;
        }

        const targetTile = currentTownMap.mapData[clickedY] && currentTownMap.mapData[clickedY][clickedX] ? currentTownMap.mapData[clickedY][clickedX] : null;
        if (!targetTile) return;

        if (!targetTile.walkable && targetTile.type !== 'building') {
            setError('You cannot move to that location.');
            return;
        }

        setTownError(null);
        setTownPlayerPosition({ x: clickedX, y: clickedY });
    };

    return {
        worldMap,
        setWorldMap,
        playerPosition,
        setPlayerPosition,
        currentMapLevel,
        setCurrentMapLevel,
        currentTownMap,
        townPlayerPosition,
        currentTownTile,
        isInsideTown,
        townMapsCache,
        isMapModalOpen,
        setIsMapModalOpen,
        townError,

        handleEnterLocation,
        handleEnterCurrentTown,
        handleLeaveTown,
        handleTownTileClick,

        // wilderness sites (caves / ruins)
        currentSiteMap,
        sitePlayerPosition,
        currentSiteTile,
        isInsideSite,
        siteMapsCache,
        siteError,
        handleLeaveSite,
        handleSiteTileClick,

        visitedBiomes,
        visitedTowns,
        trackBiomeVisit,
        trackTownVisit,
        markBuildingDiscovered
    };
};

export default useGameMap;
