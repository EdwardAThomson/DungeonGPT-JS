// TilesetTest.js  (/debug/tileset)
// Preview harness for the programmatic SVG town tileset (src/utils/townTileArt.js).
// Shows a swatch gallery (terrain + wall autotile variants + building roofs) and a
// REAL generated town (via generateTownMap) rendered with neighbour-based wall
// autotiling — proving the tileset wires straight into the existing town generator,
// before we migrate the live TownMapDisplay.

import React, { useMemo, useState } from 'react';
import { generateTownMap } from '../utils/townMapGenerator';
import { tileBackground, sampleTiles, wallVariant, buildingTile, BUILDING_TYPES, POI_EMOJI } from '../utils/townTileArt';

const SIZES = ['hamlet', 'village', 'town', 'city'];
const TILE = 28;

const isPathType = (t) => t === 'dirt_path' || t === 'stone_path' || t === 'town_square' || t === 'bridge';

// Connectivity report for the path network: component count, orphan tiles, and
// gate/hub membership — the invariants the hub-and-spoke generator guarantees.
const analyzePaths = (town) => {
  const { mapData, width, height } = town;
  const seen = new Set();
  const comps = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isPathType(mapData[y][x].type) || seen.has(`${x},${y}`)) continue;
      const comp = new Set();
      const stack = [[x, y]];
      seen.add(`${x},${y}`);
      while (stack.length) {
        const [cx, cy] = stack.pop();
        comp.add(`${cx},${cy}`);
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          if (!isPathType(mapData[ny][nx].type) || seen.has(`${nx},${ny}`)) continue;
          seen.add(`${nx},${ny}`);
          stack.push([nx, ny]);
        }
      }
      comps.push(comp);
    }
  }
  comps.sort((a, b) => b.size - a.size);
  const main = comps[0] || new Set();
  const orphans = comps.slice(1).reduce((s, c) => s + c.size, 0);
  const gatesOk = (town.entrances || []).every(({ pos }) => main.has(`${pos.x},${pos.y}`));
  const spokes = (town.pathStats?.spokes || []).filter((s) => s.straight >= 4);
  const avg = (f) => (spokes.length ? spokes.reduce((a, s) => a + f(s), 0) / spokes.length : 0);
  return {
    components: comps.length,
    orphans,
    gatesOk,
    hubOk: main.has(`${town.centerPoint.x},${town.centerPoint.y}`),
    pathTiles: seen.size,
    spokes: spokes.length,
    avgBends: avg((s) => s.bends),
    avgRatio: avg((s) => s.length / s.straight),
    main,
  };
};

const Cell = ({ tile, neighbours, theme = 'grassland', overlay = null }) => {
  const bg = tileBackground(tile, neighbours, tile.x, tile.y, theme);
  const emoji = tile.poi ? POI_EMOJI[tile.poi] : null;
  return (
    <div style={{
      width: TILE, height: TILE, backgroundImage: bg, backgroundSize: 'cover',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: overlay ? `inset 0 0 0 2px ${overlay}` : undefined,
    }}>
      {emoji && <span style={{ fontSize: 16, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.4))' }}>{emoji}</span>}
    </div>
  );
};

const Swatch = ({ bg, label, size = 48 }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ width: size, height: size, backgroundImage: bg, backgroundSize: 'cover', borderRadius: 4, border: '1px solid var(--border)' }} />
    <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>{label}</div>
  </div>
);

