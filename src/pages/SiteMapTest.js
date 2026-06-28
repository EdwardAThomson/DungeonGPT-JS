import React, { useMemo, useState } from 'react';
import { generateSiteMap } from '../utils/siteMapGenerator';
import { populateSite, injectSiteObjective } from '../game/sitePopulator';
import { tileBackground, SITE_POI } from '../utils/siteTileArt';
import MapLegend from '../components/MapLegend';
import { siteLegendGroups } from '../utils/mapLegend';

// Debug harness for wilderness site sub-maps (caves, ruins). Preview the generated layout
// before any in-game wiring. Content slots (reserved for encounters / loot / milestone
// objectives in Phase 3) are marked with a diamond.

const TYPES = ['cave', 'ruins'];
const DIRS = ['north', 'east', 'south', 'west'];
const BIOMES = ['grassland', 'desert', 'snow'];
const OBJECTIVES = ['none', 'item', 'combat', 'location'];
const OBJ_SAMPLE = {
  item: { id: 'control_rod', name: 'the Control Rod' },
  combat: { id: 'cave_tyrant', name: 'the Cave Tyrant' },
  location: { id: 'inner_sanctum', name: 'the Inner Sanctum' },
};
const TILE = 26;

const btn = (active) => ({
  padding: '6px 12px',
  border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
  borderRadius: 6,
  background: active ? 'var(--primary)' : 'var(--surface)',
  color: active ? '#fff' : 'var(--text)',
  cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500,
});

const SiteMapTest = () => {
  const [type, setType] = useState('cave');
  const [dir, setDir] = useState('south');
  const [biome, setBiome] = useState('grassland');
  const [objective, setObjective] = useState('none');
  const [seed, setSeed] = useState(123);

  const site = useMemo(() => {
    const s = populateSite(generateSiteMap(type, type === 'cave' ? 'Hollow Deep' : 'Old Ruins', dir, seed, { biome }), seed);
    if (objective !== 'none') {
      injectSiteObjective(s, { objectiveType: objective, ...OBJ_SAMPLE[objective], milestoneId: 'demo' });
    }
    return s;
  }, [type, dir, biome, objective, seed]);
  const { mapData, width, height, theme, entryPoint, contentSlots } = site;

  const stats = useMemo(() => {
    const counts = {};
    mapData.flat().forEach((t) => { counts[t.type] = (counts[t.type] || 0) + 1; });
    return counts;
  }, [mapData]);

  const typeAt = (c, r) => (r >= 0 && r < height && c >= 0 && c < width) ? mapData[r][c].type : null;

  return (
    <div>
      <h2 style={{ marginTop: 0, fontFamily: 'var(--header-font)' }}>Site Map Test (caves / ruins)</h2>
      <p style={{ color: 'var(--text-muted,#888)', fontSize: 13 }}>
        Generic rooms-and-corridors generator, themed per type (organic blobs for caves,
        rectangular halls for ruins). ◆ marks a reserved content slot (encounter / loot /
        milestone objective — populated in Phase 3). The lit archway is the exit.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 14, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted,#888)', marginBottom: 6 }}>Type</div>
          <div style={{ display: 'flex', gap: 6 }}>{TYPES.map((t) => <button key={t} style={btn(type === t)} onClick={() => setType(t)}>{t}</button>)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted,#888)', marginBottom: 6 }}>Entry side</div>
          <div style={{ display: 'flex', gap: 6 }}>{DIRS.map((d) => <button key={d} style={btn(dir === d)} onClick={() => setDir(d)}>{d}</button>)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted,#888)', marginBottom: 6 }}>Biome (ruins ground)</div>
          <div style={{ display: 'flex', gap: 6 }}>{BIOMES.map((b) => <button key={b} style={btn(biome === b)} onClick={() => setBiome(b)} disabled={type === 'cave'}>{b}</button>)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted,#888)', marginBottom: 6 }}>Milestone objective</div>
          <div style={{ display: 'flex', gap: 6 }}>{OBJECTIVES.map((o) => <button key={o} style={btn(objective === o)} onClick={() => setObjective(o)}>{o}</button>)}</div>
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
        rooms-content-slots: {contentSlots.length} · tiles: {Object.entries(stats).map(([k, v]) => `${k}:${v}`).join('  ·  ')}
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${width}, ${TILE}px)`,
        width: width * TILE, border: '2px solid #1b1a1f', background: '#1b1a1f',
      }}>
        {mapData.flat().map((tile) => {
          const neighbours = { n: typeAt(tile.x, tile.y - 1), e: typeAt(tile.x + 1, tile.y), s: typeAt(tile.x, tile.y + 1), w: typeAt(tile.x - 1, tile.y) };
          const isPlayer = entryPoint && tile.x === entryPoint.x && tile.y === entryPoint.y;
          return (
            <div key={`${tile.x},${tile.y}`} style={{
              width: TILE, height: TILE, position: 'relative',
              backgroundImage: tileBackground(tile, neighbours, tile.x, tile.y, theme),
              backgroundSize: 'cover',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: TILE * 0.6, lineHeight: 1,
            }}>
              {tile.poi && SITE_POI[tile.poi]}
              {tile.content && <span style={{ position: 'absolute', fontSize: TILE * 0.55, textShadow: '0 0 3px #000' }}>{tile.content.kind === 'encounter' ? '⚔️' : tile.content.kind === 'objective' ? '❗' : '💰'}</span>}
              {!tile.content && tile.contentSlot && <span style={{ color: '#ffd34d', fontSize: TILE * 0.5, textShadow: '0 0 3px #000' }}>◆</span>}
              {isPlayer && <span style={{ position: 'absolute', fontSize: TILE * 0.7 }}>🧍</span>}
            </div>
          );
        })}
      </div>
      <MapLegend title="Key" groups={siteLegendGroups(theme, biome)} />
      </div>
    </div>
  );
};

export default SiteMapTest;
