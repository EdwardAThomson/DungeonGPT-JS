// WorldFixedMapTest.js  (/debug/world-fixed)
// A hand-authored, fixed world layout — NOT generated — used to verify the worldTileArt
// renderer in isolation. It always contains a ruins tile (plus hills, a cave by the
// mountains, forests, towns, lake and coast), so if you can't see ruins here it's a
// rendering bug, not a generation/staleness one.

import React from 'react';
import { biomeBackground, poiSprite } from '../utils/worldTileArt';

const TILE = 44;

// Legend → tile factory. Coast/beach on the west edge (water is to the west → dir 3).
const LEGEND = {
  '.': () => ({ biome: 'plains' }),
  w: () => ({ biome: 'water' }),
  B: () => ({ biome: 'beach', beachDirection: 3 }),
  L: () => ({ biome: 'water', isLake: true }),
  f: () => ({ biome: 'plains', poi: 'forest' }),
  m: () => ({ biome: 'plains', poi: 'mountain' }),
  c: () => ({ biome: 'plains', poi: 'cave_entrance' }),
  h: () => ({ biome: 'plains', poi: 'hills' }),
  R: () => ({ biome: 'plains', poi: 'ruins' }),
  a: () => ({ biome: 'plains', poi: 'town', townSize: 'hamlet' }),
  v: () => ({ biome: 'plains', poi: 'town', townSize: 'village' }),
  y: () => ({ biome: 'plains', poi: 'town', townSize: 'city' }),
};

const ROWS = [
  'wwB.........',
  'wB..f.f.....',
  '...f.f...m..',
  '..a....mmc..',
  '....h.....h.',
  '..L....R....',
  '...v.....y..',
  '....h...f...',
];

const WorldFixedMapTest = () => {
  const cols = ROWS[0].length;
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>World Fixed Map <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>— render test (not generated)</span></h2>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        A fixed layout with a guaranteed <strong>ruins</strong> tile (centre), plus hills (3 variants),
        a cave beside the mountains, forests, hamlet/village/city, a lake, and a west coast. If a POI
        doesn't appear here, it's a renderer issue in <code>worldTileArt</code>.
      </p>
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${cols}, ${TILE}px)`, width: cols * TILE,
        border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
      }}>
        {ROWS.flatMap((row, y) =>
          row.split('').map((ch, x) => {
            const tile = { x, y, ...(LEGEND[ch] || LEGEND['.'])() };
            const poi = poiSprite(tile);
            return (
              <div key={`${x},${y}`} style={{
                width: TILE, height: TILE, backgroundImage: biomeBackground(tile, x, y), backgroundSize: 'cover', position: 'relative',
              }} title={`(${x},${y}) ${tile.biome}${tile.poi ? ` / ${tile.poi}` : ''}${tile.townSize ? ` [${tile.townSize}]` : ''}`}>
                {poi && <div style={{ position: 'absolute', inset: 0, backgroundImage: poi, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default WorldFixedMapTest;
