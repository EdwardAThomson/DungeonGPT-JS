// World3QView.js
// PROTOTYPE (debug-only, /debug/world-3q): the world map drawn in the 3/4 style of the
// town view. Flat ground (biome tiles, rivers, roads) with an optional grid on top, then
// every POI as upright sprites (worldSprites3q.js) that stand on their tile, rise over
// the tiles behind and are depth-sorted by their ground y.
//
// View only: reads the saved world grid and never changes it. `children` render in map
// space above everything (labels, markers, a click layer).

import React, { useMemo } from 'react';
import { biomeBackground } from '../utils/worldTileArt';
import { worldPoiParts3q } from '../utils/worldSprites3q';

// Headroom above row 0, in tiles, so the tallest sprites on the top row are not cut off.
export const WORLD3Q_HEADROOM = 0.8;

// Path geometry for river/road overlays (same as WorldMapDisplay, viewBox 40x40).
const PATHS = {
  NORTH_SOUTH: 'M20,0 L20,40', EAST_WEST: 'M0,20 L40,20',
  NORTH_EAST: 'M20,0 Q20,20 40,20', NORTH_WEST: 'M20,0 Q20,20 0,20',
  SOUTH_EAST: 'M20,40 Q20,20 40,20', SOUTH_WEST: 'M20,40 Q20,20 0,20',
  INTERSECTION: 'M20,0 L20,40 M0,20 L40,20',
  START_NORTH: 'M20,20 L20,0', START_SOUTH: 'M20,20 L20,40', START_EAST: 'M20,20 L40,20', START_WEST: 'M20,20 L0,20',
  END_NORTH: 'M20,40 L20,20', END_SOUTH: 'M20,0 L20,20', END_EAST: 'M0,20 L20,20', END_WEST: 'M40,20 L20,20',
};

const Line = ({ d, stroke, edge, width }) => (
  <svg viewBox="0 0 40 40" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
    <path d={d} stroke={edge} strokeWidth={width + 1.6} fill="none" strokeLinecap="round" opacity={0.55} />
    <path d={d} stroke={stroke} strokeWidth={width} fill="none" strokeLinecap="round" />
  </svg>
);

const World3QView = ({ world, theme = 'grassland', tile: T = 56, showGrid = true, showRivers = true, showPaths = true, showPois = true, children }) => {
  const rows = world.length, cols = (world[0] || []).length;
  const pad = Math.round(WORLD3Q_HEADROOM * T);

  const sprites = useMemo(() => {
    if (!showPois) return [];
    const out = [];
    world.forEach((row) => row.forEach((t) => {
      worldPoiParts3q(t, theme).forEach((p, i) => {
        const key = `${t.x},${t.y},${i}`;
        if (p.flat) {
          out.push({ key, z: Math.round((t.y + 0.99) * 100), style: { left: t.x * T, top: t.y * T, width: T, height: T, backgroundImage: p.bg, backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' } });
          return;
        }
        const k = (T / 40) * p.s;
        const cw = p.cw || 60, ch = p.ch || 100, ox = p.ox || 30, oy = p.oy || 92;
        out.push({
          key,
          z: Math.round((t.y + p.ay) * 100),
          style: {
            left: Math.round((t.x + p.ax) * T - ox * k), top: Math.round((t.y + p.ay) * T - oy * k),
            width: Math.round(cw * k), height: Math.round(ch * k),
            backgroundImage: p.bg, backgroundSize: '100% 100%',
          },
        });
      });
    }));
    return out;
  }, [world, theme, T, showPois]);

  return (
    <div style={{ position: 'relative', width: cols * T, height: rows * T + pad, background: '#2b3a2a', overflow: 'hidden' }}>
      {/* headroom: the top row's ground carried on past the map edge, dimmed, so the
          tall sprites on row 0 stand on land rather than against a dark band */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: cols * T, height: pad, display: 'grid', gridTemplateColumns: `repeat(${cols}, ${T}px)`, gridAutoRows: `${T}px`, alignContent: 'end' }}>
        {[1, 0].map((r) => (world[0] || []).map((t) => (
          <div key={`h${r},${t.x}`} style={{ width: T + 1, height: T + 1, backgroundImage: biomeBackground({ ...t, poi: null }, t.x, -1 - r, world), backgroundSize: 'cover' }} />
        )))}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(27,26,31,0.85), rgba(27,26,31,0.15))' }} />
      </div>
      <div style={{ position: 'absolute', left: 0, top: pad, width: cols * T, height: rows * T }}>
        {/* ground */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, ${T}px)`, gridAutoRows: `${T}px` }}>
          {world.flat().map((t) => (
            <div key={`${t.x},${t.y}`} style={{ position: 'relative', width: T + 1, height: T + 1, backgroundImage: biomeBackground(t, t.x, t.y, world), backgroundSize: 'cover' }}>
              {showRivers && t.hasRiver && t.biome !== 'water' && <Line d={PATHS[t.riverDirection] || PATHS.NORTH_SOUTH} stroke="#4a86c8" edge="#2f5f93" width={4} />}
              {showPaths && t.hasPath && t.biome !== 'water' && <Line d={PATHS[t.pathDirection] || PATHS.NORTH_SOUTH} stroke="#9a7448" edge="#5e4329" width={3} />}
            </div>
          ))}
        </div>
        {showGrid && (
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1,
            backgroundImage: 'linear-gradient(to right, rgba(20,24,18,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(20,24,18,0.22) 1px, transparent 1px)',
            backgroundSize: `${T}px ${T}px`,
          }} />
        )}
        {/* upright sprites, depth-sorted by ground y */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}>
          {sprites.map((sp) => <div key={sp.key} style={{ position: 'absolute', zIndex: sp.z, ...sp.style }} />)}
        </div>
        {children && <div style={{ position: 'absolute', inset: 0, zIndex: 3 }}>{children}</div>}
      </div>
    </div>
  );
};

export default World3QView;
