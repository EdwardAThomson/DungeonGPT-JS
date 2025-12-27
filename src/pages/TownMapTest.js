import React, { useState } from "react";
import TownMapDisplay from "../components/TownMapDisplay";
import { generateTownMap } from "../utils/townMapGenerator";

const TownMapTest = () => {
    const [generatedTownMap, setGeneratedTownMap] = useState(null);
    const [showTownMapPreview, setShowTownMapPreview] = useState(false);
    const [selectedTownSize, setSelectedTownSize] = useState('village');

    const handleGenerateTownMap = () => {
        const townMap = generateTownMap(selectedTownSize, `Test ${selectedTownSize}`, 'south');
        setGeneratedTownMap(townMap);
        setShowTownMapPreview(true);
    };

    return (
        <div className="page-container">
            <h1>Town Map Generator Test</h1>

            <div className="form-section">
                <h2>Town Map Generator (Debug/Test)</h2>
                <p className="section-description">
                    Test the town interior map generator for different town sizes.
                </p>

                <div className="town-map-controls">
                    <label htmlFor="town-size-select">
                        <strong>Town Size:</strong>
                    </label>
                    <select
                        id="town-size-select"
                        value={selectedTownSize}
                        onChange={(e) => setSelectedTownSize(e.target.value)}
                        className="town-size-select"
                    >
                        <option value="hamlet">Hamlet (8x8)</option>
                        <option value="village">Village (12x12)</option>
                        <option value="town">Town (16x16)</option>
                        <option value="city">City (20x20)</option>
                    </select>

                    <button
                        onClick={handleGenerateTownMap}
                        className="generate-map-button"
                        type="button"
                    >
                        🏘️ Generate Town Map
                    </button>

                    {generatedTownMap && (
                        <span className="map-status">✓ Town map generated!</span>
                    )}
                </div>

                {showTownMapPreview && generatedTownMap && (
                    <div className="map-preview-container">
                        <h3>Town Map Preview: {generatedTownMap.townName}</h3>
                        <p className="map-preview-hint">
                            <strong>Buildings:</strong> 🏠 House | 🏨 Inn | 🏪 Shop | ⛪ Temple | 🍺 Tavern | 🏦 Bank | 🏛️ Guild<br />
                            <strong>Features:</strong> ⛲ Fountain | 🪣 Well | 🌳 Tree
                        </p>
                        <TownMapDisplay
                            townMapData={generatedTownMap}
                            playerPosition={null}
                            showLeaveButton={false}
                        />
                        <p style={{ textAlign: 'center', fontSize: '12px', color: '#666' }}>
                            Entry point marked with blue border |
                            Size: {generatedTownMap.width}x{generatedTownMap.height} |
                            Buildings: {generatedTownMap.mapData.flat().filter(t => t.type === 'building').length} structures
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TownMapTest;
