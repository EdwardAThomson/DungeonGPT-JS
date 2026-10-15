// World3QTest.js  (/debug/world-3q)
// Prototype harness for the 3/4 world map (World3QView + worldSprites3q). Uses the same
// generateMapData() output as the live game and shares its seed/size/theme with the
// other world-map debug pages, so the flat and 3/4 views can be compared on one map.

import React, { useMemo, useState } from 'react';
import { generateMapData } from '../utils/mapGenerator';
import World3QView, { WORLD3Q_HEADROOM } from '../components/World3QView';
import WorldMapLabels from '../components/WorldMapLabels';
import { sampleWorld3q, worldVariants3q } from '../utils/worldSprites3q';
import { useDebugMapSettings } from '../utils/debugMapSettings';

const THEME_BIOME = { snow: 'snow' };

const Toggle = ({ on, set, children }) => (
  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {children}
  </label>
);

const World3QTest = () => {
  const [applied, setApplied] = useDebugMapSettings();
  const { seed, theme } = applied;
  const dim = applied.width;
  const [tile, setTile] = useState(56);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showPois, setShowPois] = useState(true);

  const world = useMemo(() => {
    const m = generateMapData(dim, Math.round(dim * 0.7), seed, {}, theme);
    // snow generation is not wired yet: preview it by re-bioming the plains
    const biome = THEME_BIOME[theme];
    if (biome) m.flat().forEach((t) => { if (t.biome === 'plains') t.biome = biome; });
    return m;
  }, [dim, seed, theme]);

  const labels = useMemo(() => {
    const out = [];
    world.flat().forEach((t) => {
      const text = t.townName
        || (t.mountainName && t.isFirstMountainInRange ? t.mountainName : null)
        || (t.milestonePoi ? t.poiName : null);
      if (text) out.push({ x: t.x, y: t.y, text, kind: t.milestonePoi ? 'milestone' : t.townName ? 'town' : 'mountain' });
    });
    return out;
  }, [world]);

  const heading = { fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' };
  const start = world.flat().find((t) => t.isStartingTown);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>World 3/4 View <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>(prototype, not live)</span></h2>

      <section style={{ marginBottom: 20 }}>
        <h3 style={heading}>Sprites</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(sampleWorld3q).map(([n, fn]) => (
            <div key={n} style={{ textAlign: 'center' }}>
              <div style={{ width: 60, height: 100, backgroundImage: fn(), backgroundSize: '100% 100%', borderRadius: 4, border: '1px solid var(--border)', backgroundColor: '#7fb86a' }} />
              <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-secondary)' }}>{n}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: 20 }}>
        <h3 style={heading}>Variants ({theme})</h3>
        {Object.entries(worldVariants3q).map(([n, { count, svg }]) => (
          <div key={n} className="world3q-variants" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {Array.from({ length: count }, (_, v) => (
              <div key={v} title={`${n} ${v}`} style={{ width: 60, height: 100, backgroundImage: svg(v, theme), backgroundSize: '100% 100%', borderRadius: 4, border: '1px solid var(--border)', backgroundColor: theme === 'snow' ? '#e8eef3' : theme === 'desert' ? '#e4cf9f' : '#7bae5e' }} />
            ))}
          </div>
        ))}
      </section>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          theme{' '}
          <select value={theme} onChange={(e) => setApplied({ theme: e.target.value })}>
            {['grassland', 'desert', 'snow'].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <button className="secondary-button" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setApplied({ seed: Math.floor(Math.random() * 100000) })}>🎲 reseed</button>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>size <input type="range" min="10" max="32" step="2" value={dim} onChange={(e) => setApplied({ width: Number(e.target.value), height: Math.round(Number(e.target.value) * 0.7) })} /> {dim}×{Math.round(dim * 0.7)}</label>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>tile <input type="range" min="32" max="96" step="4" value={tile} onChange={(e) => setTile(Number(e.target.value))} /> {tile}px</label>
        <Toggle on={showGrid} set={setShowGrid}>grid</Toggle>
        <Toggle on={showLabels} set={setShowLabels}>labels</Toggle>
        <Toggle on={showPois} set={setShowPois}>sprites</Toggle>
      </div>

      <div className="world3q-view" style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', display: 'inline-block', maxWidth: '100%' }}>
        <World3QView world={world} theme={theme} tile={tile} showGrid={showGrid} showPois={showPois}>
          {showLabels && <WorldMapLabels labels={labels} tile={tile} />}
          {start && <span style={{ position: 'absolute', left: start.x * tile + tile - 12, top: start.y * tile - 6, fontSize: 14 }}>⭐</span>}
        </World3QView>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
        Real <code>generateMapData()</code> output. Ground is the current world tiles; POIs are 3/4 sprites that overlap the
        row behind, sorted by depth. Headroom above the top row: {WORLD3Q_HEADROOM} tiles.
      </p>
    </div>
  );
};

export default World3QTest;
