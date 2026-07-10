import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { resolveProfilePicture } from '../utils/assetHelper';
import { biomeBackground, poiSprite } from '../utils/worldTileArt';
import WorldMapLabels from './WorldMapLabels';
import {
  CLOSE_TILE,
  CLICK_DRAG_THRESHOLD,
  PANE_SIZE,
  ZOOM_STEPS,
  centerScroll,
  needsRecenter,
  shouldCull,
  tileSizeForStep,
  viewportNeeded,
  visibleRange,
} from '../utils/worldViewport';

const TILE = CLOSE_TILE; // 56 — larger tiles for readability (was 40 originally)

// Beach offset: water sits on one edge of the tile, so overlays/sprites/marker are
// nudged toward the land side. beachDirection: 0 = water North, 1 = East, 2 = South, 3 = West.
// 0-3 = water N/E/S/W (shift toward land); 4-7 = corner shores (shift diagonally toward sand).
const BEACH_SHIFT = [
  'translateY(10px)', 'translateX(-10px)', 'translateY(-10px)', 'translateX(10px)',     // 0-3 straight
  'translate(-7px, 7px)', 'translate(-7px, -7px)', 'translate(7px, -7px)', 'translate(7px, 7px)', // 4-7 concave
  'translate(-5px, 5px)', 'translate(-5px, -5px)', 'translate(5px, -5px)', 'translate(5px, 5px)',  // 8-11 convex
];

// Same offsets as numbers, for scaling at the smaller zoom steps (values are tuned for
// the 56px close tile; at other tile sizes they shrink proportionally).
const BEACH_SHIFT_XY = [
  [0, 10], [-10, 0], [0, -10], [10, 0],
  [-7, 7], [-7, -7], [7, -7], [7, 7],
  [-5, 5], [-5, -5], [5, -5], [5, 5],
];

// At scale 1 return the exact legacy transform strings (ship-dark: byte-identical styles
// for today's 10x10 worlds); otherwise scale the pixel offsets with the tile size.
const beachShiftFor = (beachDirection, scale) => {
  if (beachDirection === undefined || !BEACH_SHIFT[beachDirection]) return 'none';
  if (scale === 1) return BEACH_SHIFT[beachDirection];
  const [x, y] = BEACH_SHIFT_XY[beachDirection];
  const r = (v) => Math.round(v * scale * 10) / 10;
  return `translate(${r(x)}px, ${r(y)}px)`;
};

// SVG path definitions for different path/river directions (viewBox 40x40)
const pathSVGs = {
  NORTH_SOUTH: 'M20,0 L20,40',           // Straight vertical
  EAST_WEST: 'M0,20 L40,20',             // Straight horizontal
  NORTH_EAST: 'M20,0 Q20,20 40,20',      // Curved from north to east
  NORTH_WEST: 'M20,0 Q20,20 0,20',       // Curved from north to west
  SOUTH_EAST: 'M20,40 Q20,20 40,20',     // Curved from south to east
  SOUTH_WEST: 'M20,40 Q20,20 0,20',      // Curved from south to west
  INTERSECTION: 'M20,0 L20,40 M0,20 L40,20', // Cross intersection
  // Partial paths for starts/ends (mountain sources / lake mouths)
  START_NORTH: 'M20,20 L20,0',
  START_SOUTH: 'M20,20 L20,40',
  START_EAST: 'M20,20 L40,20',
  START_WEST: 'M20,20 L0,20',
  END_NORTH: 'M20,40 L20,20',
  END_SOUTH: 'M20,0 L20,20',
  END_EAST: 'M0,20 L20,20',
  END_WEST: 'M40,20 L20,20'
};

// Helper function to render river overlay
const renderRiverOverlay = (tile) => {
  if (!tile.hasRiver || tile.biome === 'water') return null;

  const pathD = pathSVGs[tile.riverDirection] || pathSVGs.NORTH_SOUTH;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1
      }}
      viewBox="0 0 40 40"
    >
      <path
        d={pathD}
        stroke="#4169E1" // Royal Blue for rivers
        strokeWidth="4"   // Slightly thicker than paths
        fill="none"
        opacity="0.8"
        strokeLinecap="round"
      />
    </svg>
  );
};

