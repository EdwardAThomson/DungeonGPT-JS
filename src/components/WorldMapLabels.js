// WorldMapLabels.js
// A single overlay layer that draws place names on the world map as little parchment
// scrolls — bigger and more legible than per-tile text, with greedy collision avoidance
// so adjacent names don't overlap. Positioned absolutely inside the (position:relative)
// map grid, so it scales with zoom. Reused by the debug preview now and the live
// WorldMapDisplay after migration.

import React from 'react';

const LINE_H = 15; // px between stacked labels when de-overlapping

const WorldMapLabels = ({ labels, tile, fontSize = 10 }) => {
  // Estimate each label's box, then nudge downward off any already-placed neighbour.
  const placed = [];
  const positioned = labels.map((l) => {
    const w = Math.max(18, l.text.length * fontSize * 0.62 + 14);
    const cx = l.x * tile + tile / 2;
    let top = l.y * tile + tile - 3;
    let guard = 0;
    const collides = (y) => placed.some((p) => Math.abs(p.cx - cx) < (p.w + w) / 2 && Math.abs(p.top - y) < LINE_H);
    while (collides(top) && guard < 10) { top += LINE_H; guard++; }
    placed.push({ cx, top, w });
    return { ...l, cx, top };
  });

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
      {positioned.map((l, i) => (
        <div
          key={i}
          className={`map-name-scroll ${l.kind || 'town'}`}
          style={{ left: l.cx, top: l.top, fontSize }}
        >
          {l.text}
        </div>
      ))}
    </div>
  );
};

export default WorldMapLabels;
