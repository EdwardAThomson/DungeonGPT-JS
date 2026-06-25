// TilesetTest.js  (/debug/tileset)
// Preview harness for the programmatic SVG town tileset (src/utils/townTileArt.js).
// Shows a swatch gallery (terrain + wall autotile variants + building roofs) and a
// REAL generated town (via generateTownMap) rendered with neighbour-based wall
// autotiling — proving the tileset wires straight into the existing town generator,
// before we migrate the live TownMapDisplay.

import React, { useMemo, useState } from 'react';
import { generateTownMap } from '../utils/townMapGenerator';
import { tileBackground, sampleTiles, wallVariant, buildingTile } from '../utils/townTileArt';

const POI_EMOJI = { fountain: '⛲', tree: '🌳', well: '🪣', bush: '🌿', flowers: '🌸' };
const SIZES = ['hamlet', 'village', 'town', 'city'];
const TILE = 28;

const Cell = ({ tile, neighbours }) => {
  const bg = tileBackground(tile, neighbours, tile.x, tile.y);
  const emoji = tile.poi ? POI_EMOJI[tile.poi] : null;
  return (
    <div style={{
      width: TILE, height: TILE, backgroundImage: bg, backgroundSize: 'cover',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
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

const TilesetTest = () => {
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState('town');
  const [seed, setSeed] = useState(12345);

  const town = useMemo(() => generateTownMap(size, `Demo ${size}`, 'south', seed), [size, seed]);
  const grid = town.mapData;
  const W = town.width;
  const H = town.height;
  const at = (gx, gy) => (gy >= 0 && gy < H && gx >= 0 && gx < W && grid[gy][gx] ? grid[gy][gx].type : null);

  const wallMasks = [
    { m: 5, label: 'N–S' }, { m: 10, label: 'E–W' }, { m: 3, label: 'corner NE' },
    { m: 6, label: 'corner SE' }, { m: 7, label: 'T-junction' }, { m: 15, label: 'cross' },
    { m: 1, label: 'endpoint' },
  ];
  // Every building type the town generator can emit — so each roof colour is visible.
  const buildings = [
    'house', 'inn', 'tavern', 'shop', 'market', 'temple', 'bank', 'guild',
    'manor', 'keep', 'barracks', 'blacksmith', 'foundry', 'barn', 'warehouse',
    'archives', 'library', 'alchemist',
  ];

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
          {buildings.map((b) => <Swatch key={b} bg={buildingTile(b)} label={b} />)}
        </div>
      </section>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
          <h3 style={{ ...heading, margin: 0 }}>Generated town</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {SIZES.map((s) => (
              <button key={s} onClick={() => setSize(s)}
                className={s === size ? 'primary-button' : 'secondary-button'}
                style={{ padding: '4px 10px', fontSize: 12 }}>{s}</button>
            ))}
          </div>
          <button className="secondary-button" style={{ padding: '4px 10px', fontSize: 12 }}
            onClick={() => setSeed(Math.floor(Math.random() * 100000))}>🎲 reseed</button>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            zoom <input type="range" min="0.6" max="2" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
          </label>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{W}×{H} · seed {seed}</span>
        </div>
        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8, background: 'var(--surface)' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${W}, ${TILE}px)`, width: W * TILE,
            transform: `scale(${zoom})`, transformOrigin: 'top left',
          }}>
            {grid.flatMap((rowArr, gy) =>
              rowArr.map((tile, gx) => {
                const neighbours = { n: at(gx, gy - 1), e: at(gx + 1, gy), s: at(gx, gy + 1), w: at(gx - 1, gy) };
                return <Cell key={`${gx},${gy}`} tile={tile} neighbours={neighbours} />;
              })
            )}
          </div>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          This is the actual <code>generateTownMap()</code> output rendered with the SVG tileset — walls autotile from
          neighbours (note corner towers and the single south gate), zero image files. Reseed to see different layouts.
        </p>
      </section>
    </div>
  );
};

export default TilesetTest;
