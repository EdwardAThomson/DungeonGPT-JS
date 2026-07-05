// LargeWorldViewportTest.js  (/debug/large-world-viewport)
// Acceptance surface for LARGER_WORLDS_PLAN step 2: the live WorldMapDisplay rendered
// with synthetic 10x10 / 20x20 / 30x30 worlds (assembled read-only via worldAssembler).
// Exercises the scroll pane, the fixed zoom steps, player-centered auto-scroll, the
// click-vs-pan guard, and viewport culling. The stats line reads the grid's
// data-rendered-tiles / data-total-tiles attributes to prove culling; the pane-boundary
// toggle outlines the scrollable pane. A 10x10 world must show NO pane and NO zoom UI
// (the ship-dark contract: current worlds render exactly as before).

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { assembleWorld } from '../utils/worldAssembler';
import WorldMapDisplay from '../components/WorldMapDisplay';

const findStartingTile = (mapData) => {
  for (const row of mapData) {
    for (const tile of row) {
      if (tile.isStartingTown) return { x: tile.x, y: tile.y };
    }
  }
  // Fallback: first non-water tile
  for (const row of mapData) {
    for (const tile of row) {
      if (tile.biome !== 'water') return { x: tile.x, y: tile.y };
    }
  }
  return { x: 0, y: 0 };
};

const Toggle = ({ on, set, children }) => (
  <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
    <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} /> {children}
  </label>
);

const LargeWorldViewportTest = () => {
  const [seed, setSeed] = useState(4242);
  const [seedInput, setSeedInput] = useState('4242');
  const [chunksN, setChunksN] = useState(3);
  const [teleport, setTeleport] = useState(false);
  const [showPane, setShowPane] = useState(false);
  const [notice, setNotice] = useState('');
  const wrapRef = useRef(null);
  const [stats, setStats] = useState(null);

  const { mapData } = useMemo(
    () => assembleWorld({ worldSeed: seed, chunksX: chunksN, chunksY: chunksN }),
    [seed, chunksN]
  );
  const rows = mapData.length;
  const cols = mapData[0].length;

  const [player, setPlayer] = useState(() => findStartingTile(mapData));
  useEffect(() => {
    setPlayer(findStartingTile(mapData));
    setNotice('');
  }, [mapData]);

  // Movement mirrors the world map's semantics closely enough for viewport testing:
  // one step to an adjacent (8-way) non-water tile, or free teleport when toggled.
  const handleTileClick = (x, y) => {
    const tile = mapData[y] && mapData[y][x];
    if (!tile) return;
    if (x === player.x && y === player.y) {
      setNotice(`Re-clicked the standing tile (${x}, ${y}) — click received, no move.`);
      return;
    }
    if (!teleport) {
      const dist = Math.max(Math.abs(x - player.x), Math.abs(y - player.y));
      if (dist > 1) {
        setNotice(`(${x}, ${y}) is ${dist} tiles away — adjacent moves only (enable teleport to jump).`);
        return;
      }
      if (tile.biome === 'water') {
        setNotice(`(${x}, ${y}) is water — blocked.`);
        return;
      }
    }
    setPlayer({ x, y });
    setNotice(`Moved to (${x}, ${y}) [${tile.biome}${tile.poi ? `, ${tile.poi}` : ''}]`);
  };

  // Read the live render stats off the real component: the grid carries
  // data-rendered-tiles / data-total-tiles / data-tile-size when the viewport is active
  // (a 10x10 grid carries none of them, proving the ship-dark path).
  useEffect(() => {
    const read = () => {
      const root = wrapRef.current;
      if (!root) return;
      const grid = root.querySelector('.world-map-grid');
      const pane = root.querySelector('.world-map-viewport');
      const domTiles = root.querySelectorAll('.map-tile').length;
      const next = {
        domTiles,
        total: cols * rows,
        rendered: grid ? grid.getAttribute('data-rendered-tiles') : null,
        tileSize: grid ? grid.getAttribute('data-tile-size') : null,
        paneActive: !!pane,
        zoomVisible: !!root.querySelector('.world-map-zoom'),
        scroll: pane ? `${Math.round(pane.scrollLeft)},${Math.round(pane.scrollTop)}` : 'n/a',
      };
      setStats((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    read();
    const id = setInterval(read, 400);
    return () => clearInterval(id);
  }, [cols, rows, player, chunksN, seed]);

  const applySeed = () => {
    const n = parseInt(seedInput, 10);
    if (Number.isFinite(n)) setSeed(n);
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>
        Large World Viewport{' '}
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          — live WorldMapDisplay with scroll + stepped zoom (step 2 of LARGER_WORLDS_PLAN, ship-dark)
        </span>
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          seed{' '}
          <input
            type="number" value={seedInput} style={{ width: 90 }}
            onChange={(e) => setSeedInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') applySeed(); }}
            onBlur={applySeed}
          />
        </label>
        <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          world{' '}
          <select value={chunksN} onChange={(e) => setChunksN(Number(e.target.value))}>
            <option value={1}>10x10 (today's world — must be ship-dark)</option>
            <option value={2}>20x20 (viewport, no culling)</option>
            <option value={3}>30x30 (viewport + culling)</option>
          </select>
        </label>
        <Toggle on={teleport} set={setTeleport}>teleport (click anywhere)</Toggle>
        <Toggle on={showPane} set={setShowPane}>show pane boundary</Toggle>
      </div>

      {stats && (
        <p style={{ fontSize: 13, margin: '4px 0 0', fontFamily: 'monospace' }}>
          grid {cols}x{rows} ({stats.total} tiles) · rendered {stats.rendered ?? stats.domTiles}
          {stats.rendered && Number(stats.rendered) < stats.total ? ' (CULLED)' : ''} ·
          viewport {stats.paneActive ? 'active' : 'inactive (ship-dark)'} ·
          zoom UI {stats.zoomVisible ? 'visible' : 'hidden'} ·
          tile {stats.tileSize ? `${stats.tileSize}px` : '56px (legacy)'} ·
          scroll {stats.scroll} · player ({player.x},{player.y})
        </p>
      )}
      {notice && (
        <p role="status" style={{ fontSize: 13, margin: '4px 0 0', color: 'var(--text-secondary)' }}>{notice}</p>
      )}

      <div ref={wrapRef} className={showPane ? 'lwvt-pane-outline' : ''}>
        {showPane && (
          <style>{'.lwvt-pane-outline .world-map-viewport { outline: 3px dashed #d94a4a; outline-offset: -3px; }'}</style>
        )}
        <WorldMapDisplay
          mapData={mapData}
          playerPosition={player}
          onTileClick={handleTileClick}
          firstHero={null}
          visibleMilestonePois={undefined}
          revealedSiteTypes={undefined}
        />
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
        What to check: 10x10 shows the whole grid with no scrollbars, no zoom control, and 56px tiles
        (identical to production). 20x20/30x30 get a 560px pane that opens centered on the player;
        moving toward a pane edge recentres the view (with a 2-tile margin), small moves do not.
        Zoom steps are Fit (whole map in the pane) / Mid (36px) / Close (56px, today's size) and the
        chosen step is remembered for the session. On 30x30 the rendered count stays well under 900
        (windowed rendering, 2-tile margin). Dragging the map pans it and must NOT count as a click;
        a clean click moves the player to an adjacent tile exactly as in the game.
      </p>
    </div>
  );
};

export default LargeWorldViewportTest;
