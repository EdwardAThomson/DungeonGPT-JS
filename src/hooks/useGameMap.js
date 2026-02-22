import { useState, useEffect, useRef } from 'react';
import { generateMapData, getTile, findStartingTown } from '../utils/mapGenerator';
import { generateTownMap } from '../utils/townMapGenerator';
import { populateTown } from '../utils/npcGenerator';
import { createLogger } from '../utils/logger';

const logger = createLogger('game-map');

const useGameMap = (loadedConversation, hasAdventureStarted, isLoading, setError, worldSeed) => {
    // --- State Initialization --- //
    const [generatedMap] = useState(() => loadedConversation?.generatedMap || null); // Capture generatedMap if passed via state

    const [mapAndPosition] = useState(() => {
        if (loadedConversation?.world_map && loadedConversation?.player_position) {
            const map = loadedConversation.world_map;

            // --- MIGRATION: Patch old saves missing x/y on tiles ---
            logger.debug('Checking map data compatibility');
            let migrationCount = 0;
            for (let y = 0; y < map.length; y++) {
                for (let x = 0; x < map[y].length; x++) {
                    if (map[y][x].x === undefined || map[y][x].y === undefined) {
                        map[y][x].x = x;
                        map[y][x].y = y;
                        migrationCount++;
                    }
                }
            }
            if (migrationCount > 0) {
                logger.info(`Patched ${migrationCount} tiles with coordinates`);
            }

            return {
                map: map,
                position: loadedConversation.player_position
            };
        }

        // Generate new map
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

    const subMapsData = loadedConversation?.sub_maps || loadedConversation?.subMaps;

    // Multi-level map system
    const [currentMapLevel, setCurrentMapLevel] = useState(subMapsData?.currentMapLevel || 'world');
    const [currentTownMap, setCurrentTownMap] = useState(subMapsData?.currentTownMap || null);
    const [townPlayerPosition, setTownPlayerPosition] = useState(subMapsData?.townPlayerPosition || null);
    const [currentTownTile, setCurrentTownTile] = useState(subMapsData?.currentTownTile || null);
    const [isInsideTown, setIsInsideTown] = useState(subMapsData?.isInsideTown || false);
    const [townMapsCache, setTownMapsCache] = useState(subMapsData?.townMapsCache || {});

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

                const seed = parseInt(worldSeed) + (currentTownTile.x * 1000) + (currentTownTile.y * 10000);
                const newTownMap = generateTownMap(
                    townSize,
                    townName,
                    'south',
                    seed,
                    currentTownTile.hasRiver,
                    currentTownTile.riverDirection
                );

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
                const seed = worldSeed ? (parseInt(worldSeed) + (townTile.x * 1000) + (townTile.y * 10000)) : (loadedConversation?.sessionId || Math.floor(Math.random() * 1000000));
                townMapData = generateTownMap(townSize, townName, 'south', seed, townTile.hasRiver, townTile.riverDirection);

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
        }
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
            townMapData = generateTownMap(townSize, townName, 'south', seed, currentTile.hasRiver, currentTile.riverDirection);

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

        handleEnterCurrentTown,
        handleLeaveTown,
        handleTownTileClick,

        visitedBiomes,
        visitedTowns,
        trackBiomeVisit,
        trackTownVisit,
        markBuildingDiscovered
    };
};

export default useGameMap;
