// TilesetTest.js  (/debug/tileset)
// Preview harness for the programmatic SVG town tileset (src/utils/townTileArt.js).
// Shows a swatch gallery (terrain + wall autotile variants + building roofs) and a
// REAL generated town (via generateTownMap) rendered with neighbour-based wall
// autotiling — proving the tileset wires straight into the existing town generator,
// before we migrate the live TownMapDisplay.

import React, { useMemo, useState } from 'react';
import { generateTownMap } from '../utils/townMapGenerator';
import { tileBackground, sampleTiles, wallVariant, buildingTile, canalTile, canalBridgeTile, quayVariant, waterwayMask, BUILDING_TYPES, POI_EMOJI } from '../utils/townTileArt';

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

const Cell = ({ tile, neighbours, theme = 'grassland', overlay = null, wet = 0 }) => {
  const bg = tileBackground(tile, neighbours, tile.x, tile.y, theme, wet);
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

// Canal-city report (water towns Phase 2): basin size, canal tiles, bridge count,
// spokes, and the per-district free grass floors — the invariants the archetype's
// seed-survey tests assert.
const analyzeCanal = (town) => {
  if (!town.canal) return null;
  const { mapData } = town;
  const flat = mapData.flat();
  const canalWater = flat.filter((t) => t.type === 'water' && t.waterway).length;
  const bridges = flat.filter((t) => t.type === 'bridge').length;
  const freeGrass = flat.filter((t) => t.type === 'grass' && !t.poi).length;
  const districtGrass = town.canal.districts.map((d) =>
    d.filter((p) => mapData[p.y][p.x].type === 'grass' && !mapData[p.y][p.x].poi).length);
  const boathouse = flat.find((t) => t.type === 'building' && t.buildingType === 'boathouse');
  const districtKeys = new Set(town.canal.districts.flat().map((p) => `${p.x},${p.y}`));
  const basinKeys = new Set(town.canal.basin.map((p) => `${p.x},${p.y}`));
  return {
    basinSize: town.canal.basin.length,
    canalTiles: town.canal.canalTileCount,
    canalWater,
    spokes: town.canal.spokes,
    bridges,
    freeGrass,
    districtGrass,
    hasBoathouse: !!boathouse,
    districtKeys,
    basinKeys,
  };
};

const TilesetTest = () => {
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState('town');
  const [seed, setSeed] = useState(12345);
  const [theme, setTheme] = useState('grassland');
  const [showPaths, setShowPaths] = useState(false);
  const [archetype, setArchetype] = useState('standard'); // 'standard' | 'riverfork' | 'canal'
  const [riverDir, setRiverDir] = useState('NORTH_SOUTH');
  const [seaEdge, setSeaEdge] = useState('E'); // canal city: which edge the sea floods

  const town = useMemo(
    () => (archetype === 'riverfork'
      ? generateTownMap(size, `Demo ${size}`, 'south', seed, true, riverDir, theme, { archetype: 'riverfork' })
      : archetype === 'canal'
        ? generateTownMap(size, `Demo ${size}`, 'south', seed, false, 'NORTH_SOUTH', theme,
            { kind: 'coast', edges: { N: seaEdge === 'N', E: seaEdge === 'E', S: seaEdge === 'S', W: seaEdge === 'W' }, archetype: 'canal' })
        : generateTownMap(size, `Demo ${size}`, 'south', seed, false, 'NORTH_SOUTH', theme)),
    [size, seed, theme, archetype, riverDir, seaEdge]
  );
  const paths = useMemo(() => analyzePaths(town), [town]);
  const fork = useMemo(() => analyzeFork(town), [town]);
  const canal = useMemo(() => analyzeCanal(town), [town]);
  const grid = town.mapData;
  const W = town.width;
  const H = town.height;
  const tileObjAt = (gx, gy) => (gy >= 0 && gy < H && gx >= 0 && gx < W && grid[gy][gx] ? grid[gy][gx] : null);
  const at = (gx, gy) => { const t = tileObjAt(gx, gy); return t ? t.type : null; };

  const wallMasks = [
    { m: 5, label: 'N–S' }, { m: 10, label: 'E–W' }, { m: 3, label: 'corner NE' },
    { m: 6, label: 'corner SE' }, { m: 7, label: 'T-junction' }, { m: 15, label: 'cross' },
    { m: 1, label: 'endpoint' },
  ];
  // Full directional canal vocabulary (water towns Phase 4): all 16 waterway-neighbour
  // masks, labelled by what the shape reads as. Masks with 3-4 wet neighbours double as
  // the basin treatment (open water, bank only on dry edges, corner nibs).
  const canalMasks = [
    { m: 0, label: 'pool (walled)' },
    { m: 1, label: 'end, open N' }, { m: 2, label: 'end, open E' }, { m: 4, label: 'end, open S' }, { m: 8, label: 'end, open W' },
    { m: 5, label: 'straight N-S' }, { m: 10, label: 'straight E-W' },
    { m: 3, label: 'bend NE' }, { m: 6, label: 'bend SE' }, { m: 12, label: 'bend SW' }, { m: 9, label: 'bend NW' },
    { m: 7, label: 'T, bank W' }, { m: 14, label: 'T, bank N' }, { m: 13, label: 'T, bank E' }, { m: 11, label: 'T, bank S' },
    { m: 15, label: 'cross / basin' },
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
        <h3 style={heading}>Canals (autotiled): banks follow the theme ({theme})</h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {canalMasks.map((c) => <Swatch key={`c${c.m}`} bg={canalTile(c.m, theme, c.m * 7 + 1)} label={c.label} />)}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 12 }}>
          <Swatch bg={canalBridgeTile(5, 3)} label='bridge, canal N-S' />
          <Swatch bg={canalBridgeTile(10, 3)} label='bridge, canal E-W' />
          <Swatch bg={quayVariant(4, theme)} label='quay lip S' />
          <Swatch bg={quayVariant(6, theme)} label='quay lip S+E' />
          <Swatch bg={quayVariant(2, theme, 'dirt_path')} label='dirt quay E' />
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          All 16 waterway-neighbour masks (N=1 E=2 S=4 W=8, the wall autotiler's technique).
          Masks with 3-4 wet neighbours are the basin treatment: open harbour water, bank only
          on dry edges, corner nibs where two wet edges meet. Bridges over a canal show the
          channel continuing beneath, deck oriented across it. Quay lips are the subtle stone
          band + bollards a path tile gains beside waterway water.
        </p>
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
              // the river-city archetype only exists on town + city grids;
              // the canal city is city-only
              const disabled = (archetype === 'riverfork' && (s === 'hamlet' || s === 'village'))
                || (archetype === 'canal' && s !== 'city');
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
            {[['standard', 'standard'], ['riverfork', 'river city'], ['canal', 'canal city']].map(([val, label]) => (
              <button key={val}
                onClick={() => {
                  setArchetype(val);
                  if (val === 'riverfork' && (size === 'hamlet' || size === 'village')) setSize('town');
                  if (val === 'canal') setSize('city'); // city-only archetype
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
            {archetype === 'canal' && (
              <button className="secondary-button" style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={() => setSeaEdge((e) => ({ E: 'S', S: 'N', N: 'W', W: 'E' }[e]))}>
                sea {seaEdge}
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
        {/* Canal-city invariants (water towns Phase 2): 2x2 basin drains to the sea,
            3-5 spokes, >= 10 free grass (quest floor), >= 4 free grass per fenced-off
            district, boathouse moored on a bank. */}
        {canal && (
          <div style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-secondary)' }}>
            <strong style={{ color: canal.freeGrass >= 10 && canal.spokes >= 3 && canal.hasBoathouse && canal.districtGrass.every((g) => g >= 4) ? '#3a3' : '#c33' }}>
              canal city: basin {canal.basinSize} tiles · {canal.canalTiles} canal tiles carved
              {' '}· {canal.spokes} spokes · {canal.bridges} bridges · {canal.freeGrass} free grass
            </strong>
            {' '}· districts: {canal.districtGrass.length ? canal.districtGrass.map((g) => `${g} grass`).join(', ') : 'none'} ·
            boathouse {canal.hasBoathouse ? 'moored' : 'MISSING'}
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
                const wet = waterwayMask(tile, { n: tileObjAt(gx, gy - 1), e: tileObjAt(gx + 1, gy), s: tileObjAt(gx, gy + 1), w: tileObjAt(gx - 1, gy) });
                let overlay = null;
                if (showPaths && isPathType(tile.type)) {
                  overlay = paths.main.has(`${gx},${gy}`) ? 'rgba(80,200,120,0.9)' : 'rgba(230,60,60,0.95)';
                }
                if (showPaths && !overlay && fork && fork.islandKeys.has(`${gx},${gy}`)) {
                  overlay = 'rgba(240,180,50,0.9)'; // river-city island district
                }
                if (showPaths && !overlay && canal && canal.districtKeys.has(`${gx},${gy}`)) {
                  overlay = 'rgba(240,180,50,0.9)'; // canal-city fenced-off district
                }
                if (showPaths && !overlay && canal && canal.basinKeys.has(`${gx},${gy}`)) {
                  overlay = 'rgba(120,220,240,0.9)'; // the harbour basin
                }
                if (showPaths && tile.isGate) overlay = 'rgba(80,140,255,0.95)';
                return <Cell key={`${gx},${gy}`} tile={tile} neighbours={neighbours} theme={theme} overlay={overlay} wet={wet} />;
              })
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          This is the actual <code>generateTownMap()</code> output rendered with the SVG tileset — walls autotile from
          neighbours, zero image files. Reseed to see different layouts. The <em>path overlay</em> outlines the
          hub-and-spoke network (green = connected to the hub, red = orphan — should never appear, blue = gates,
          orange = the river-city island / canal-city fenced-off districts, cyan = the harbour basin). The
          <em> river city</em> archetype (town/city only) carves a windy forking river around an island quarter; the
          <em> canal city</em> archetype (city only, coastal) carves a harbour basin plus 3-5 windy canal spokes with
          quay lanes hugging the banks. Fork and canal water render with the Phase 4 directional canal treatment
          (16-mask banks, bends, junctions, mouths; see the canal gallery above); paths beside a waterway gain the
          quay lip, and bridges over one show the channel continuing beneath. Sea and lake water are untouched.
        </p>
      </section>
    </div>
  );
};

export default TilesetTest;
