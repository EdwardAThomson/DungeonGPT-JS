import React, { useMemo, useState } from 'react';
import { generateTownMap } from '../utils/townMapGenerator';
import TownMapDisplay from '../components/TownMapDisplay';
import MapLegend from '../components/MapLegend';
import { townLegendGroups } from '../utils/mapLegend';

// Debug harness for world-driven town water (lakefront / coastline). Pick a town size,
// theme, water kind and which edges the water enters from, then preview the generated
// interior. Iterate on shape / shore / wall-terminus here before it goes live.

const SIZES = ['hamlet', 'village', 'town', 'city'];
const THEMES = ['grassland', 'desert', 'snow'];
const EDGES = ['N', 'E', 'S', 'W'];

const btn = (active) => ({
  padding: '6px 12px',
  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
  borderRadius: 6,
  background: active ? 'var(--primary)' : 'var(--surface)',
  color: active ? '#fff' : 'var(--text)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: active ? 700 : 500,
});

const TownWaterTest = () => {
  const [size, setSize] = useState('town');
  const [theme, setTheme] = useState('grassland');
  const [kind, setKind] = useState('coast'); // 'coast' | 'lake' | 'none'
  const [edges, setEdges] = useState({ N: false, E: false, S: true, W: false });
  const [roads, setRoads] = useState({ N: false, E: false, S: true, W: false });
  const [seed, setSeed] = useState(123);

  const toggleEdge = (e) => setEdges((prev) => ({ ...prev, [e]: !prev[e] }));
  const toggleRoad = (e) => setRoads((prev) => ({ ...prev, [e]: !prev[e] }));

  const town = useMemo(() => {
    const water = kind === 'none'
      ? null
      : { kind, edges: { N: false, E: false, S: false, W: false, ...edges } };
    const DIR = { N: 'north', E: 'east', S: 'south', W: 'west' };
    const entryDirs = EDGES.filter((e) => roads[e]).map((e) => DIR[e]);
    return generateTownMap(size, 'Preview Harbour', entryDirs.length ? entryDirs : ['south'], seed, false, 'NORTH_SOUTH', theme, water);
  }, [size, theme, kind, edges, roads, seed]);

  const stats = useMemo(() => {
    const counts = {};
    town.mapData.flat().forEach((t) => { counts[t.type] = (counts[t.type] || 0) + 1; });
    return counts;
  }, [town]);

  return (
    <div>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--header-font)' }}>Town Water Test (lakefront / coastline)</h2>
      <p style={{ color: 'var(--text-muted, #888)', fontSize: 13 }}>
        Water is carved <b>before</b> roads/buildings. Coast floods inward from the chosen
        edge(s) and extends to the canvas border; a lake is a contained blob. Walls run to
        the shore and end cleanly at the water. Entry is forced onto a dry edge.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 16, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted,#888)', marginBottom: 6 }}>Size</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {SIZES.map((s) => <button key={s} style={btn(size === s)} onClick={() => setSize(s)}>{s}</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted,#888)', marginBottom: 6 }}>Theme</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {THEMES.map((t) => <button key={t} style={btn(theme === t)} onClick={() => setTheme(t)}>{t}</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted,#888)', marginBottom: 6 }}>Water</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['coast', 'lake', 'none'].map((k) => <button key={k} style={btn(kind === k)} onClick={() => setKind(k)}>{k}</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted,#888)', marginBottom: 6 }}>Water edges</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {EDGES.map((e) => <button key={e} style={btn(edges[e])} onClick={() => toggleEdge(e)} disabled={kind === 'none'}>{e}</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted,#888)', marginBottom: 6 }}>Entrances (world roads)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {EDGES.map((e) => <button key={e} style={btn(roads[e])} onClick={() => toggleRoad(e)}>{e}</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted,#888)', marginBottom: 6 }}>Seed</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={btn(false)} onClick={() => setSeed((s) => s - 1)}>−</button>
            <span style={{ minWidth: 48, textAlign: 'center', alignSelf: 'center' }}>{seed}</span>
            <button style={btn(false)} onClick={() => setSeed((s) => s + 1)}>+</button>
            <button style={btn(false)} onClick={() => setSeed(Math.floor(Math.random() * 100000))}>🎲</button>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--text-muted,#888)', marginBottom: 10 }}>
        tiles: {Object.entries(stats).map(([k, v]) => `${k}:${v}`).join('  ·  ')}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <TownMapDisplay
          townMapData={town}
          playerPosition={town.entryPoint}
          showLeaveButton={false}
        />
        <MapLegend title="Key" groups={townLegendGroups()} columns={4} style={{ minWidth: 520 }} />
      </div>
    </div>
  );
};

export default TownWaterTest;
