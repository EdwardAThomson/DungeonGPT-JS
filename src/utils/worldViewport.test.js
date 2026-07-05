// Unit tests for the world-map viewport math (LARGER_WORLDS_PLAN step 2).
// The ship-dark contract lives here: a 10x10 world never activates the viewport, so
// current production maps render through the untouched legacy path.

import {
  CLOSE_TILE,
  MEDIUM_TILE,
  MIN_FIT_TILE,
  PANE_SIZE,
  GRID_BORDER,
  CULL_THRESHOLD,
  ZOOM_STEPS,
  viewportNeeded,
  fitTileSize,
  tileSizeForStep,
  shouldCull,
  visibleRange,
  centerScroll,
  needsRecenter,
} from './worldViewport';

describe('ship-dark predicate (viewportNeeded)', () => {
  test('10x10 (every current world) does NOT need a viewport', () => {
    expect(viewportNeeded(10, 10)).toBe(false);
  });

  test('smaller grids do not need a viewport either', () => {
    expect(viewportNeeded(5, 5)).toBe(false);
    expect(viewportNeeded(1, 1)).toBe(false);
  });

  test('anything wider or taller than the pane footprint needs one', () => {
    expect(viewportNeeded(11, 10)).toBe(true);
    expect(viewportNeeded(10, 11)).toBe(true);
    expect(viewportNeeded(20, 20)).toBe(true);
    expect(viewportNeeded(30, 30)).toBe(true);
  });

  test('the pane footprint is exactly ten close-step tiles', () => {
    expect(PANE_SIZE).toBe(10 * CLOSE_TILE);
  });
});

describe('zoom-step tile sizes', () => {
  test('close is today\'s 56px tile; medium is 36px', () => {
    expect(tileSizeForStep('close', 30, 30)).toBe(56);
    expect(CLOSE_TILE).toBe(56);
    expect(tileSizeForStep('medium', 30, 30)).toBe(36);
    expect(MEDIUM_TILE).toBe(36);
  });

  test('unknown steps fall back to the close (legacy) size', () => {
    expect(tileSizeForStep('bogus', 30, 30)).toBe(CLOSE_TILE);
    expect(tileSizeForStep(undefined, 30, 30)).toBe(CLOSE_TILE);
  });

  test('steps are ordered zoomed-out to zoomed-in', () => {
    expect(ZOOM_STEPS).toEqual(['fit', 'medium', 'close']);
  });
});

describe('fit-step scaling (fitTileSize)', () => {
  test('20x20 fits the default pane at 27px (accounts for the grid border)', () => {
    expect(fitTileSize(20, 20)).toBe(Math.floor((PANE_SIZE - GRID_BORDER) / 20));
    expect(fitTileSize(20, 20)).toBe(27);
  });

  test('30x30 fits at 18px (plan target: 30x30 at ~20px fits)', () => {
    expect(fitTileSize(30, 30)).toBe(18);
  });

  test('the fitted grid (incl. border) never exceeds the pane', () => {
    for (const n of [11, 15, 20, 25, 30, 40]) {
      const ts = fitTileSize(n, n);
      if (ts > MIN_FIT_TILE) {
        expect(n * ts + GRID_BORDER).toBeLessThanOrEqual(PANE_SIZE);
      }
    }
  });

  test('clamps: never larger than close, never smaller than the minimum', () => {
    expect(fitTileSize(2, 2)).toBe(CLOSE_TILE);
    expect(fitTileSize(100, 100)).toBe(MIN_FIT_TILE);
  });

  test('non-square grids fit the larger dimension', () => {
    // 30 wide, 10 tall: width dominates
    expect(fitTileSize(30, 10)).toBe(18);
  });

  test('respects a measured (smaller) pane', () => {
    expect(fitTileSize(20, 20, 402, 402)).toBe(20);
  });
});

