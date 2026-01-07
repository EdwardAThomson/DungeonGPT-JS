import React, { useState } from 'react';
import { generateMapData, findStartingTown } from '../utils/mapGenerator';
import { generateTownMap } from '../utils/townMapGenerator';
import { populateTown } from '../utils/npcGenerator';
import WorldMapDisplay from '../components/WorldMapDisplay';
import TownMapDisplay from '../components/TownMapDisplay';

const SeedDebugTest = () => {
    const [worldSeed, setWorldSeed] = useState('12345');
    const [worldMap, setWorldMap] = useState(null);
    const [selectedTown, setSelectedTown] = useState(null);
    const [townMap, setTownMap] = useState(null);
    const [townNpcs, setTownNpcs] = useState([]);

    const handleGenerateWorld = () => {
        const seedVal = parseInt(worldSeed) || Math.floor(Math.random() * 1000000);
        if (!worldSeed) setWorldSeed(seedVal.toString());

        console.log('[SEED_DEBUG] Generating world with seed:', seedVal);
        const map = generateMapData(10, 10, seedVal);
        setWorldMap(map);
        setSelectedTown(null);
        setTownMap(null);
        setTownNpcs([]);
    };

    const handleTownClick = (x, y) => {
        if (!worldMap) return;
        const tile = worldMap[y][x];
        if (tile.poi !== 'town') return;

        console.log('[SEED_DEBUG] Inspecting town:', tile.townName, 'at', x, y);
        setSelectedTown(tile);

        const townSize = tile.townSize || 'village';
        const townName = tile.townName || 'Test Town';
        // USE SAME SEED MIXING LOGIC AS useGameMap.js
        const rootSeed = parseInt(worldSeed);
        const townSeed = rootSeed + (x * 1000) + (y * 10000);

        console.log('[SEED_DEBUG] Derived town seed:', townSeed);
        const tMap = generateTownMap(townSize, townName, 'south', townSeed);
        const npcs = populateTown(tMap, townSeed);

        setTownMap(tMap);
        setTownNpcs(npcs);
    };

    // Group NPCs by building for better display
    const groupedNpcs = townNpcs.reduce((acc, npc) => {
        const bName = npc.location.buildingName || "Outdoors";
        const capitalizedName = bName.charAt(0).toUpperCase() + bName.slice(1);

        // Create a unique key using name and coordinates to separate blocks
        const coords = npc.location.homeCoords || { x: npc.location.x, y: npc.location.y };
        const key = `${capitalizedName} (${coords.x}, ${coords.y})`;

        if (!acc[key]) acc[key] = [];
        acc[key].push(npc);
        return acc;
    }, {});

    return (
        <div className="page-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
            <h1>🌱 World Seed Debugger</h1>
            <p>Verification tool for deterministic world and town generation.</p>

            <div style={{ display: 'flex', gap: '15px', marginBottom: '30px', alignItems: 'center', background: '#f5f5f5', padding: '15px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <label style={{ fontWeight: 'bold', marginBottom: '5px' }}>Root World Seed:</label>
                    <input
                        type="number"
                        value={worldSeed}
                        onChange={(e) => setWorldSeed(e.target.value)}
                        style={{ padding: '8px', width: '150px' }}
                    />
                </div>
                <button onClick={handleGenerateWorld} className="primary-button" style={{ height: 'fit-content', alignSelf: 'flex-end' }}>
                    🌍 Generate World
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: worldMap ? '1fr 1fr' : '1fr', gap: '20px' }}>
                {worldMap && (
                    <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
                        <h3>World Map (Seed: {worldSeed})</h3>
                        <p style={{ fontSize: '0.9rem', color: '#666' }}>Click a town (🛖/🏡/🏘️/🏰) to inspect its population.</p>
                        <WorldMapDisplay
                            mapData={worldMap}
                            playerPosition={findStartingTown(worldMap)}
                            onTileClick={handleTownClick}
                        />
                    </div>
                )}

                {selectedTown && (
                    <div style={{ background: '#fff', padding: '15px', borderRadius: '8px', border: '1px solid #ddd' }}>
                        <h3>Town Detail: {selectedTown.townName}</h3>
                        <p style={{ fontSize: '0.9rem', color: '#666' }}>
                            Coordinates: ({selectedTown.x}, {selectedTown.y}) |
                            Mixed Seed: {parseInt(worldSeed) + (selectedTown.x * 1000) + (selectedTown.y * 10000)}
                        </p>
                        <TownMapDisplay townMapData={townMap} showLeaveButton={false} />
                    </div>
                )}
            </div>

            {selectedTown && (
                <div style={{ marginTop: '30px', background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #ddd' }}>
                    <h3>👥 Town Population ({townNpcs.length} NPCs)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
                        {Object.entries(groupedNpcs).map(([building, npcs]) => (
                            <div key={building} style={{ border: '1px solid #eee', borderRadius: '6px', padding: '10px' }}>
                                <h4 style={{ borderBottom: '2px solid #3498db', paddingBottom: '5px', marginTop: '0' }}>{building}</h4>
                                <ul style={{ listStyle: 'none', padding: 0 }}>
                                    {npcs.map(npc => (
                                        <li key={npc.id} style={{ marginBottom: '10px', fontSize: '0.9rem', borderLeft: '3px solid #3498db', paddingLeft: '8px' }}>
                                            <strong>{npc.title} {npc.name}</strong> ({npc.gender} {npc.race})<br />
                                            <span style={{ color: '#2980b9', fontWeight: 'bold' }}>Job:</span> {npc.job}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SeedDebugTest;
