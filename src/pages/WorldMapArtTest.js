// WorldMapArtTest.js  (/debug/world-map-art)
// Iteration harness for the NEW world-map art (src/utils/worldTileArt.js). Renders a
// real generateMapData() world with biome backgrounds + POI sprites + river/path
// overlays + name labels + a player marker — a faithful preview of the eventual
// WorldMapDisplay migration, but isolated so the live component stays untouched.
// Toggle layers and reseed to iterate on the look before going live.

import React, { useMemo, useState } from 'react';
import { generateMapData } from '../utils/mapGenerator';
import { biomeBackground, poiSprite, sampleBiomes, samplePois } from '../utils/worldTileArt';
import WorldMapLabels from '../components/WorldMapLabels';

const TILE = 40;

// Path geometry for river/path overlays (ported from WorldMapDisplay, viewBox 40x40).
const pathSVGs = {
  NORTH_SOUTH: 'M20,0 L20,40', EAST_WEST: 'M0,20 L40,20',
  NORTH_EAST: 'M20,0 Q20,20 40,20', NORTH_WEST: 'M20,0 Q20,20 0,20',
  SOUTH_EAST: 'M20,40 Q20,20 40,20', SOUTH_WEST: 'M20,40 Q20,20 0,20',
  INTERSECTION: 'M20,0 L20,40 M0,20 L40,20',
  START_NORTH: 'M20,20 L20,0', START_SOUTH: 'M20,20 L20,40', START_EAST: 'M20,20 L40,20', START_WEST: 'M20,20 L0,20',
  END_NORTH: 'M20,40 L20,20', END_SOUTH: 'M20,0 L20,20', END_EAST: 'M0,20 L20,20', END_WEST: 'M40,20 L20,20',
};
const BEACH_SHIFT = ['translateY(10px)', 'translateX(-10px)', 'translateY(-10px)', 'translateX(10px)'];

const Overlay = ({ d, stroke, width, opacity, transform }) => (
  <svg viewBox="0 0 40 40" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1, transform }}>
    <path d={d} stroke={stroke} strokeWidth={width} fill="none" opacity={opacity} strokeLinecap="round" />
  </svg>
);

const Swatch = ({ bg, label }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ width: 44, height: 44, backgroundImage: bg, backgroundSize: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
    <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>{label}</div>
  </div>
);

const Toggle = ({ on, set, children }) => (
  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {children}
  </label>
);

