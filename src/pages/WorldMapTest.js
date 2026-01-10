import React, { useState, useEffect } from "react";
import WorldMapDisplay from "../components/WorldMapDisplay";
import { generateMapData } from "../utils/mapGenerator";

const WorldMapTest = () => {
    const [mapData, setMapData] = useState(null);
    const [seed, setSeed] = useState(Math.floor(Math.random() * 1000000).toString());
    const [width, setWidth] = useState(10);
    const [height, setHeight] = useState(10);

    const handleGenerate = () => {
        const numericSeed = parseInt(seed) || 0;
        const newMap = generateMapData(width, height, numericSeed);
        setMapData(newMap);
    };

    // Generate initial map
    useEffect(() => {
        handleGenerate();
    }, []);

    const randomizeSeed = () => {
        setSeed(Math.floor(Math.random() * 1000000).toString());
    };

    return (
        <div className="page-container">
            <h1>World Map Generator Test</h1>

            <div className="form-section">
                <div className="map-controls" style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <div className="control-group">
                        <label><strong>Seed:</strong></label>
                        <input
                            type="text"
                            value={seed}
                            onChange={(e) => setSeed(e.target.value)}
                            style={{ marginLeft: '10px', padding: '5px', width: '120px' }}
                        />
                        <button onClick={randomizeSeed} style={{ marginLeft: '5px' }}>🎲</button>
                    </div>

                    <div className="control-group">
                        <label><strong>Width:</strong></label>
                        <input
                            type="number"
                            value={width}
                            onChange={(e) => setWidth(parseInt(e.target.value) || 10)}
                            style={{ marginLeft: '10px', padding: '5px', width: '60px' }}
                            min="5"
                            max="30"
                        />
                    </div>

                    <div className="control-group">
                        <label><strong>Height:</strong></label>
                        <input
                            type="number"
                            value={height}
                            onChange={(e) => setHeight(parseInt(e.target.value) || 10)}
                            style={{ marginLeft: '10px', padding: '5px', width: '60px' }}
                            min="5"
                            max="30"
                        />
                    </div>

                    <button
                        onClick={handleGenerate}
                        className="generate-map-button"
                    >
                        🌍 Generate World Map
                    </button>
                </div>

                {mapData && (
                    <div className="map-preview-container">
                        <h3>Map Preview (Seed: {seed})</h3>
                        <p className="map-preview-hint">
                            🌲 Forest | ⛰️ Mountain | 🛖/🏡/🏘️/🏰 Towns | 🟦 Coast/Lakes | 〰️ Rivers
                        </p>
                        <WorldMapDisplay
                            mapData={mapData}
                            playerPosition={{ x: -1, y: -1 }} // Don't show player
                            onTileClick={(x, y) => console.log('Clicked', x, y)}
                        />
                        <div style={{ marginTop: '10px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
                            {width}x{height} Grid | {mapData.flat().filter(t => t.poi === 'town').length} Towns
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WorldMapTest;