describe('culling threshold (shouldCull)', () => {
  test('10x10 and 20x20 render fully (at or below 400 tiles)', () => {
    expect(shouldCull(10, 10)).toBe(false);
    expect(shouldCull(20, 20)).toBe(false); // exactly 400: not culled
  });

  test('above 400 tiles the render is windowed', () => {
    expect(shouldCull(21, 20)).toBe(true);
    expect(shouldCull(30, 30)).toBe(true);
    expect(CULL_THRESHOLD).toBe(400);
  });
});

describe('windowing math (visibleRange)', () => {
  // 30x30 grid, 56px tiles, 560px pane
  const args = (left, top) => [left, top, 560, 560, 56, 30, 30];

  test('at origin: 10 visible columns/rows plus the 2-tile margin, clamped at 0', () => {
    expect(visibleRange(...args(0, 0))).toEqual({ c0: 0, c1: 11, r0: 0, r1: 11 });
  });

  test('mid-scroll includes partially visible tiles plus margin on both sides', () => {
    // scrollLeft 500: columns 8 (500/56=8.9, floored) .. ceil(1060/56)-1=18, +/-2 margin
    expect(visibleRange(...args(500, 500))).toEqual({ c0: 6, c1: 20, r0: 6, r1: 20 });
  });

  test('clamps at the far edge of the grid', () => {
    // max scroll = 30*56 - 560 = 1120
    expect(visibleRange(...args(1120, 1120))).toEqual({ c0: 18, c1: 29, r0: 18, r1: 29 });
  });

  test('a pane larger than the content renders the whole grid', () => {
    expect(visibleRange(0, 0, 5000, 5000, 56, 30, 30)).toEqual({ c0: 0, c1: 29, r0: 0, r1: 29 });
  });

  test('window plus margin stays comfortably under the full 900 tiles', () => {
    const { c0, c1, r0, r1 } = visibleRange(...args(560, 560));
    const rendered = (c1 - c0 + 1) * (r1 - r0 + 1);
    expect(rendered).toBeLessThan(300);
  });
});

describe('player centering (centerScroll)', () => {
  test('centers the player tile in the pane', () => {
    // player at (15,15) on 30x30 at 56px: tile center = 868, pane 560 -> left 588
    expect(centerScroll(15, 15, 56, 560, 560, 30, 30)).toEqual({ left: 588, top: 588 });
  });

  test('clamps at the top-left corner', () => {
    expect(centerScroll(0, 0, 56, 560, 560, 30, 30)).toEqual({ left: 0, top: 0 });
  });

  test('clamps at the bottom-right corner (max scroll includes the grid border)', () => {
    const max = 30 * 56 + GRID_BORDER - 560;
    expect(centerScroll(29, 29, 56, 560, 560, 30, 30)).toEqual({ left: max, top: max });
  });

  test('content smaller than the pane never scrolls (fit step)', () => {
    expect(centerScroll(15, 15, 18, 560, 560, 30, 30)).toEqual({ left: 0, top: 0 });
  });
});

describe('recenter-on-move margin (needsRecenter)', () => {
  // pane at scroll (560, 560), 560px pane, 56px tiles, margin 2 tiles = 112px
  test('player well inside the pane does not recenter', () => {
    expect(needsRecenter(560, 560, 560, 560, 15, 15, 56)).toBe(false);
  });

  test('player within 2 tiles of a pane edge recenters', () => {
    // column 10 tile center = 588 < 560 + 112
    expect(needsRecenter(560, 560, 560, 560, 10, 15, 56)).toBe(true);
    // column 19 tile center = 1092 > 560 + 560 - 112
    expect(needsRecenter(560, 560, 560, 560, 19, 15, 56)).toBe(true);
    expect(needsRecenter(560, 560, 560, 560, 15, 10, 56)).toBe(true);
    expect(needsRecenter(560, 560, 560, 560, 15, 19, 56)).toBe(true);
  });

  test('player just inside the margin stays put', () => {
    // column 12 tile center = 700 >= 672
    expect(needsRecenter(560, 560, 560, 560, 12, 12, 56)).toBe(false);
    expect(needsRecenter(560, 560, 560, 560, 17, 17, 56)).toBe(false);
  });
});
