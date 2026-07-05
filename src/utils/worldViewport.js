// worldViewport.js
// Pure math for the world-map viewport (LARGER_WORLDS_PLAN step 2, issue #60).
// The live WorldMapDisplay renders the grid inside a scrollable pane once the map is
// bigger than today's 10x10 footprint; these helpers decide when that pane is needed,
// how big tiles are at each fixed zoom step, which tile window is visible (culling),
// and where to scroll so the player stays in view.
//
// Ship-dark contract: viewportNeeded(10, 10) is false, so every current world renders
// through the exact legacy code path (56px tiles, no pane, no zoom UI, no culling).

export const CLOSE_TILE = 56;   // today's tile size; the zoomed-in step
export const MEDIUM_TILE = 36;  // middle step
export const MIN_FIT_TILE = 12; // fit step never goes below this (labels/POIs unreadable)

// The pane is sized to today's 10x10 map footprint (10 * 56px), so the modal keeps the
// same on-screen size it has today regardless of how big the world grid gets.
export const PANE_TILES = 10;
export const PANE_SIZE = PANE_TILES * CLOSE_TILE; // 560
export const GRID_BORDER = 2; // .world-map-grid has a 1px border on each side

export const CULL_THRESHOLD = 400; // tiles; strictly above this, window the render
export const CULL_MARGIN = 2;      // extra tile rows/cols rendered beyond the pane
export const RECENTER_MARGIN = 2;  // player within this many tiles of the pane edge -> recenter
export const CLICK_DRAG_THRESHOLD = 5; // px of pointer travel that turns a click into a pan

// Ordered zoomed-out -> zoomed-in. Fixed steps beat free zoom for a tile game.
export const ZOOM_STEPS = ['fit', 'medium', 'close'];

/**
 * Does this grid need a viewport at all? False for anything that fits the pane at the
 * close step, which includes every current 10x10 world (the ship-dark predicate).
 */
export function viewportNeeded(cols, rows) {
  return cols * CLOSE_TILE > PANE_SIZE || rows * CLOSE_TILE > PANE_SIZE;
}

/**
 * Tile size for the fit step: the whole map scaled into the pane (minus the grid
 * border), clamped to [MIN_FIT_TILE, CLOSE_TILE]. 20x20 -> 27px, 30x30 -> 18px.
 */
export function fitTileSize(cols, rows, paneW = PANE_SIZE, paneH = PANE_SIZE) {
  const fit = Math.floor(Math.min((paneW - GRID_BORDER) / cols, (paneH - GRID_BORDER) / rows));
  return Math.max(MIN_FIT_TILE, Math.min(CLOSE_TILE, fit));
}

/** Tile pixel size for a zoom step. Unknown steps fall back to close (legacy size). */
export function tileSizeForStep(step, cols, rows, paneW = PANE_SIZE, paneH = PANE_SIZE) {
  if (step === 'medium') return MEDIUM_TILE;
  if (step === 'fit') return fitTileSize(cols, rows, paneW, paneH);
  return CLOSE_TILE;
}

/** Windowed rendering only kicks in above the threshold; 10x10 and 20x20 render fully. */
export function shouldCull(cols, rows) {
  return cols * rows > CULL_THRESHOLD;
}

/**
 * Inclusive row/col range of tiles intersecting the visible pane, padded by `margin`
 * tiles and clamped to the grid.
 */
export function visibleRange(scrollLeft, scrollTop, paneW, paneH, tileSize, cols, rows, margin = CULL_MARGIN) {
  const c0 = Math.max(0, Math.floor(scrollLeft / tileSize) - margin);
  const c1 = Math.min(cols - 1, Math.ceil((scrollLeft + paneW) / tileSize) - 1 + margin);
  const r0 = Math.max(0, Math.floor(scrollTop / tileSize) - margin);
  const r1 = Math.min(rows - 1, Math.ceil((scrollTop + paneH) / tileSize) - 1 + margin);
  return { c0, c1, r0, r1 };
}

/** Scroll offsets that center tile (px, py) in the pane, clamped to the scrollable area. */
export function centerScroll(px, py, tileSize, paneW, paneH, cols, rows) {
  const maxLeft = Math.max(0, cols * tileSize + GRID_BORDER - paneW);
  const maxTop = Math.max(0, rows * tileSize + GRID_BORDER - paneH);
  const left = Math.max(0, Math.min(px * tileSize + tileSize / 2 - paneW / 2, maxLeft));
  const top = Math.max(0, Math.min(py * tileSize + tileSize / 2 - paneH / 2, maxTop));
  return { left, top };
}

/**
 * Should the view recenter after a move? Only when the player's tile center is within
 * `margin` tiles of a pane edge, so the view is not yanked on every step.
 */
export function needsRecenter(scrollLeft, scrollTop, paneW, paneH, px, py, tileSize, margin = RECENTER_MARGIN) {
  const cx = px * tileSize + tileSize / 2;
  const cy = py * tileSize + tileSize / 2;
  const m = margin * tileSize;
  return (
    cx < scrollLeft + m ||
    cx > scrollLeft + paneW - m ||
    cy < scrollTop + m ||
    cy > scrollTop + paneH - m
  );
}
