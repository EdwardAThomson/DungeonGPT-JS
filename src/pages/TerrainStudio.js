import React, { useState, useMemo } from 'react';
import WorldMapDisplay3D from '../experimental/components/WorldMapDisplay3D';
import { generateOrganicMap } from '../experimental/mapGen/organicGenerator';

const Minimap = ({ mapData }) => {
    const width = mapData[0].length;
    const height = mapData.length;

    const canvasRef = React.useRef(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const scale = canvas.width / width;

        mapData.forEach((row, y) => {
            row.forEach((tile, x) => {
                let color = '#c3e6cb'; // plains
                if (tile.biome === 'deep_water') color = '#1a4e8a';
                else if (tile.biome === 'water') color = '#4a90e2';
                else if (tile.biome === 'beach') color = '#f0e68c';
                else if (tile.poi === 'forest') color = '#2d5a27';
                else if (tile.poi === 'mountain') color = '#8b8b8b';

                ctx.fillStyle = color;
                ctx.fillRect(x * scale, y * scale, scale, scale);
            });
        });
    }, [mapData, width, height]);

    return (
        <div className="minimap-container" style={{
            position: 'relative',
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            border: '8px solid #a67c52',
            overflow: 'hidden',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            backgroundColor: '#f0e68c'
        }}>
            <canvas ref={canvasRef} width={180} height={180} />
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', color: '#ffd700', fontSize: '12px', fontWeight: 'bold' }}>N</div>
        </div>
    );
};

