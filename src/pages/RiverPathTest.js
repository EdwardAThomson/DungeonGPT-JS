// RiverPathTest.js  (/debug/river-path-test)
// Focused harness for investigating stray colored lines reported on the world map (a
// road-brown line cutting across open water, a river-blue line stranded in open grass
// with no water touching it). Renders a REAL generateMapData() world at a specific,
// reproducible seed, with independent toggles for the river/path overlays and biome
// background — so we can rule in/out whether an anomaly comes from the overlay layer
// (rivers/paths drawn as separate <svg> lines on top of tiles) or from the tile art
// itself (biomeBackground/poiSprite in worldTileArt.js). Also runs an automatic data
// scan (no eyeballing required) for the two concrete anomaly shapes: hasPath/hasRiver
// resolving true on a water tile, and river tiles that form a chain touching no water
// tile at all anywhere along their length.

import React, { useEffect, useState } from 'react';
import { generateMapData } from '../utils/mapGenerator';
import { biomeBackground, poiSprite } from '../utils/worldTileArt';
import { useDebugMapSettings } from '../utils/debugMapSettings';
import WorldMapLabels from '../components/WorldMapLabels';
import WorldMapDisplay from '../components/WorldMapDisplay';

const TILE = 40;
const MIN_DIM = 5; // generateMapData isn't built to handle tiny maps (town/lake/mountain
                    // placement assumes some minimum room) — matches WorldMapTest.js's own min.
const MAX_DIM = 60;

// Path geometry for river/path overlays (ported from WorldMapDisplay, viewBox 40x40).
const pathSVGs = {
  NORTH_SOUTH: 'M20,0 L20,40', EAST_WEST: 'M0,20 L40,20',
  NORTH_EAST: 'M20,0 Q20,20 40,20', NORTH_WEST: 'M20,0 Q20,20 0,20',
  SOUTH_EAST: 'M20,40 Q20,20 40,20', SOUTH_WEST: 'M20,40 Q20,20 0,20',
  INTERSECTION: 'M20,0 L20,40 M0,20 L40,20',
  START_NORTH: 'M20,20 L20,0', START_SOUTH: 'M20,20 L20,40', START_EAST: 'M20,20 L40,20', START_WEST: 'M20,20 L0,20',
  END_NORTH: 'M20,40 L20,20', END_SOUTH: 'M20,0 L20,20', END_EAST: 'M0,20 L20,20', END_WEST: 'M40,20 L20,20',
};
const BEACH_SHIFT = [
  'translateY(10px)', 'translateX(-10px)', 'translateY(-10px)', 'translateX(10px)',
  'translate(-7px, 7px)', 'translate(-7px, -7px)', 'translate(7px, -7px)', 'translate(7px, 7px)',
  'translate(-5px, 5px)', 'translate(-5px, -5px)', 'translate(5px, -5px)', 'translate(5px, 5px)',
];

const Overlay = ({ d, stroke, width, opacity, transform }) => (
  <svg viewBox="0 0 40 40" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2, transform }}>
    <path d={d} stroke={stroke} strokeWidth={width} fill="none" opacity={opacity} strokeLinecap="round" />
  </svg>
);

const Toggle = ({ on, set, children }) => (
  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {children}
  </label>
);

const NEIGHBORS4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Data-level scan (no rendering involved) for the two anomaly shapes actually reported:
// an overlay resolving true on a water tile, and a river chain that never touches water.
function analyzeMap(mapData, width, height) {
  const pathOnWater = [];
  const riverOnWater = [];
  const visited = new Set();
  const key = (x, y) => `${x},${y}`;
  const riverComponents = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = mapData[y][x];
      if (t.hasPath && t.biome === 'water') pathOnWater.push({ x, y });
      if (t.hasRiver && t.biome === 'water') riverOnWater.push({ x, y });
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mapData[y][x].hasRiver || visited.has(key(x, y))) continue;
      const stack = [[x, y]];
      visited.add(key(x, y));
      const tiles = [];
      let touchesWater = false;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        tiles.push({ x: cx, y: cy });
        for (const [dx, dy] of NEIGHBORS4) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const nt = mapData[ny][nx];
          if (nt.biome === 'water') touchesWater = true;
          if (nt.hasRiver && !visited.has(key(nx, ny))) {
            visited.add(key(nx, ny));
            stack.push([nx, ny]);
          }
        }
      }
      riverComponents.push({ tiles, touchesWater });
    }
  }

  return { pathOnWater, riverOnWater, riverComponents };
}