// River-city report (water towns Phase 1): island size, free island grass (the
// quest-injection floor), distinct bridge crossings to the island, waterway tiles,
// and which venues actually sit on the island.
const analyzeFork = (town) => {
  if (!town.riverFork) return null;
  const { mapData, width, height } = town;
  const islandKeys = new Set(town.riverFork.islandTiles.map((p) => `${p.x},${p.y}`));
  let islandGrass = 0;
  const venues = [];
  for (const p of town.riverFork.islandTiles) {
    const t = mapData[p.y][p.x];
    if (t.type === 'grass' && !t.poi) islandGrass++;
    if (t.type === 'building' && t.buildingType !== 'house') venues.push(t.buildingType);
  }
  const waterway = mapData.flat().filter((t) => t.type === 'water' && t.waterway).length;
  // distinct crossings: connected components of bridge tiles touching island land
  const seen = new Set();
  let bridges = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mapData[y][x].type !== 'bridge' || seen.has(`${x},${y}`)) continue;
      const comp = [];
      const st = [{ x, y }];
      seen.add(`${x},${y}`);
      while (st.length) {
        const c = st.pop();
        comp.push(c);
        for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
          const n = mapData[c.y + dy] && mapData[c.y + dy][c.x + dx];
          if (!n || n.type !== 'bridge' || seen.has(`${c.x + dx},${c.y + dy}`)) continue;
          seen.add(`${c.x + dx},${c.y + dy}`);
          st.push({ x: c.x + dx, y: c.y + dy });
        }
      }
      if (comp.some((c) => [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => islandKeys.has(`${c.x + dx},${c.y + dy}`)))) bridges++;
    }
  }
  return { islandSize: town.riverFork.islandTiles.length, islandGrass, bridges, waterway, venues, islandKeys };
};

