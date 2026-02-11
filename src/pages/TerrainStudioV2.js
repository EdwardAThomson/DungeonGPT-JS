import React, { useState, useMemo, useCallback } from 'react';
import TerrainMesh3D from '../experimental/components/TerrainMesh3D';
import { generateLayeredTerrain } from '../experimental/mapGen/layeredGenerator';

// ─── Minimap ───────────────────────────────────────────────────────────────────
const Minimap = ({ heightmap, width, height }) => {
    const canvasRef = React.useRef(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !heightmap) return;
        const ctx = canvas.getContext('2d');
        const scale = canvas.width / width;

        let min = Infinity, max = -Infinity;
        for (let i = 0; i < heightmap.length; i++) {
            if (heightmap[i] < min) min = heightmap[i];
            if (heightmap[i] > max) max = heightmap[i];
        }
        const range = max - min || 1;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const h = (heightmap[y * width + x] - min) / range;
                let color;
                if (h < 0.28) color = `rgb(${Math.floor(20 + h * 100)}, ${Math.floor(60 + h * 180)}, ${Math.floor(140 + h * 100)})`;
                else if (h < 0.35) color = '#f0e6a8';
                else if (h < 0.60) color = `rgb(${Math.floor(60 + (1 - h) * 80)}, ${Math.floor(140 + (1 - h) * 60)}, ${Math.floor(50 + (1 - h) * 30)})`;
                else if (h < 0.80) color = `rgb(${Math.floor(90 + h * 40)}, ${Math.floor(80 + h * 20)}, ${Math.floor(50 + h * 20)})`;
                else color = `rgb(${Math.floor(180 + h * 60)}, ${Math.floor(180 + h * 60)}, ${Math.floor(180 + h * 60)})`;

                ctx.fillStyle = color;
                ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
            }
        }
    }, [heightmap, width, height]);

    return (
        <div style={{
            position: 'relative',
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            border: '8px solid #a67c52',
            overflow: 'hidden',
            boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
            backgroundColor: '#1a4e8a'
        }}>
            <canvas ref={canvasRef} width={180} height={180} />
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', color: '#ffd700', fontSize: '12px', fontWeight: 'bold' }}>N</div>
        </div>
    );
};

// ─── Slider Component ──────────────────────────────────────────────────────────
const Slider = ({ label, value, min, max, step = 1, color = '#4a90e2', unit = '', onChange }) => (
    <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: '#aaa', marginBottom: '6px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</label>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: color }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
            <span style={{ fontSize: '0.75rem', color, fontWeight: 'bold' }}>{value}{unit}</span>
            <span style={{ fontSize: '0.7rem', color: '#555' }}>{min}–{max}</span>
        </div>
    </div>
);

// ─── Default Params ────────────────────────────────────────────────────────────
const defaultSeed = 42;
const defaultResolution = 256;

const buildParams = (seed, octaves, persistence, seaLevel, warpStrength, exponent, erosionEnabled, erosionParticles) => ({
    seed: parseInt(seed) || 42,
    terrain: { octaves, persistence, lacunarity: 2.0, baseFreq: 0.01 },
    continent: { freq: 0.005, seaLevel: (seaLevel - 50) * 0.008 },
    warp: { strength: warpStrength, freq: 0.008 },
    exponent,
    erosion: erosionEnabled ? { particles: erosionParticles, erosionRate: 0.3, depositionRate: 0.3, evaporationRate: 0.01 } : null
});