const clampDim = (n) => Math.max(MIN_DIM, Math.min(MAX_DIM, n));

const RiverPathTest = () => {
  // Shared across all world-map debug pages (sessionStorage-backed) so switching between
  // this page and world-map-art/world-map-test keeps you looking at the SAME map instead
  // of silently comparing two different seeds, and so navigating away and back doesn't
  // reset what you had set up.
  const [applied, setApplied] = useDebugMapSettings();

  // Pending (raw, uncommitted) input state — separate from the shared/applied settings,
  // so typing "1" on the way to "14" never itself triggers a generation attempt. Only
  // "Generate" (click or Enter) commits these into `applied`. Seeded from whatever the
  // shared settings already were on mount (e.g. set by another debug page).
  const [seedInput, setSeedInput] = useState(String(applied.seed));
  const [widthInput, setWidthInput] = useState(String(applied.width));
  const [heightInput, setHeightInput] = useState(String(applied.height));
  const [theme, setTheme] = useState(applied.theme);

  const [mapData, setMapData] = useState(null);
  const [error, setError] = useState(null);

  const [showRivers, setShowRivers] = useState(true);
  const [showPaths, setShowPaths] = useState(true);
  const [showPois, setShowPois] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showCoords, setShowCoords] = useState(false);
  const [showRealComponent, setShowRealComponent] = useState(true);

  // Regenerate only when `applied` actually changes (i.e. only after a committed
  // Generate), and never let a generator exception take the whole page down with it —
  // show the error and keep whatever map was last showing successfully.
  useEffect(() => {
    try {
      const m = generateMapData(applied.width, applied.height, applied.seed, {}, applied.theme);
      setMapData(m);
      setError(null);
    } catch (e) {
      setError(e && e.message ? e.message : String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  const handleGenerate = () => {
    const seed = parseInt(seedInput, 10);
    const width = clampDim(parseInt(widthInput, 10) || MIN_DIM);
    const height = clampDim(parseInt(heightInput, 10) || MIN_DIM);
    setWidthInput(String(width));
    setHeightInput(String(height));
    setApplied({ seed: Number.isFinite(seed) ? seed : 0, width, height, theme });
  };

  const onEnter = (e) => { if (e.key === 'Enter') handleGenerate(); };

  // Town/mountain/milestone name labels — same computation WorldMapArtTest.js uses, so
  // this page doesn't look like it's "missing town names" compared to that one; it was
  // just an omission in the first pass of this page, not a sign of a different generator.
  const mapLabels = [];
  if (mapData) {
    mapData.flat().forEach((t) => {
      const text = t.townName
        || (t.mountainName && t.isFirstMountainInRange ? t.mountainName : null)
        || (t.milestonePoi ? t.poiName : null);
      if (text) mapLabels.push({ x: t.x, y: t.y, text, kind: t.milestonePoi ? 'milestone' : t.townName ? 'town' : 'mountain' });
    });
  }

  const analysis = mapData ? analyzeMap(mapData, applied.width, applied.height) : null;
  const disconnectedRivers = analysis ? analysis.riverComponents.filter((c) => !c.touchesWater) : [];
  const flagged = new Set();
  if (analysis) {
    analysis.pathOnWater.forEach((p) => flagged.add(`${p.x},${p.y}`));
    analysis.riverOnWater.forEach((p) => flagged.add(`${p.x},${p.y}`));
    disconnectedRivers.forEach((c) => c.tiles.forEach((t) => flagged.add(`${t.x},${t.y}`)));
  }

  const heading = { fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' };
  const cols = mapData ? mapData[0].length : 0;

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>River / Path Test <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— isolating the road-on-water / stranded-river reports</span></h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 760 }}>
        Real <code>generateMapData()</code> output at a specific seed, rendered through the actual <code>biomeBackground</code>/<code>poiSprite</code>
        pipeline. Toggle rivers/paths off to see whether a reported line is the overlay layer or the tile art underneath. Tiles flagged
        by the automatic scan below are outlined in red regardless of toggle state. Edit seed/size/theme then click Generate (or press
        Enter) — nothing regenerates while you're still typing.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          seed{' '}
          <input type="number" value={seedInput} style={{ width: 100 }} onChange={(e) => setSeedInput(e.target.value)} onKeyDown={onEnter} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          size{' '}
          <input type="number" min={MIN_DIM} max={MAX_DIM} value={widthInput} style={{ width: 60 }} onChange={(e) => setWidthInput(e.target.value)} onKeyDown={onEnter} />
          {' x '}
          <input type="number" min={MIN_DIM} max={MAX_DIM} value={heightInput} style={{ width: 60 }} onChange={(e) => setHeightInput(e.target.value)} onKeyDown={onEnter} />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          theme{' '}
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="grassland">grassland</option>
            <option value="desert">desert</option>
            <option value="snow">snow</option>
          </select>
        </label>
        <button className="secondary-button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleGenerate}>Generate</button>
        <Toggle on={showRivers} set={setShowRivers}>rivers</Toggle>
        <Toggle on={showPaths} set={setShowPaths}>paths</Toggle>
        <Toggle on={showPois} set={setShowPois}>POIs</Toggle>
        <Toggle on={showLabels} set={setShowLabels}>labels</Toggle>
        <Toggle on={showGrid} set={setShowGrid}>grid</Toggle>
        <Toggle on={showCoords} set={setShowCoords}>coordinates</Toggle>
        <Toggle on={showRealComponent} set={setShowRealComponent}>real WorldMapDisplay (below)</Toggle>
      </div>

      {error && (
        <section style={{ marginBottom: 16, padding: 10, border: '1px solid #e03131', borderRadius: 8, background: 'rgba(224,49,49,0.08)' }}>
          <strong style={{ color: '#e03131' }}>Generation failed</strong>
          <p style={{ fontSize: 13, margin: '4px 0 0', fontFamily: 'monospace' }}>{error}</p>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0' }}>Showing the last map that generated successfully, if any.</p>
        </section>
      )}

      {mapData && (
        <>
          <section style={{ marginBottom: 16, padding: 10, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
            <h3 style={{ ...heading, margin: '0 0 6px' }}>Automatic scan</h3>
            {analysis.pathOnWater.length === 0 && analysis.riverOnWater.length === 0 && disconnectedRivers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>No anomalies found in this map's data (seed {applied.seed}, {applied.width}x{applied.height}, {applied.theme}).</p>
            ) : (
              <ul style={{ fontSize: 13, color: 'var(--text)', margin: 0, paddingLeft: 18 }}>
                {analysis.pathOnWater.length > 0 && (
                  <li><strong>{analysis.pathOnWater.length}</strong> path tile(s) resolve on water (the road-brown-in-water report): {analysis.pathOnWater.map((p) => `(${p.x},${p.y})`).join(', ')}</li>
                )}
                {analysis.riverOnWater.length > 0 && (
                  <li><strong>{analysis.riverOnWater.length}</strong> river tile(s) resolve on water (shouldn't happen): {analysis.riverOnWater.map((p) => `(${p.x},${p.y})`).join(', ')}</li>
                )}
                {disconnectedRivers.length > 0 && (
                  <li><strong>{disconnectedRivers.length}</strong> river chain(s) touch no water tile anywhere along their length (the stranded-river report):
                    <ul>
                      {disconnectedRivers.map((c, i) => (
                        <li key={i}>{c.tiles.length} tile(s): {c.tiles.map((t) => `(${t.x},${t.y})`).join(', ')}</li>
                      ))}
                    </ul>
                  </li>
                )}
              </ul>
            )}
          </section>

          <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--surface)' }}>
            <div style={{
              position: 'relative', display: 'grid', gridTemplateColumns: `repeat(${cols}, ${TILE}px)`, width: cols * TILE,
              gap: showGrid ? 1 : 0, background: showGrid ? 'var(--border)' : 'transparent',
            }}>
              {mapData.flat().map((tile) => {
                const poi = showPois ? poiSprite(tile) : null;
                const beachShift = (tile.biome === 'beach' && tile.beachDirection != null) ? BEACH_SHIFT[tile.beachDirection] : 'none';
                const isFlagged = flagged.has(`${tile.x},${tile.y}`);
                return (
                  <div key={`${tile.x},${tile.y}`} style={{
                    width: TILE, height: TILE, backgroundImage: biomeBackground(tile, tile.x, tile.y, mapData), backgroundSize: 'cover', position: 'relative',
                    outline: isFlagged ? '2px solid #e03131' : 'none', outlineOffset: -2, zIndex: isFlagged ? 3 : 'auto',
                  }}>
                    {/* River/path overlays and the POI sprite get a beachShift nudge on
                        beach tiles — that moves the WHOLE absolutely-positioned box, and
                        with nothing clipping it, the shifted box paints over the
                        neighbouring tile (this was the actual root cause of the reported
                        road/river-coloured line showing up in an adjacent tile that has
                        no path/river of its own — confirmed by reproducing it directly and
                        fixing it here). */}
                    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
                      {showRivers && tile.hasRiver && tile.biome !== 'water' && (
                        <Overlay d={pathSVGs[tile.riverDirection] || pathSVGs.NORTH_SOUTH} stroke="#3f7cc2" width={4} opacity={0.85} />
                      )}
                      {showPaths && tile.hasPath && tile.biome !== 'water' && (
                        <Overlay d={pathSVGs[tile.pathDirection] || pathSVGs.NORTH_SOUTH} stroke="#7a5230" width={3} opacity={0.8} transform={beachShift} />
                      )}
                      {poi && <div style={{ position: 'absolute', inset: 0, zIndex: 2, backgroundImage: poi, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center', transform: beachShift }} />}
                    </div>
                    {showCoords && (
                      <span style={{ position: 'absolute', top: 1, left: 2, fontSize: 8, color: '#fff', textShadow: '0 0 2px #000, 0 0 2px #000' }}>{tile.x},{tile.y}</span>
                    )}
                  </div>
                );
              })}
              {showLabels && <WorldMapLabels labels={mapLabels} tile={TILE} />}
            </div>
          </div>

          {showRealComponent && (
            <section style={{ marginTop: 20 }}>
              <h3 style={{ ...heading, margin: '0 0 6px' }}>Same exact map data, rendered by the REAL WorldMapDisplay component</h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 8px', maxWidth: 760 }}>
                This is the literal component `world-map-test`/the live game uses — not a reimplementation. If a defect
                shows up here but not in the grid above (same `mapData` object, same seed), it's specific to
                `WorldMapDisplay.js`'s own rendering code, not the map generator or the shared tile-art functions. Player
                position is set off-map so no marker is drawn.
              </p>
              <WorldMapDisplay mapData={mapData} playerPosition={{ x: -1, y: -1 }} onTileClick={() => {}} />
            </section>
          )}
        </>
      )}
    </div>
  );
};

export default RiverPathTest;
