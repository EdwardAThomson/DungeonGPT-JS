import React, { useState, useMemo } from 'react';
import { generateNPC, populateTown } from '../utils/npcGenerator';
import { generateTownMap } from '../utils/townMapGenerator';
import TownMapDisplay from "../components/TownMapDisplay";

const BUILDING_EMOJIS = {
    house: '🏠', inn: '🏨', shop: '🏪', temple: '⛪', tavern: '🍺',
    guild: '🏛️', market: '🏬', bank: '🏦', manor: '🏰', barn: '🏚️',
    blacksmith: '⚒️', keep: '🏰', archives: '📚', alchemist: '⚗️',
    foundry: '🔥', warehouse: '📦', library: '📖'
};

const TownMetrics = ({ townMap, townNpcs }) => {
    const buildingCounts = useMemo(() => {
        const counts = {};
        townMap.mapData.flat().forEach(tile => {
            if (tile.type === 'building' && tile.buildingType) {
                counts[tile.buildingType] = (counts[tile.buildingType] || 0) + 1;
            }
        });
        return counts;
    }, [townMap]);

    const npcCounts = useMemo(() => {
        const counts = {};
        townNpcs.forEach(npc => {
            counts[npc.role] = (counts[npc.role] || 0) + 1;
        });
        return counts;
    }, [townNpcs]);

    const totalBuildings = Object.values(buildingCounts).reduce((a, b) => a + b, 0);

    const tableStyle = { width: '100%', fontSize: '13px', borderCollapse: 'collapse' };
    const thStyle = { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border, #333)' };
    const tdStyle = { padding: '4px 8px', borderBottom: '1px solid var(--border, #222)' };

    return (
        <div style={{ display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
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
                <table style={tableStyle}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Type</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(buildingCounts)
                            .sort(([, a], [, b]) => b - a)
                            .map(([type, count]) => (
                                <tr key={type}>
                                    <td style={tdStyle}>
                                        {BUILDING_EMOJIS[type] || '🏠'} {type.charAt(0).toUpperCase() + type.slice(1)}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>
                                        {count}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>

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
                <table style={tableStyle}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Role</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(npcCounts)
                            .sort(([, a], [, b]) => b - a)
                            .map(([role, count]) => (
                                <tr key={role}>
                                    <td style={tdStyle}>{role}</td>
                                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 'bold' }}>
                                        {count}
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const NPCTest = () => {
    const [npcs, setNpcs] = useState([]);
    const [seedInput, setSeedInput] = useState('');
    const [townNpcs, setTownNpcs] = useState([]);

    const generateBatch = () => {
        const batch = [];
        for (let i = 0; i < 5; i++) {
            batch.push(generateNPC());
        }
        setNpcs(batch);
    };

    const generateSeeded = () => {
        const seed = parseInt(seedInput) || 12345;
        const npc = generateNPC({ seed });
        setNpcs([npc]);
    };

    const [statsReport, setStatsReport] = useState(null);

    const runGenderTest = () => {
        let male = 0;
        let female = 0;
        const total = 100;
        const testBatch = [];

        for (let i = 0; i < total; i++) {
            // Use random seeds for this test
            const npc = generateNPC();
            testBatch.push(npc);
            if (npc.gender === "Male") male++;
            else female++;
        }

        setStatsReport({ male, female, total });
        setNpcs(testBatch); // Show the requested NPCs
    };

    const [groupedNpcs, setGroupedNpcs] = useState(null);
    const [townMap, setTownMap] = useState(null);
    const [townSize, setTownSize] = useState('town');

    const testTownPopulation = () => {
        const seed = parseInt(seedInput) || 12345;
        // Generate a 'town' sized map
        const townMap = generateTownMap(townSize, "Test Town", 'south', seed);

        // Populate it
        const population = populateTown(townMap, seed);

        // Group by building
        const groups = {};
        population.forEach(npc => {
            const building = npc.location.buildingName;
            if (!groups[building]) groups[building] = [];
            groups[building].push(npc);
        });

        setGroupedNpcs(groups);
        setTownMap(townMap); // Store for visualization
        setTownNpcs(population);
        setNpcs([]); // Clear main list to show grouped view
        setStatsReport(null);
    };

    return (
        <div className="page-container" style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
            <h1>👤 NPC Generator Test</h1>

            <section className="test-section" style={{ marginBottom: '30px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                    <button className="primary-button" onClick={generateBatch}>
                        Generate 5 Random NPCs
                    </button>

                    <div style={{ display: 'flex', gap: '5px' }}>
                        <input
                            type="number"
                            placeholder="Seed"
                            value={seedInput}
                            onChange={(e) => setSeedInput(e.target.value)}
                            style={{ width: '100px', padding: '5px' }}
                        />
                        <button className="secondary-button" onClick={generateSeeded}>
                            Generate Seeded NPC
                        </button>
                    </div>

                    <button className="secondary-button" style={{ backgroundColor: '#9b59b6', color: 'white' }} onClick={runGenderTest}>
                        Run 100x Gender Distribution Test
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <select
                            value={townSize}
                            onChange={(e) => setTownSize(e.target.value)}
                            style={{ padding: '5px' }}
                        >
                            <option value="hamlet">Hamlet</option>
                            <option value="village">Village</option>
                            <option value="town">Town</option>
                            <option value="city">City</option>
                        </select>
                        <button className="secondary-button" style={{ backgroundColor: '#e67e22', color: 'white' }} onClick={testTownPopulation}>
                            🏙️ Test Town Population
                        </button>
                    </div>
                </div>

                {statsReport && (
                    <div className="stats-report" style={{ padding: '10px', background: 'var(--surface, #1a1a2e)', border: '1px solid var(--border, #333)', borderRadius: '5px', marginBottom: '15px' }}>
                        <strong>Distribution Report (n={statsReport.total}):</strong>
                        <span style={{ marginLeft: '15px', color: '#5dade2' }}>Male: {statsReport.male}%</span>
                        <span style={{ marginLeft: '15px', color: '#e74c3c' }}>Female: {statsReport.female}%</span>
                        <span style={{ marginLeft: '15px', fontWeight: 'bold' }}>
                            {Math.abs(statsReport.male - 50) < 10 ? "✅ Balanced" : "⚠️ Skewed"}
                        </span>
                    </div>
                )}
            </section>

            {/* Town Visualization */}
            {townMap && (
                <div style={{ marginBottom: '30px', border: '1px solid var(--border, #333)', padding: '15px', borderRadius: '8px', background: 'var(--surface, #1a1a2e)' }}>
                    <h2 style={{ marginTop: 0 }}>🗺️ Town Map Visualization</h2>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <TownMapDisplay townMapData={townMap} showLeaveButton={false} />
                    </div>
                    <p style={{ textAlign: 'center', fontSize: '0.9em', color: 'var(--text-secondary, #aaa)', fontStyle: 'italic' }}>
                        Scroll down to see the inhabitants of these buildings!
                    </p>
                </div>
            )}

            {/* Town Metrics */}
            {townMap && townNpcs.length > 0 && <TownMetrics townMap={townMap} townNpcs={townNpcs} />}

            {groupedNpcs && (
                <div className="town-population-view">
                    <h2>Town Population Check</h2>
                    {Object.entries(groupedNpcs).map(([building, staff]) => {
                        const location = staff[0].location;
                        const coords = `(${location.x}, ${location.y})`;
                        const type = location.buildingType ? location.buildingType.charAt(0).toUpperCase() + location.buildingType.slice(1) : 'Building';

                        return (
                            <div key={building} className="building-group" style={{ marginBottom: '20px', padding: '10px', background: 'var(--surface, #1a1a2e)', border: '1px solid var(--border, #333)', borderRadius: '5px' }}>
                                <h3 style={{ borderBottom: '2px solid var(--primary, #c4a35a)', paddingBottom: '5px', marginTop: 0 }}>
                                    {building} <span style={{ fontSize: '0.7em', color: 'var(--text-secondary, #aaa)', fontWeight: 'normal' }}>| {type} at {coords}</span>
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
                                    {staff.map(npc => (
                                        <div key={npc.id} className="npc-card" style={{ border: '1px solid var(--border, #333)', padding: '10px', borderRadius: '5px', background: 'var(--bg, #0f0f23)' }}>
                                            <strong>{npc.name}</strong> ({npc.gender} {npc.race}, {npc.age})<br />
                                            <em style={{ color: 'var(--text-secondary, #aaa)' }}>{npc.job}</em><br />
                                            Class: {npc.class} Lvl {npc.level} | {npc.alignment}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="npc-list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {npcs.map((npc) => (
                    <div key={npc.id} style={{
                        border: '1px solid var(--border, #333)',
                        borderRadius: '8px',
                        padding: '15px',
                        backgroundColor: 'var(--surface, #1a1a2e)',
                        boxShadow: '0 2px 5px var(--shadow, rgba(0,0,0,0.3))'
                    }}>
                        <h3 style={{ marginTop: 0, color: 'var(--primary, #c4a35a)' }}>{npc.title} {npc.name}</h3>
                        <div style={{ fontSize: '0.9em', color: 'var(--text-secondary, #aaa)', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 'bold', marginRight: '5px' }}>
                                {npc.gender === 'Male' ? '♂️' : '♀️'}
                            </span>
                            {npc.age}yo {npc.gender} {npc.race} | <strong>{npc.role}</strong> (Lvl {npc.level} {npc.class})
                        </div>
                        <div style={{ marginBottom: '10px' }}>
                            <strong>HP:</strong> {npc.hp.current}/{npc.hp.max} <span style={{ marginLeft: '10px', fontSize: '0.8em' }}>({npc.alignment})</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '5px', marginBottom: '10px', fontSize: '0.9em', textAlign: 'center' }}>
                            {Object.entries(npc.stats).map(([stat, val]) => (
                                <div key={stat} style={{ background: 'var(--bg, #0f0f23)', padding: '3px', borderRadius: '3px' }}>
                                    <div style={{ fontWeight: 'bold' }}>{stat.slice(0, 3)}</div>
                                    <div>{val}</div>
                                </div>
                            ))}
                        </div>

                        <div>
                            <strong>Inventory:</strong>
                            <ul style={{ margin: '5px 0', paddingLeft: '20px', fontSize: '0.9em' }}>
                                {npc.inventory.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                ))}
                            </ul>
                        </div>
                        <div style={{ fontSize: '0.7em', color: 'var(--text-secondary, #888)', marginTop: '10px' }}>
                            Seed: {npc.seed} | ID: {npc.id.slice(0, 8)}...
                        </div>
                    </div>
                ))}
            </div>
            {npcs.length === 0 && !groupedNpcs && <p style={{ textAlign: 'center', color: 'var(--text-secondary, #aaa)' }}>Click a button to generate NPCs</p>}
        </div>
    );
};

export default NPCTest;