const WorldMapArtTest = () => {
  const [seed, setSeed] = useState(4242);
  const [dim, setDim] = useState(20);
  const [zoom, setZoom] = useState(1);
  const [showRivers, setShowRivers] = useState(true);
  const [showPaths, setShowPaths] = useState(true);
  const [showPois, setShowPois] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [theme, setTheme] = useState('grassland');

  // Pass the theme to the real generator (desert is wired end-to-end). For themes whose
  // generation isn't wired yet (snow/swamp/woodland), override the land base biome here so
  // the biome art is still previewable — clearly a debug-only preview, not real generation.
  const THEME_BIOME = { desert: 'desert', snow: 'snow', swamp: 'swamp', woodland: 'woodland' };
  const world = useMemo(() => {
    const m = generateMapData(dim, Math.round(dim * 0.7), seed, {}, theme);
    const biome = THEME_BIOME[theme];
    if (biome) m.flat().forEach((t) => { if (t.biome === 'plains') t.biome = biome; });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim, seed, theme]);
  const heading = { fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' };
  const cols = world[0].length;
  const THEMES = ['grassland', 'desert', 'snow', 'swamp', 'woodland'];

  // Live POI tally — distinguishes "not generated" from "not rendered" while iterating.
  const poiCounts = useMemo(() => {
    const counts = {};
    world.flat().forEach((t) => { if (t.poi) counts[t.poi] = (counts[t.poi] || 0) + 1; });
    return counts;
  }, [world]);

  // Place names for the scroll-label overlay (towns, named mountains, milestone POIs).
  const mapLabels = useMemo(() => {
    const out = [];
    world.flat().forEach((t) => {
      const text = t.townName
        || (t.mountainName && t.isFirstMountainInRange ? t.mountainName : null)
        || (t.milestonePoi ? t.poiName : null);
      if (text) out.push({ x: t.x, y: t.y, text, kind: t.milestonePoi ? 'milestone' : t.townName ? 'town' : 'mountain' });
    });
    return out;
  }, [world]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>World Map Art <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— preview / iteration (not live)</span></h2>

      <section style={{ marginBottom: 24 }}>
        <h3 style={heading}>Biomes</h3>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {Object.entries(sampleBiomes).map(([n, fn]) => <Swatch key={n} bg={fn()} label={n} />)}
        </div>
      </section>

      <section style={{ marginBottom: 24 }}>
        <h3 style={heading}>POIs</h3>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {Object.entries(samplePois).map(([n, fn]) => <Swatch key={n} bg={fn()} label={n} />)}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ ...heading, margin: 0 }}>Generated world</h3>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            theme{' '}
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              {THEMES.map((t) => <option key={t} value={t}>{t}{t === 'desert' || t === 'grassland' ? '' : ' (preview)'}</option>)}
            </select>
          </label>
          <button className="secondary-button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setSeed(Math.floor(Math.random() * 100000))}>🎲 reseed</button>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>size <input type="range" min="12" max="32" step="2" value={dim} onChange={(e) => setDim(Number(e.target.value))} /> {dim}×{Math.round(dim * 0.7)}</label>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>zoom <input type="range" min="0.6" max="2" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
          <Toggle on={showRivers} set={setShowRivers}>rivers</Toggle>
          <Toggle on={showPaths} set={setShowPaths}>paths</Toggle>
          <Toggle on={showPois} set={setShowPois}>POIs</Toggle>
          <Toggle on={showLabels} set={setShowLabels}>labels</Toggle>
          <Toggle on={showGrid} set={setShowGrid}>grid</Toggle>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px' }}>
          POIs generated: {Object.keys(poiCounts).length === 0 ? 'none' :
            Object.entries(poiCounts).sort().map(([k, n]) => `${k}: ${n}`).join(' · ')}
        </p>

        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--surface)' }}>
          <div style={{
            position: 'relative',
            display: 'grid', gridTemplateColumns: `repeat(${cols}, ${TILE}px)`, width: cols * TILE,
            gap: showGrid ? 1 : 0, background: showGrid ? 'var(--border)' : 'transparent',
            transform: `scale(${zoom})`, transformOrigin: 'top left',
          }}>
            {world.flat().map((tile) => {
              const poi = showPois ? poiSprite(tile) : null;
              const beachShift = (tile.biome === 'beach' && tile.beachDirection != null) ? BEACH_SHIFT[tile.beachDirection] : 'none';
              return (
                <div key={`${tile.x},${tile.y}`} style={{
                  width: TILE, height: TILE, backgroundImage: biomeBackground(tile, tile.x, tile.y), backgroundSize: 'cover', position: 'relative',
                }}>
                  {showRivers && tile.hasRiver && tile.biome !== 'water' && (
                    <Overlay d={pathSVGs[tile.riverDirection] || pathSVGs.NORTH_SOUTH} stroke="#3f7cc2" width={4} opacity={0.85} />
                  )}
                  {showPaths && tile.hasPath && (
                    <Overlay d={pathSVGs[tile.pathDirection] || pathSVGs.NORTH_SOUTH} stroke="#7a5230" width={3} opacity={0.8} transform={beachShift} />
                  )}
                  {poi && <div style={{ position: 'absolute', inset: 0, zIndex: 2, backgroundImage: poi, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', transform: beachShift }} />}
                  {tile.isStartingTown && (
                    <>
                      <div style={{ position: 'absolute', inset: 0, zIndex: 3, border: '2px solid #ffcf4d', borderRadius: 2, boxShadow: '0 0 4px rgba(255,207,77,0.8)', pointerEvents: 'none' }} />
                      <span style={{ position: 'absolute', top: -6, right: -3, zIndex: 5, fontSize: 13, pointerEvents: 'none' }}>⭐</span>
                    </>
                  )}
                </div>
              );
            })}
            {showLabels && <WorldMapLabels labels={mapLabels} tile={TILE} />}
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          Real <code>generateMapData()</code> output with <code>worldTileArt</code> biomes/POIs plus river/path overlays, labels,
          and a ⭐ at the starting town. Toggle layers and reseed to iterate. This page is a preview — the live
          <code> WorldMapDisplay</code> is unchanged until we migrate.
        </p>
      </section>
    </div>
  );
};

export default WorldMapArtTest;
