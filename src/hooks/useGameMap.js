import { useState, useEffect, useRef } from 'react';
import { generateMapData, getTile, findStartingTown } from '../utils/mapGenerator';
import { generateTownMap } from '../utils/townMapGenerator';
import { populateTown } from '../utils/npcGenerator';

const useGameMap = (loadedConversation, hasAdventureStarted, isLoading, setError, worldSeed) => {
    // --- State Initialization --- //
    const [generatedMap] = useState(() => loadedConversation?.generatedMap || null); // Capture generatedMap if passed via state

    const [mapAndPosition] = useState(() => {
        if (loadedConversation?.world_map && loadedConversation?.player_position) {
            return {
                map: loadedConversation.world_map,
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

    // Multi-level map system
    const [currentMapLevel, setCurrentMapLevel] = useState(loadedConversation?.sub_maps?.currentMapLevel || 'world');
    const [currentTownMap, setCurrentTownMap] = useState(loadedConversation?.sub_maps?.currentTownMap || null);
    const [townPlayerPosition, setTownPlayerPosition] = useState(loadedConversation?.sub_maps?.townPlayerPosition || null);
    const [currentTownTile, setCurrentTownTile] = useState(loadedConversation?.sub_maps?.currentTownTile || null);
    const [isInsideTown, setIsInsideTown] = useState(loadedConversation?.sub_maps?.isInsideTown || false);
    const [townMapsCache, setTownMapsCache] = useState(loadedConversation?.sub_maps?.townMapsCache || {});

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
                const seed = worldSeed ? (parseInt(worldSeed) + (currentTownTile.x * 1000) + (currentTownTile.y * 10000)) : (loadedConversation?.sessionId || Math.floor(Math.random() * 1000000));
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
            const seed = worldSeed ? (parseInt(worldSeed) + (currentTile.x * 1000) + (currentTile.y * 10000)) : (loadedConversation?.sessionId || Math.floor(Math.random() * 1000000));
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

        handleEnterLocation,
        handleEnterCurrentTown,
        handleLeaveTown,
        handleTownTileClick
    };
};

export default useGameMap;