// ─── Page ──────────────────────────────────────────────────────────────────────
const TerrainStudioV2 = () => {
    const [seed, setSeed] = useState(String(defaultSeed));
    const [resolution, setResolution] = useState(defaultResolution);
    const [octaves, setOctaves] = useState(6);
    const [persistence, setPersistence] = useState(0.5);
    const [seaLevel, setSeaLevel] = useState(30);
    const [warpStrength, setWarpStrength] = useState(1.5);
    const [exponent, setExponent] = useState(1.5);
    const [erosionEnabled, setErosionEnabled] = useState(false);
    const [erosionParticles, setErosionParticles] = useState(70000);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [viewMode, setViewMode] = useState('3d');
    const [generating, setGenerating] = useState(false);

    // Initial terrain
    const [terrainData, setTerrainData] = useState(() =>
        generateLayeredTerrain(defaultResolution, defaultResolution, buildParams(defaultSeed, 6, 0.5, 30, 1.5, 1.5, false, 70000))
    );

    const handleGenerate = useCallback(() => {
        setGenerating(true);
        // Use setTimeout to let the UI update before heavy computation
        setTimeout(() => {
            const data = generateLayeredTerrain(resolution, resolution,
                buildParams(seed, octaves, persistence, seaLevel, warpStrength, exponent, erosionEnabled, erosionParticles)
            );
            setTerrainData(data);
            setGenerating(false);
        }, 50);
    }, [seed, resolution, octaves, persistence, seaLevel, warpStrength, exponent, erosionEnabled, erosionParticles]);

    return (
        <div style={{
            position: 'fixed', top: '72px', left: 0, right: 0, bottom: 0,
            backgroundColor: '#000', color: '#fff',
            fontFamily: 'Inter, sans-serif', overflow: 'hidden', zIndex: 100
        }}>
            {/* 3D Viewport */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1 }}>
                <TerrainMesh3D terrainData={terrainData} isOrthographic={viewMode === '2d'} />
            </div>

            {/* Generating overlay */}
            {generating && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'rgba(26,26,26,0.9)', padding: '30px 50px',
                        borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: '1rem', color: '#4a90e2', fontWeight: 'bold',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
                    }}>
                        Generating terrain…
                    </div>
                </div>
            )}

            {/* Floating Sidebar */}
            <div style={{
                position: 'absolute', top: '20px',
                left: isSidebarOpen ? '20px' : '-300px',
                width: '320px',
                height: 'calc(100% - 40px)',
                background: 'rgba(26, 26, 26, 0.88)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '20px',
                borderRadius: '12px',
                zIndex: 10,
                transition: 'left 0.3s ease-out',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <h2 style={{ color: '#4a90e2', textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.9rem', margin: 0 }}>
                        Layered Terrain <span style={{ color: '#666', fontSize: '0.7rem' }}>v2</span>
                    </h2>
                    <button
                        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem' }}
                    >
                        {isSidebarOpen ? '◀' : '▶'}
                    </button>
                </div>

                {isSidebarOpen && (
                    <>
                        {/* Seed */}
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', color: '#aaa', marginBottom: '6px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Seed</label>
                            <input
                                type="text"
                                value={seed}
                                onChange={(e) => setSeed(e.target.value)}
                                style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid #444', color: '#fff', padding: '10px', borderRadius: '6px', boxSizing: 'border-box' }}
                            />
                        </div>

                        <Slider label="Resolution" value={resolution} min={64} max={512} step={16} color="#4a90e2" unit="px" onChange={setResolution} />

                        {/* Section: Noise */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', marginTop: '4px', marginBottom: '8px' }}>
                            <div style={{ fontSize: '0.65rem', color: '#555', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Noise Layers</div>
                        </div>

                        <Slider label="Octaves" value={octaves} min={2} max={8} color="#66bb6a" onChange={setOctaves} />
                        <Slider label="Persistence (Roughness)" value={persistence} min={0.3} max={0.7} step={0.05} color="#66bb6a" onChange={setPersistence} />
                        <Slider label="Sea Level" value={seaLevel} min={0} max={100} color="#4a90e2" unit="%" onChange={setSeaLevel} />

                        {/* Section: Shaping */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', marginTop: '4px', marginBottom: '8px' }}>
                            <div style={{ fontSize: '0.65rem', color: '#555', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Shaping</div>
                        </div>

                        <Slider label="Domain Warp Strength" value={warpStrength} min={0} max={2.5} step={0.1} color="#ab47bc" onChange={setWarpStrength} />
                        <Slider label="Peak Exponent" value={exponent} min={1.0} max={3.0} step={0.1} color="#ff7043" onChange={setExponent} />

                        {/* Section: Erosion */}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', marginTop: '4px', marginBottom: '8px' }}>
                            <div style={{ fontSize: '0.65rem', color: '#555', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '12px' }}>Erosion</div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <label style={{ position: 'relative', display: 'inline-block', width: '40px', height: '22px' }}>
                                <input
                                    type="checkbox"
                                    checked={erosionEnabled}
                                    onChange={(e) => setErosionEnabled(e.target.checked)}
                                    style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span style={{
                                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                                    backgroundColor: erosionEnabled ? '#4a90e2' : '#333',
                                    borderRadius: '22px', transition: '0.3s'
                                }}>
                                    <span style={{
                                        position: 'absolute', height: '16px', width: '16px',
                                        left: erosionEnabled ? '20px' : '3px', bottom: '3px',
                                        backgroundColor: '#fff', borderRadius: '50%', transition: '0.3s'
                                    }} />
                                </span>
                            </label>
                            <span style={{ color: erosionEnabled ? '#4a90e2' : '#666', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                Hydraulic Erosion
                            </span>
                        </div>

                        {erosionEnabled && (
                            <Slider label="Erosion Particles" value={erosionParticles} min={10000} max={200000} step={10000} color="#ef5350" unit="" onChange={setErosionParticles} />
                        )}

                        {/* Generate Button */}
                        <button
                            onClick={handleGenerate}
                            disabled={generating}
                            style={{
                                width: '100%', padding: '14px', marginTop: '8px',
                                background: generating
                                    ? '#333'
                                    : 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)',
                                border: 'none', color: '#fff', fontWeight: 'bold',
                                borderRadius: '8px', cursor: generating ? 'wait' : 'pointer',
                                boxShadow: '0 4px 15px rgba(74, 144, 226, 0.3)',
                                transition: 'transform 0.1s, filter 0.2s',
                                textTransform: 'uppercase', letterSpacing: '2px', fontSize: '0.8rem'
                            }}
                            onMouseEnter={(e) => !generating && (e.target.style.filter = 'brightness(1.1)')}
                            onMouseLeave={(e) => (e.target.style.filter = 'brightness(1.0)')}
                            onMouseDown={(e) => !generating && (e.target.style.transform = 'scale(0.98)')}
                            onMouseUp={(e) => (e.target.style.transform = 'scale(1)')}
                        >
                            {generating ? 'Generating…' : 'Generate World'}
                        </button>

                        {/* Stats */}
                        <div style={{ marginTop: 'auto', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '0.7rem', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>Analysis</h4>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                                <span style={{ color: '#888' }}>Resolution:</span>
                                <span style={{ color: '#4a90e2', fontWeight: 'bold' }}>{resolution} × {resolution}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '4px' }}>
                                <span style={{ color: '#888' }}>Vertices:</span>
                                <span style={{ color: '#4a90e2', fontFamily: 'monospace' }}>{(resolution * resolution).toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                                <span style={{ color: '#888' }}>Layers:</span>
                                <span style={{ color: '#66bb6a', fontWeight: 'bold' }}>{erosionEnabled ? 5 : 4} active</span>
                            </div>
                        </div>
                    </>
                )}

                {/* Re-open button when collapsed */}
                {!isSidebarOpen && (
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        style={{
                            position: 'absolute', top: '0', right: '-50px',
                            width: '40px', height: '40px',
                            background: '#4a90e2', border: 'none', borderRadius: '0 8px 8px 0',
                            color: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.2rem', boxShadow: '4px 0 15px rgba(0,0,0,0.3)'
                        }}
                    >
                        ▶
                    </button>
                )}
            </div>

            {/* Top Right: Minimap + View Toggle */}
            <div style={{ position: 'absolute', top: '20px', right: '20px', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '20px' }}>
                {terrainData && <Minimap heightmap={terrainData.heightmap} width={terrainData.width} height={terrainData.height} />}

                <div style={{
                    background: 'rgba(26, 26, 26, 0.8)',
                    backdropFilter: 'blur(5px)',
                    padding: '8px', borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', gap: '5px'
                }}>
                    <button
                        onClick={() => setViewMode('3d')}
                        style={{
                            background: viewMode === '3d' ? '#4a90e2' : 'transparent',
                            border: 'none', color: viewMode === '3d' ? '#fff' : '#888',
                            padding: '8px 15px', borderRadius: '8px',
                            fontSize: '0.75rem', fontWeight: 'bold',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        3D VIEW
                    </button>
                    <button
                        onClick={() => setViewMode('2d')}
                        style={{
                            background: viewMode === '2d' ? '#4a90e2' : 'transparent',
                            border: 'none', color: viewMode === '2d' ? '#fff' : '#888',
                            padding: '8px 15px', borderRadius: '8px',
                            fontSize: '0.75rem', fontWeight: 'bold',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }}
                    >
                        2D MAP
                    </button>
                </div>
            </div>

            {/* Controls Footer */}
            <div style={{
                position: 'absolute', bottom: '20px',
                left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(3px)',
                padding: '10px 20px', borderRadius: '30px',
                border: '1px solid rgba(255,255,255,0.1)',
                fontSize: '0.7rem', color: '#aaa', zIndex: 5,
                display: 'flex', gap: '20px'
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

export default TerrainStudioV2;
