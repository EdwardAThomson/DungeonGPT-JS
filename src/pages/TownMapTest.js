import React, { useState, useMemo } from "react";
import TownMapDisplay from "../components/TownMapDisplay";
import { generateTownMap, getTownTileEmoji } from "../utils/townMapGenerator";
import { populateTown } from "../utils/npcGenerator";

const BUILDING_EMOJIS = {
    house: '🏠', inn: '🏨', shop: '🏪', temple: '⛪', tavern: '🍺',
    guild: '🏛️', market: '🏬', bank: '🏦', manor: '🏰', barn: '🏚️',
    blacksmith: '⚒️', keep: '🏰', archives: '📚', alchemist: '⚗️',
    foundry: '🔥', warehouse: '📦', library: '📖'
};

const TownMapTest = () => {
    const [generatedTownMap, setGeneratedTownMap] = useState(null);
    const [showTownMapPreview, setShowTownMapPreview] = useState(false);
    const [selectedTownSize, setSelectedTownSize] = useState('village');
    const [townNpcs, setTownNpcs] = useState([]);

    const handleGenerateTownMap = () => {
        const seed = Math.floor(Math.random() * 100000);
        const townMap = generateTownMap(selectedTownSize, `Test ${selectedTownSize}`, 'south', seed);
        setGeneratedTownMap(townMap);
        setShowTownMapPreview(true);
        const npcs = populateTown(townMap, seed);
        setTownNpcs(npcs);
    };

    // Compute building counts from map data
    const buildingCounts = useMemo(() => {
        if (!generatedTownMap) return {};
        const counts = {};
        generatedTownMap.mapData.flat().forEach(tile => {
            if (tile.type === 'building' && tile.buildingType) {
                counts[tile.buildingType] = (counts[tile.buildingType] || 0) + 1;
            }
        });
        return counts;
    }, [generatedTownMap]);

    // Compute NPC counts by role
    const npcCounts = useMemo(() => {
        const counts = {};
        townNpcs.forEach(npc => {
            counts[npc.role] = (counts[npc.role] || 0) + 1;
        });
        return counts;
    }, [townNpcs]);

    const totalBuildings = Object.values(buildingCounts).reduce((a, b) => a + b, 0);

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
                        Generate Town Map
                    </button>

                    {generatedTownMap && (
                        <span className="map-status">Town map generated!</span>
                    )}
                </div>

                {showTownMapPreview && generatedTownMap && (
                    <div className="map-preview-container">
                        <h3>Town Map Preview: {generatedTownMap.townName}</h3>
                        <p className="map-preview-hint">
                            <strong>Buildings:</strong> {Object.entries(BUILDING_EMOJIS).map(([type, emoji]) =>
                                `${emoji} ${type.charAt(0).toUpperCase() + type.slice(1)}`
                            ).join(' | ')}<br />
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
                            Total structures: {totalBuildings}
                        </p>

                        {/* Metrics Section */}
                        <div style={{
                            display: 'flex',
                            gap: '20px',
                            marginTop: '20px',
                            flexWrap: 'wrap'
                        }}>
                            {/* Building Counts */}
                            <div style={{
                                flex: '1 1 300px',
                                backgroundColor: 'var(--surface, #1a1a2e)',
                                border: '1px solid var(--border, #333)',
                                borderRadius: '8px',
                                padding: '16px'
                            }}>
                                <h4 style={{ margin: '0 0 12px 0', color: 'var(--primary, #c4a35a)' }}>
                                    Buildings ({totalBuildings})
                                </h4>
                                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border, #333)' }}>
                                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Type</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Count</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(buildingCounts)
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([type, count]) => (
                                                <tr key={type} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                                                    <td style={{ padding: '4px 8px' }}>
                                                        {BUILDING_EMOJIS[type] || '🏠'} {type.charAt(0).toUpperCase() + type.slice(1)}
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 'bold' }}>
                                                        {count}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* NPC Counts */}
                            <div style={{
                                flex: '1 1 300px',
                                backgroundColor: 'var(--surface, #1a1a2e)',
                                border: '1px solid var(--border, #333)',
                                borderRadius: '8px',
                                padding: '16px'
                            }}>
                                <h4 style={{ margin: '0 0 12px 0', color: 'var(--primary, #c4a35a)' }}>
                                    Residents ({townNpcs.length})
                                </h4>
                                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border, #333)' }}>
                                            <th style={{ textAlign: 'left', padding: '4px 8px' }}>Role</th>
                                            <th style={{ textAlign: 'right', padding: '4px 8px' }}>Count</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Object.entries(npcCounts)
                                            .sort(([, a], [, b]) => b - a)
                                            .map(([role, count]) => (
                                                <tr key={role} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                                                    <td style={{ padding: '4px 8px' }}>
                                                        {role}
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 'bold' }}>
                                                        {count}
                                                    </td>
                                                </tr>
                                            ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TownMapTest;