const TilesetTest = () => {
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState('town');
  const [seed, setSeed] = useState(12345);
  const [theme, setTheme] = useState('grassland');
  const [showPaths, setShowPaths] = useState(false);
  const [archetype, setArchetype] = useState('standard'); // 'standard' | 'riverfork'
  const [riverDir, setRiverDir] = useState('NORTH_SOUTH');

  const town = useMemo(
    () => (archetype === 'riverfork'
      ? generateTownMap(size, `Demo ${size}`, 'south', seed, true, riverDir, theme, { archetype: 'riverfork' })
      : generateTownMap(size, `Demo ${size}`, 'south', seed, false, 'NORTH_SOUTH', theme)),
    [size, seed, theme, archetype, riverDir]
  );
  const paths = useMemo(() => analyzePaths(town), [town]);
  const fork = useMemo(() => analyzeFork(town), [town]);
  const grid = town.mapData;
  const W = town.width;
  const H = town.height;
  const at = (gx, gy) => (gy >= 0 && gy < H && gx >= 0 && gx < W && grid[gy][gx] ? grid[gy][gx].type : null);

  const wallMasks = [
    { m: 5, label: 'N–S' }, { m: 10, label: 'E–W' }, { m: 3, label: 'corner NE' },
    { m: 6, label: 'corner SE' }, { m: 7, label: 'T-junction' }, { m: 15, label: 'cross' },
    { m: 1, label: 'endpoint' },
  ];
  // Every building type the renderer knows (single source of truth, so new types appear
  // here automatically).
  const buildings = BUILDING_TYPES;

  const heading = { fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Tileset Preview <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— programmatic SVG, no raster assets</span></h2>

      <section style={{ marginBottom: 28 }}>
        <h3 style={heading}>Terrain</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {Object.entries(sampleTiles).map(([name, fn]) => <Swatch key={name} bg={fn()} label={name} />)}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h3 style={heading}>Walls (autotiled) & keep</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {wallMasks.map((w) => <Swatch key={`w${w.m}`} bg={wallVariant(w.m, false)} label={w.label} />)}
          {wallMasks.slice(0, 4).map((w) => <Swatch key={`k${w.m}`} bg={wallVariant(w.m, true)} label={`keep ${w.label}`} />)}
        </div>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h3 style={heading}>Building roofs</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {buildings.map((b) => <Swatch key={b} bg={buildingTile(b, theme)} label={b} />)}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ ...heading, margin: 0 }}>Generated town</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {SIZES.map((s) => {
              // the river-city archetype only exists on town + city grids
              const disabled = archetype === 'riverfork' && (s === 'hamlet' || s === 'village');
              return (
                <button key={s} onClick={() => setSize(s)} disabled={disabled}
                  className={s === size ? 'primary-button' : 'secondary-button'}
                  style={{ padding: '4px 10px', fontSize: 12, opacity: disabled ? 0.4 : 1 }}>{s}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['grassland', 'desert', 'snow'].map((t) => (
              <button key={t} onClick={() => setTheme(t)}
                className={t === theme ? 'primary-button' : 'secondary-button'}
                style={{ padding: '4px 10px', fontSize: 12 }}>{t}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['standard', 'standard'], ['riverfork', 'river city']].map(([val, label]) => (
              <button key={val}
                onClick={() => {
                  setArchetype(val);
                  if (val === 'riverfork' && (size === 'hamlet' || size === 'village')) setSize('town');
                }}
                className={val === archetype ? 'primary-button' : 'secondary-button'}
                style={{ padding: '4px 10px', fontSize: 12 }}>{label}</button>
            ))}
            {archetype === 'riverfork' && (
              <button className="secondary-button" style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => setRiverDir((d) => (d === 'NORTH_SOUTH' ? 'EAST_WEST' : 'NORTH_SOUTH'))}>
                river {riverDir === 'NORTH_SOUTH' ? 'N-S' : 'E-W'}
              </button>
            )}
          </div>
          <button className="secondary-button" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => setSeed(Math.floor(Math.random() * 100000))}>🎲 reseed</button>
          <button className={showPaths ? 'primary-button' : 'secondary-button'} style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => setShowPaths((v) => !v)}>path overlay</button>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            zoom <input type="range" min="0.6" max="2" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{W}×{H} · seed {seed}</span>
        </div>
        {/* Hub-and-spoke network report: these are the invariants the generator guarantees
            (one component, hub + gates on it, no orphan tiles) plus windiness stats. */}
        <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>
          <strong style={{ color: paths.components === 1 && paths.gatesOk && paths.hubOk ? '#3a3' : '#c33' }}>
            {paths.components === 1 ? '✓ 1 path component' : `✗ ${paths.components} path components`}
            {paths.orphans > 0 ? ` (${paths.orphans} orphan tiles!)` : ''}
            {paths.gatesOk ? ' · gates connected' : ' · GATE DISCONNECTED'}
            {paths.hubOk ? ' · hub connected' : ' · HUB DISCONNECTED'}
          </strong>
          {' '}· {paths.pathTiles} path tiles · {paths.spokes} spokes ·
          avg {paths.avgBends.toFixed(1)} bends · length/straight {paths.avgRatio.toFixed(2)}
        </div>
        {/* River-city invariants (water towns Phase 1): island >= 4 free grass
            (quest floor) and >= 2 distinct bridge crossings, per the plan. */}
        {fork && (
          <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>
            <strong style={{ color: fork.bridges >= 2 && fork.islandGrass >= 4 ? '#3a3' : '#c33' }}>
              river city: {fork.bridges} bridge crossing{fork.bridges === 1 ? '' : 's'} to the island
              {' '}· {fork.islandGrass} free island grass
            </strong>
            {' '}· island {fork.islandSize} tiles · {fork.waterway} waterway tiles ·
            island venues: {fork.venues.length ? fork.venues.join(', ') : 'none'}
          </div>
        )}
        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--surface)' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${W}, ${TILE}px)`, width: W * TILE,
            transform: `scale(${zoom})`, transformOrigin: 'top left',
          }}>
            {grid.flatMap((rowArr, gy) =>
              rowArr.map((tile, gx) => {
                const neighbours = { n: at(gx, gy - 1), e: at(gx + 1, gy), s: at(gx, gy + 1), w: at(gx - 1, gy) };
                let overlay = null;
                if (showPaths && isPathType(tile.type)) {
                  overlay = paths.main.has(`${gx},${gy}`) ? 'rgba(80,200,120,0.9)' : 'rgba(230,60,60,0.95)';
                }
                if (showPaths && !overlay && fork && fork.islandKeys.has(`${gx},${gy}`)) {
                  overlay = 'rgba(240,180,50,0.9)'; // river-city island district
                }
                if (showPaths && tile.isGate) overlay = 'rgba(80,140,255,0.95)';
                return <Cell key={`${gx},${gy}`} tile={tile} neighbours={neighbours} theme={theme} overlay={overlay} />;
              })
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          This is the actual <code>generateTownMap()</code> output rendered with the SVG tileset — walls autotile from
          neighbours, zero image files. Reseed to see different layouts. The <em>path overlay</em> outlines the
          hub-and-spoke network (green = connected to the hub, red = orphan — should never appear, blue = gates,
          orange = the river-city island district). The <em>river city</em> archetype (town/city only) carves a windy
          forking river around an island quarter; fork water renders as plain water in this debug cut (art lands in
          Phase 4).
        </p>
      </section>
    </div>
  );
};

export default TilesetTest;