// Helper function to render path overlay
const renderPathOverlay = (tile, beachShift) => {
  if (!tile.hasPath) return null;

  const pathD = pathSVGs[tile.pathDirection] || pathSVGs.NORTH_SOUTH;

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        transform: beachShift
      }}
      viewBox="0 0 40 40"
    >
      <path
        d={pathD}
        stroke="#8B4513"
        strokeWidth="3"
        fill="none"
        opacity="0.7"
        strokeLinecap="round"
      />
    </svg>
  );
};

// The chosen zoom step is remembered for the browser session (module state), so the map
// reopens at the same zoom after Game.js's close/reopen-around-encounters cycle (#25).
let rememberedZoom = 'close';
export const _resetRememberedZoom = () => { rememberedZoom = 'close'; };

const ZOOM_LABELS = { fit: 'Fit', medium: 'Mid', close: 'Close' };

const WorldMapDisplay = ({ mapData, playerPosition, onTileClick, firstHero, visibleMilestonePois, revealedSiteTypes }) => {
  const mapHeight = mapData ? mapData.length : 0;
  const mapWidth = mapHeight > 0 ? mapData[0].length : 0;

  // Viewport (LARGER_WORLDS_PLAN step 2): maps larger than the 10x10 pane footprint get
  // a scrollable pane with fixed zoom steps. Every current 10x10 world takes the legacy
  // path below (56px tiles, no pane, no zoom UI) and renders exactly as before.
  const viewportActive = mapHeight > 0 && viewportNeeded(mapWidth, mapHeight);

  const paneRef = useRef(null);
  const [paneBox, setPaneBox] = useState({ w: PANE_SIZE, h: PANE_SIZE });
  const [zoomStep, setZoomStepState] = useState(rememberedZoom);
  const [scrollPos, setScrollPos] = useState({ left: 0, top: 0 });
  // Click-vs-pan guard: pointer travel beyond the threshold marks the gesture as a pan
  // and the trailing click is swallowed.
  const dragRef = useRef({ startX: 0, startY: 0, moved: false, panning: false, baseLeft: 0, baseTop: 0 });

  const tileSize = viewportActive
    ? tileSizeForStep(zoomStep, mapWidth, mapHeight, paneBox.w, paneBox.h)
    : TILE;
  const scale = tileSize / TILE;
  const culling = viewportActive && shouldCull(mapWidth, mapHeight);

  const setZoomStep = (step) => {
    rememberedZoom = step;
    setZoomStepState(step);
  };

  const paneDims = useCallback(() => {
    const el = paneRef.current;
    return {
      w: (el && el.clientWidth) || paneBox.w,
      h: (el && el.clientHeight) || paneBox.h,
    };
  }, [paneBox]);

  const centerOnPlayer = useCallback((smooth) => {
    const el = paneRef.current;
    if (!el || !playerPosition) return;
    const { w, h } = paneDims();
    const { left, top } = centerScroll(playerPosition.x, playerPosition.y, tileSize, w, h, mapWidth, mapHeight);
    if (Math.abs(el.scrollLeft - left) < 1 && Math.abs(el.scrollTop - top) < 1) return;
    if (typeof el.scrollTo === 'function') {
      try {
        el.scrollTo({ left, top, behavior: smooth ? 'smooth' : 'auto' });
        return;
      } catch (err) {
        // jsdom and very old browsers: fall through to direct assignment
      }
    }
    el.scrollLeft = left;
    el.scrollTop = top;
  }, [playerPosition, tileSize, mapWidth, mapHeight, paneDims]);

  // Measure the pane (it shrinks below PANE_SIZE on small screens) for fit-step sizing,
  // centering, and culling math.
  useLayoutEffect(() => {
    if (!viewportActive) return undefined;
    const measure = () => {
      const el = paneRef.current;
      if (!el) return;
      const w = el.clientWidth || PANE_SIZE;
      const h = el.clientHeight || PANE_SIZE;
      setPaneBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [viewportActive]);

  // Auto-center on the player when the map opens and when the zoom step changes.
  useLayoutEffect(() => {
    if (viewportActive) centerOnPlayer(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportActive, tileSize]);

  // After a move, recenter only when the player drifts near the pane edge (with a
  // margin), so the view is not yanked on every step.
  useEffect(() => {
    if (!viewportActive) return;
    const el = paneRef.current;
    if (!el || !playerPosition) return;
    const { w, h } = paneDims();
    if (needsRecenter(el.scrollLeft, el.scrollTop, w, h, playerPosition.x, playerPosition.y, tileSize)) {
      centerOnPlayer(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerPosition && playerPosition.x, playerPosition && playerPosition.y]);

  if (!mapData || mapData.length === 0) {
    return <div>Loading map...</div>;
  }

  const handleScroll = () => {
    if (!culling) return;
    const el = paneRef.current;
    if (!el) return;
    setScrollPos({ left: el.scrollLeft, top: el.scrollTop });
  };

  const handlePointerDown = (e) => {
    const el = paneRef.current;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      panning: true,
      baseLeft: el ? el.scrollLeft : 0,
      baseTop: el ? el.scrollTop : 0,
    };
  };

  const handlePointerMove = (e) => {
    const d = dragRef.current;
    if (!d.panning) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) > CLICK_DRAG_THRESHOLD) d.moved = true;
    // Mouse drag pans the pane (touch panning is native scroll); the trailing click is
    // swallowed by the moved flag either way.
    if (d.moved && e.pointerType === 'mouse' && (e.buttons & 1)) {
      const el = paneRef.current;
      if (el) {
        el.scrollLeft = d.baseLeft - dx;
        el.scrollTop = d.baseTop - dy;
      }
    }
  };

  const handlePointerEnd = () => {
    dragRef.current.panning = false;
  };

  const handleTileClick = (x, y) => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    if (onTileClick) onTileClick(x, y);
  };

  // No grid gap so the WorldMapLabels overlay (which positions names at x*tileSize)
  // aligns exactly with the tiles; the container is position:relative so that overlay
  // anchors here.
  const gridStyle = {
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: `repeat(${mapWidth}, ${tileSize}px)`,
    gridTemplateRows: `repeat(${mapHeight}, ${tileSize}px)`,
    border: '1px solid #ccc',
    width: `${mapWidth * tileSize}px`,
    // In the pane, `auto` margins center the grid when it is smaller than the pane (fit
    // step) without clipping when it overflows; standalone keeps the legacy centering.
    margin: viewportActive ? 'auto' : '20px auto',
  };

  // Place names for the scroll-label overlay: towns, named mountains (first in range),
  // and visible milestone POIs.
  const labels = [];

  const renderTile = (tile) => {
    const isPlayerHere = playerPosition.x === tile.x && playerPosition.y === tile.y;

    // Hide milestone POIs (sprite + name) that aren't unlocked yet
    const isMilestoneHidden = tile.milestonePoi && visibleMilestonePois && !visibleMilestonePois.has(tile.poi);
    // Secret sites: a cave/ruins isn't drawn until a quest has revealed its type.
    const isSiteHidden = (tile.poi === 'cave_entrance' || tile.poi === 'ruins')
      && revealedSiteTypes && !revealedSiteTypes[tile.poi === 'cave_entrance' ? 'cave' : 'ruins'];

    const beachShift = (tile.biome === 'beach' && tile.beachDirection !== undefined)
      ? beachShiftFor(tile.beachDirection, scale)
      : 'none';

    // POI sprite overlay (town/forest/mountain/hills/cave_entrance/ruins/milestone)
    const poi = (isMilestoneHidden || isSiteHidden) ? null : poiSprite(tile);

    // A revealed milestone POI (objective) gets a warm glowing border for findability,
    // mirroring the town quest-building glow. Hidden (locked) POIs stay unmarked.
    const isVisibleMilestonePoi = !!tile.milestonePoi && !isMilestoneHidden;

    // Collect a name label for this tile if applicable
    const labelText = tile.townName
      || (tile.mountainName && tile.isFirstMountainInRange ? tile.mountainName : null)
      || (tile.milestonePoi && tile.poiName && !isMilestoneHidden ? tile.poiName : null);
    if (labelText) {
      labels.push({
        x: tile.x,
        y: tile.y,
        text: labelText,
        kind: tile.milestonePoi ? 'milestone' : tile.townName ? 'town' : 'mountain',
      });
    }

    return (
      <div
        key={`${tile.x}-${tile.y}`}
        className={`map-tile ${isPlayerHere ? 'player-tile' : ''} ${!tile.isExplored ? 'unexplored' : ''} ${isVisibleMilestonePoi ? 'milestone-poi-tile' : ''}`}
        style={{
          backgroundImage: biomeBackground(tile, tile.x, tile.y),
          backgroundSize: 'cover',
          cursor: 'pointer', // Indicate clickable
          position: 'relative', // For overlays / player marker positioning
          // Windowed rendering places each tile at its own grid coordinates.
          ...(culling ? { gridColumn: tile.x + 1, gridRow: tile.y + 1 } : {}),
        }}
        onClick={() => handleTileClick(tile.x, tile.y)}
        title={`${tile.townName || tile.mountainName || `(${tile.x}, ${tile.y})`} - ${tile.biome}${tile.poi && !isSiteHidden && !isMilestoneHidden ? ` (${tile.poi})` : ''}${tile.townSize ? ` [${tile.townSize}]` : ''}${tile.isExplored ? ' (Explored)' : ''}`} // Tooltip
      >
        {/* Render river overlay (below POI) */}
        {renderRiverOverlay(tile)}

        {/* Render path overlay (below POI) */}
        {renderPathOverlay(tile, beachShift)}

        {/* POI sprite overlay */}
        {poi && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              backgroundImage: poi,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              pointerEvents: 'none',
              transform: beachShift,
            }}
          />
        )}

        {/* Display player marker when on this tile */}
        {isPlayerHere && (
          firstHero ? (
            <div
              className="player-marker-portrait"
              style={{
                zIndex: 3,
                transform: beachShift,
                // The portrait's CSS size is tuned for 56px tiles; shrink it in step
                // with the smaller zoom levels (scale 1 keeps the pure-CSS legacy look).
                ...(scale !== 1 ? {
                  width: Math.round(32 * scale),
                  height: Math.round(32 * scale),
                  top: Math.round(-18 * scale),
                  left: Math.round(-18 * scale),
                } : {}),
              }}
            >
              <img
                src={resolveProfilePicture(firstHero.profilePicture)}
                alt={firstHero.characterName}
                loading="lazy"
                width="40"
                height="40"
              />
              <div className="player-marker-pointer"></div>
            </div>
          ) : (
            <span style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: `translate(-50%, -50%) ${beachShift === 'none' ? '' : beachShift}`.trim(),
              fontSize: scale === 1 ? '20px' : `${Math.round(20 * scale)}px`,
              zIndex: 3,
              pointerEvents: 'none',
            }}>⭐</span>
          )
        )}
      </div>
    );
  };

  // Which tiles to render: everything, or (above the culling threshold) only the window
  // intersecting the pane plus a margin.
  const tiles = [];
  if (culling) {
    const { w, h } = paneDims();
    const { c0, c1, r0, r1 } = visibleRange(scrollPos.left, scrollPos.top, w, h, tileSize, mapWidth, mapHeight);
    for (let y = r0; y <= r1; y++) {
      for (let x = c0; x <= c1; x++) {
        tiles.push(renderTile(mapData[y][x]));
      }
    }
  } else {
    mapData.forEach((row) => row.forEach((tile) => tiles.push(renderTile(tile))));
  }

  const grid = (
    <div
      style={gridStyle}
      className="world-map-grid"
      {...(viewportActive ? {
        'data-rendered-tiles': tiles.length,
        'data-total-tiles': mapWidth * mapHeight,
        'data-tile-size': tileSize,
      } : {})}
    >
      {tiles}

      {/* Name labels drawn as parchment scrolls over the (position:relative) grid */}
      <WorldMapLabels labels={labels} tile={tileSize} fontSize={Math.max(7, Math.round(10 * scale))} />
    </div>
  );

  if (!viewportActive) {
    // Legacy path: the grid exactly fits, no pane, no zoom UI (ship-dark for 10x10).
    return (
      <div className="world-map-container">
        {grid}
      </div>
    );
  }

  const stepIndex = ZOOM_STEPS.indexOf(zoomStep);

  return (
    <div className="world-map-container">
      <div className="world-map-viewport-frame">
        <div
          className="world-map-viewport"
          ref={paneRef}
          style={{ width: PANE_SIZE, height: PANE_SIZE }}
          onScroll={handleScroll}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={handlePointerEnd}
        >
          {grid}
        </div>
        <div className="world-map-zoom" role="group" aria-label="Map zoom">
          <button
            type="button"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={stepIndex <= 0}
            onClick={() => setZoomStep(ZOOM_STEPS[Math.max(0, stepIndex - 1)])}
          >
            −
          </button>
          <span className="world-map-zoom-step">{ZOOM_LABELS[zoomStep] || zoomStep}</span>
          <button
            type="button"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={stepIndex >= ZOOM_STEPS.length - 1}
            onClick={() => setZoomStep(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, stepIndex + 1)])}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorldMapDisplay;
