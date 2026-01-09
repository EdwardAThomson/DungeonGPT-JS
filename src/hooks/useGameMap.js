import { useState, useEffect, useRef } from 'react';
import { generateMapData, getTile, findStartingTown } from '../utils/mapGenerator';
import { generateTownMap } from '../utils/townMapGenerator';
import { populateTown } from '../utils/npcGenerator';

const useGameMap = (loadedConversation, hasAdventureStarted, isLoading, setError, worldSeed) => {
    // --- State Initialization --- //
    const [generatedMap] = useState(() => loadedConversation?.generatedMap || null); // Capture generatedMap if passed via state

    const [mapAndPosition] = useState(() => {
        if (loadedConversation?.world_map && loadedConversation?.player_position) {
            const map = loadedConversation.world_map;

            // --- MIGRATION: Patch old saves missing x/y on tiles ---
            console.log('[MIGRATION] Checking map data compatibility...');
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
                console.log(`[MIGRATION] Patched ${migrationCount} tiles with coordinates.`);
            }

            return {
                map: map,
                position: loadedConversation.player_position
            };
        }

        // Generate new map
        const newMap = generatedMap || generateMapData(10, 10, worldSeed);
        const startingPos = findStartingTown(newMap);
        console.log('[MAP INIT] Starting town found at:', startingPos);

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
                console.log('[TOWN_MAP] Invalid town map data detected, regenerating...');
                const townSize = currentTownTile.townSize || currentTownTile.poiType || 'village';
                const townName = currentTownTile.townName || currentTownTile.poi || 'Town';

                if (!worldSeed) {
                    console.error('[TOWN_MAP] Cannot regenerate town: worldSeed missing.');
                    setTownError('This save file is missing its World Seed and cannot be repaired.');
                    return;
                }

                const seed = parseInt(worldSeed) + (currentTownTile.x * 1000) + (currentTownTile.y * 10000);
                const newTownMap = generateTownMap(townSize, townName, 'south', seed);

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

        console.log('[ENCOUNTER] Entering location:', encounter.name);

        if (['town', 'city', 'village', 'hamlet'].includes(encounter.poiType)) {
            const townTile = encounter.tile;
            const townSize = townTile.townSize || encounter.poiType;
            const townName = encounter.name;

            let townMapData = townMapsCache[townName];

            if (!townMapData) {
                console.log('[TOWN_ENTRY] Generating new town map for:', townName);
                const seed = worldSeed ? (parseInt(worldSeed) + (townTile.x * 1000) + (townTile.y * 10000)) : (loadedConversation?.sessionId || Math.floor(Math.random() * 1000000));
                townMapData = generateTownMap(townSize, townName, 'south', seed);

                // POPULATE TOWN WITH NPCs
                console.log('[TOWN_ENTRY] Populating town with NPCs...');
                const npcs = populateTown(townMapData, seed);
                townMapData.npcs = npcs;

                setTownMapsCache(prev => ({ ...prev, [townName]: townMapData }));
            } else {
                console.log('[TOWN_ENTRY] Loading cached town map for:', townName);
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
            console.log('[TOWN_ENTRY] Cannot enter town - adventure has not started yet');
            return;
        }

        const currentTile = getTile(worldMap, playerPosition.x, playerPosition.y);
        if (!currentTile || currentTile.poi !== 'town') return;

        const poiType = currentTile.poiType || currentTile.poi;
        const townSize = currentTile.townSize || poiType;
        const townName = currentTile.townName || currentTile.poi;

        let townMapData = townMapsCache[townName];

        if (!townMapData) {
            console.log('[TOWN_ENTRY] Generating new town map for:', townName);
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
                console.warn('[TOWN_ENTRY] worldSeed missing for legacy save, using World Signature:', effectiveSeed);
            }

            const seed = effectiveSeed + (tileX * 1000) + (tileY * 10000);

            if (isNaN(seed)) {
                console.error('[TOWN_ENTRY] Critical Failure: Generated seed is NaN.', { effectiveSeed, tileX, tileY });
                setTownError('Could not generate a valid town seed from this save file.');
                return;
            }

            console.log('[TOWN_ENTRY] Using seed:', seed);
            townMapData = generateTownMap(townSize, townName, 'south', seed);

            // POPULATE TOWN WITH NPCs
            console.log('[TOWN_ENTRY] Populating town with NPCs...');
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

        const targetTile = currentTownMap.mapData[clickedY][clickedX];

        // Interaction with buildings
        if (targetTile.type === 'building' && setConversation && conversation) {
            const buildingName = targetTile.buildingName || targetTile.buildingType || "Building";
            const buildingNpcs = (currentTownMap.npcs || []).filter(npc =>
                npc.location.x === clickedX && npc.location.y === clickedY
            );

            let npcList = "";
            if (buildingNpcs.length > 0) {
                npcList = " Inside, you see: " + buildingNpcs.map(n => `${n.title} ${n.name} (${n.job})`).join(", ") + ".";
            } else {
                npcList = " The building seems empty for now.";
            }

            const interactMessage = {
                role: 'system',
                content: `You approach the ${buildingName}.${npcList} You can now interact with them in the chat.`
            };
            setConversation([...conversation, interactMessage]);
            return;
        }

        if (!targetTile.walkable) {
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
        trackTownVisit
    };
};

export default useGameMap;