const TerrainStudio = () => {
    const [seed, setSeed] = useState('324234234');
    const [resolution, setResolution] = useState(40);
    const [mountainDensity, setMountainDensity] = useState(40);
    const [forestDensity, setForestDensity] = useState(40);
    const [hillDensity, setHillDensity] = useState(50);
    const [waterLevel, setWaterLevel] = useState(50);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [viewMode, setViewMode] = useState('3d'); // '3d' or '2d'
    const [mapData, setMapData] = useState(() => generateOrganicMap(40, 40, parseInt('324234234') || 12345, {
        mountainThreshold: 0.52,
        forestThreshold: 0.6,
        hillDensity: 50,
        waterLevel: 50
    }));

    const handleGenerate = () => {
        // Map 0-100 sliders to thresholds (Linearized mapping)
        // Mountain: 0% -> 0.8 (sparse), 100% -> 0.1 (dense)
        const mThreshold = 0.8 - (mountainDensity * 0.007);
        // Forest: 0% -> 0.0 (sparse), 100% -> 1.5 (dense)
        const fThreshold = forestDensity * 0.015;

        const newMap = generateOrganicMap(resolution, resolution, parseInt(seed) || Math.floor(Math.random() * 1000000), {
            mountainThreshold: mThreshold,
            forestThreshold: fThreshold,
            hillDensity: hillDensity,
            waterLevel: waterLevel
        });
        setMapData(newMap);
    };

    return (
        <div style={{
            position: 'fixed',
            top: '72px',
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: '#000',
            color: '#fff',
            fontFamily: 'Inter, sans-serif',
            overflow: 'hidden',
            zIndex: 100
        }}>
            {/* Main Background Map */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
                <WorldMapDisplay3D mapData={mapData} isOrthographic={viewMode === '2d'} />
            </div>

            {/* Floating Sidebar */}
            <div style={{
                position: 'absolute',
                top: '20px',
                left: isSidebarOpen ? '20px' : '-280px',
                width: '300px',
                height: 'calc(100% - 40px)',
                background: 'rgba(26, 26, 26, 0.85)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '20px',
                borderRadius: '12px',
                zIndex: 10,
                transition: 'left 0.3s ease-out',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                    <h2 style={{ color: '#4a90e2', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '1rem', margin: 0 }}>Terrain Generator</h2>
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem' }}
                    >
                        {isSidebarOpen ? '◀' : '▶'}
                    </button>
                </div>

                {isSidebarOpen && (
                    <>
                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', color: '#aaa', marginBottom: '8px', fontSize: '0.7rem' }}>SEED</label>
                            <input
                                type="text"
                                value={seed}
                                onChange={(e) => setSeed(e.target.value)}
                                style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '6px' }}
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', color: '#aaa', marginBottom: '8px', fontSize: '0.7rem' }}>RESOLUTION</label>
                            <input
                                type="range"
                                min="20"
                                max="100"
                                value={resolution}
                                onChange={(e) => setResolution(parseInt(e.target.value))}
                                style={{ width: '100%', accentColor: '#4a90e2' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#4a90e2' }}>{resolution} x {resolution}</span>
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>Tiles: {resolution * resolution}</span>
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', color: '#aaa', marginBottom: '8px', fontSize: '0.7rem' }}>MOUNTAIN DENSITY</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={mountainDensity}
                                onChange={(e) => setMountainDensity(parseInt(e.target.value))}
                                style={{ width: '100%', accentColor: '#8b8b8b' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#8b8b8b' }}>{mountainDensity}%</span>
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>Peaks</span>
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', color: '#aaa', marginBottom: '8px', fontSize: '0.7rem' }}>FOREST DENSITY</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={forestDensity}
                                onChange={(e) => setForestDensity(parseInt(e.target.value))}
                                style={{ width: '100%', accentColor: '#2d5a27' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#2d5a27' }}>{forestDensity}%</span>
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>Greenery</span>
                            </div>
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <label style={{ display: 'block', color: '#aaa', marginBottom: '8px', fontSize: '0.7rem' }}>HILL DENSITY</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={hillDensity}
                                onChange={(e) => setHillDensity(parseInt(e.target.value))}
                                style={{ width: '100%', accentColor: '#a67c52' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#a67c52' }}>{hillDensity}%</span>
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>Relief</span>
                            </div>
                        </div>

                        <div style={{ marginBottom: '30px' }}>
                            <label style={{ display: 'block', color: '#aaa', marginBottom: '8px', fontSize: '0.7rem' }}>WATER LEVEL</label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={waterLevel}
                                onChange={(e) => setWaterLevel(parseInt(e.target.value))}
                                style={{ width: '100%', accentColor: '#4a90e2' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                                <span style={{ fontSize: '0.75rem', color: '#4a90e2' }}>{waterLevel}%</span>
                                <span style={{ fontSize: '0.75rem', color: '#666' }}>Sea Level</span>
                            </div>
                        </div>

                        <button
                            onClick={handleGenerate}
                            style={{
                                width: '100%',
                                padding: '14px',
                                background: 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)',
                                border: 'none',
                                color: '#fff',
                                fontWeight: 'bold',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(74, 144, 226, 0.3)',
                                transition: 'transform 0.1s, filter 0.2s'
                            }}
                            onMouseEnter={(e) => e.target.style.filter = 'brightness(1.1)'}
                            onMouseLeave={(e) => e.target.style.filter = 'brightness(1.0)'}
                            onMouseDown={(e) => e.target.style.transform = 'scale(0.98)'}
                            onMouseUp={(e) => e.target.style.transform = 'scale(1)'}
                        >
                            GENERATE WORLD
                        </button>

                        <div style={{ marginTop: 'auto', padding: '15px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.8rem', color: '#666' }}>ANALYSIS</h4>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '5px' }}>
                                <span style={{ color: '#888' }}>Land Coverage:</span>
                                <span style={{ color: '#4a90e2', fontWeight: 'bold' }}>{Math.round((mapData.flat().filter(t => t.biome !== 'water' && t.biome !== 'deep_water').length / (resolution * resolution)) * 100)}%</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                <span style={{ color: '#888' }}>Map Hash:</span>
                                <span style={{ color: '#666', fontFamily: 'monospace' }}>{Math.abs(seed.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0)).toString(16).slice(0, 6)}</span>
                            </div>
                        </div>
                    </>
                )}

                {/* Re-open button when collapsed */}
                {!isSidebarOpen && (
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        style={{
                            position: 'absolute',
                            top: '0',
                            right: '-50px',
                            width: '40px',
                            height: '40px',
                            background: '#4a90e2',
                            border: 'none',
                            borderRadius: '0 8px 8px 0',
                            color: '#fff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.2rem',
                            boxShadow: '4px 0 15px rgba(0,0,0,0.3)'
                        }}
                    >
                        ▶
                    </button>
                )}
            </div>

            {/* Top Right Floating Components */}
            <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '20px' }}>
                <Minimap mapData={mapData} />

                {/* View Controls */}
                <div style={{
                    background: 'rgba(26, 26, 26, 0.8)',
                    backdropFilter: 'blur(5px)',
                    padding: '8px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    gap: '5px'
                }}>
                    <button
                        onClick={() => setViewMode('3d')}
                        style={{
                            background: viewMode === '3d' ? '#4a90e2' : 'transparent',
                            border: 'none',
                            color: viewMode === '3d' ? '#fff' : '#888',
                            padding: '8px 15px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        3D VIEW
                    </button>
                    <button
                        onClick={() => setViewMode('2d')}
                        style={{
                            background: viewMode === '2d' ? '#4a90e2' : 'transparent',
                            border: 'none',
                            color: viewMode === '2d' ? '#fff' : '#888',
                            padding: '8px 15px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        2D MAP
                    </button>
                </div>
            </div>

            {/* Controls Overlay Footer */}
            <div style={{
                position: 'absolute',
                bottom: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(3px)',
                padding: '10px 20px',
                borderRadius: '30px',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: '0.7rem',
                color: '#aaa',
                zIndex: 5,
                display: 'flex',
                gap: '20px'
            }}>
                {viewMode === '3d' ? (
                    <>
                        <span>🖱️ <b>Rotate:</b> Drag / Q-E</span>
                        <span>🖱️ <b>Pan:</b> Right Click / WASD</span>
                        <span>🖱️ <b>Zoom:</b> Scroll</span>
                    </>
                ) : (
                    <>
                        <span>🖱️ <b>Pan:</b> Drag / WASD</span>
                        <span>🖱️ <b>Zoom:</b> Scroll</span>
                        <span style={{ color: '#4a90e2' }}>📍 Top-Down Render</span>
                    </>
                )}
            </div>
        </div>
    );
};

export default TerrainStudio;
