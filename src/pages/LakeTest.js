// LakeTest.js  (/debug/lake-test)
// Fixed, hand-authored lake layouts (NOT generated) run through the REAL `addLakeShores`,
// rendered with `worldTileArt`. Each beach tile is labelled with its `beachDirection`
// (0-3 = straight N/E/S/W, 4-7 = corners NE/SE/SW/NW), so we can point at exact tiles
// when a corner looks wrong — guaranteeing we're both looking at the same thing.

import React, { useState } from 'react';
import { biomeBackground } from '../utils/worldTileArt';
import { addLakeShores } from '../utils/mapGenerator';

const TILE = 48;

// 'w' = water, '.' = land (plains)
const SHAPES = {
  'Rectangle lake (sharp 90° corners)': [
    '..........',
    '..........',
    '..wwwww...',
    '..wwwww...',
    '..wwwww...',
    '..........',
    '..........',
  ],
  'Round-ish blob (diagonal corners)': [
    '..........',
    '....ww....',
    '...wwww...',
    '..wwwwww..',
    '..wwwwww..',
    '...wwww...',
    '....ww....',
    '..........',
  ],
};

function buildLake(rows) {
  const h = rows.length;
  const w = rows[0].length;
  const map = [];
  const water = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) {
      const isWater = rows[y][x] === 'w';
      row.push({ x, y, biome: isWater ? 'water' : 'plains', poi: null });
      if (isWater) water.push({ x, y });
    }
    map.push(row);
  }
  addLakeShores(map, water, w, h, 'plains');
  return map;
}

const DIR_NAME = {
  0: 'N', 1: 'E', 2: 'S', 3: 'W',
  4: 'NE in', 5: 'SE in', 6: 'SW in', 7: 'NW in',     // concave corners
  8: 'NE out', 9: 'SE out', 10: 'SW out', 11: 'NW out', // convex outer corners
};

const Cell = ({ tile, showLabels }) => (
  <div style={{ width: TILE, height: TILE, position: 'relative', backgroundImage: biomeBackground(tile, tile.x, tile.y), backgroundSize: 'cover' }}>
    {showLabels && tile.biome === 'beach' && (
      <span style={{
        position: 'absolute', top: 2, left: 3, fontSize: 11, fontWeight: 700,
        color: tile.beachDirection >= 4 ? '#a00' : '#225', background: 'rgba(255,255,255,0.78)',
        padding: '0 3px', borderRadius: 3, lineHeight: 1.4,
      }}>{tile.beachDirection}</span>
    )}
  </div>
);

const Swatch = ({ dir }) => (
  <div style={{ textAlign: 'center' }}>
    <div style={{ width: 48, height: 48, backgroundImage: biomeBackground({ biome: 'beach', beachDirection: dir }, 0, 0), backgroundSize: 'cover', border: '1px solid var(--border)', borderRadius: 4 }} />
    <div style={{ fontSize: 11, marginTop: 3, color: 'var(--text-secondary)' }}>{dir} · {DIR_NAME[dir]}</div>
  </div>
);

const LakeTest = () => {
  const [showLabels, setShowLabels] = useState(true);
  const heading = { fontSize: 14, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' };
  const maps = Object.entries(SHAPES).map(([name, rows]) => [name, buildLake(rows)]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Lake Test <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— fixed layouts, real shore logic</span></h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 680 }}>
        Hand-authored water blobs run through the real <code>addLakeShores</code> + <code>worldTileArt</code>.
        Beach tiles are labelled with <code>beachDirection</code>: <strong>0–3</strong> straight (N/E/S/W),
        <strong> 4–7</strong> corners (NE/SE/SW/NW). If a corner looks off, tell me the tile's number.
      </p>
      <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> show beachDirection labels
      </label>

      <section style={{ margin: '18px 0' }}>
        <h3 style={heading}>Beach tile variants (every direction)</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((d) => <Swatch key={d} dir={d} />)}
        </div>
      </section>

      {maps.map(([name, map]) => (
        <section key={name} style={{ marginTop: 20 }}>
          <h3 style={heading}>{name}</h3>
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${map[0].length}, ${TILE}px)`, width: map[0].length * TILE,
            border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
          }}>
            {map.flat().map((t) => <Cell key={`${t.x},${t.y}`} tile={t} showLabels={showLabels} />)}
          </div>
        </section>
      ))}
    </div>
  );
};

export default LakeTest;
