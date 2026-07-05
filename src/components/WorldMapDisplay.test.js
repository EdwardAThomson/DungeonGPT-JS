// Component tests for the world-map viewport (LARGER_WORLDS_PLAN step 2).
// The critical contract is ship-dark: a 10x10 world (every current save) must render
// through the legacy path: every tile, 56px, no pane, no zoom UI, clicks unchanged.
// Bigger grids get the scrollable pane, the fixed zoom steps, culling, and the
// click-vs-pan guard.

import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import WorldMapDisplay, { _resetRememberedZoom } from './WorldMapDisplay';

const makeMap = (cols, rows = cols) =>
  Array.from({ length: rows }, (_, y) =>
    Array.from({ length: cols }, (_, x) => ({ x, y, biome: 'plains', isExplored: true }))
  );

const renderMap = (cols, rows = cols, props = {}) => {
  const onTileClick = jest.fn();
  const utils = render(
    <WorldMapDisplay
      mapData={makeMap(cols, rows)}
      playerPosition={{ x: 0, y: 0 }}
      onTileClick={onTileClick}
      firstHero={null}
      {...props}
    />
  );
  return { ...utils, onTileClick };
};

beforeEach(() => {
  _resetRememberedZoom();
});

describe('ship-dark: 10x10 renders exactly like today', () => {
  test('all 100 tiles render, at the legacy 56px size and legacy margin', () => {
    const { container } = renderMap(10);
    expect(container.querySelectorAll('.map-tile')).toHaveLength(100);
    const grid = container.querySelector('.world-map-grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(10, 56px)');
    expect(grid.style.gridTemplateRows).toBe('repeat(10, 56px)');
    expect(grid.style.width).toBe('560px');
    expect(grid.style.margin).toBe('20px auto');
  });

  test('no viewport pane, no zoom UI, no viewport data attributes', () => {
    const { container } = renderMap(10);
    expect(container.querySelector('.world-map-viewport')).toBeNull();
    expect(container.querySelector('.world-map-zoom')).toBeNull();
    expect(screen.queryByLabelText('Zoom in')).toBeNull();
    expect(screen.queryByLabelText('Zoom out')).toBeNull();
    const grid = container.querySelector('.world-map-grid');
    expect(grid.hasAttribute('data-rendered-tiles')).toBe(false);
  });

  test('tiles carry no explicit grid placement (legacy flow order)', () => {
    const { container } = renderMap(10);
    const tile = container.querySelector('.map-tile');
    expect(tile.style.gridColumn).toBe('');
    expect(tile.style.gridRow).toBe('');
  });

  test('click-to-move fires with the tile coordinates', () => {
    const { onTileClick } = renderMap(10);
    fireEvent.click(screen.getByTitle('(3, 4) - plains (Explored)'));
    expect(onTileClick).toHaveBeenCalledWith(3, 4);
  });

  test('re-clicking the standing tile still fires (standing-tile behavior kept)', () => {
    const { onTileClick } = renderMap(10);
    fireEvent.click(screen.getByTitle('(0, 0) - plains (Explored)'));
    expect(onTileClick).toHaveBeenCalledWith(0, 0);
  });

  test('a missing onTileClick does not throw (planning view from town)', () => {
    render(
      <WorldMapDisplay mapData={makeMap(10)} playerPosition={{ x: 0, y: 0 }} firstHero={null} />
    );
    expect(() => fireEvent.click(screen.getByTitle('(3, 4) - plains (Explored)'))).not.toThrow();
  });
});

describe('viewport mode: grids larger than 10x10', () => {
  test('12x12 gets the pane and zoom UI but no culling (144 <= 400 tiles)', () => {
    const { container } = renderMap(12);
    expect(container.querySelector('.world-map-viewport')).not.toBeNull();
    expect(container.querySelector('.world-map-zoom')).not.toBeNull();
    expect(container.querySelectorAll('.map-tile')).toHaveLength(144);
    const grid = container.querySelector('.world-map-grid');
    expect(grid.getAttribute('data-rendered-tiles')).toBe('144');
    expect(grid.getAttribute('data-total-tiles')).toBe('144');
  });

  test('30x30 windows the render: far fewer than 900 tiles in the DOM', () => {
    const { container } = renderMap(30);
    const grid = container.querySelector('.world-map-grid');
    expect(grid.getAttribute('data-total-tiles')).toBe('900');
    const rendered = container.querySelectorAll('.map-tile').length;
    expect(rendered).toBeLessThan(300);
    expect(rendered).toBeGreaterThan(0);
    expect(String(rendered)).toBe(grid.getAttribute('data-rendered-tiles'));
  });

  test('windowed tiles are pinned to their grid coordinates', () => {
    const { container } = renderMap(30);
    const tile = screen.getByTitle('(3, 4) - plains (Explored)');
    expect(tile.style.gridColumn).toBe('4');
    expect(tile.style.gridRow).toBe('5');
    // the grid still spans the full world so scrollbars cover all 30 rows/cols
    const grid = container.querySelector('.world-map-grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(30, 56px)');
  });

  test('click-to-move still fires with the correct coordinates in viewport mode', () => {
    const { onTileClick } = renderMap(30);
    fireEvent.click(screen.getByTitle('(2, 3) - plains (Explored)'));
    expect(onTileClick).toHaveBeenCalledWith(2, 3);
  });
});

describe('zoom steps', () => {
  test('starts at close (56px) and steps down to medium (36px) then fit (18px on 30x30)', () => {
    const { container } = renderMap(30);
    const grid = () => container.querySelector('.world-map-grid');
    expect(grid().style.gridTemplateColumns).toBe('repeat(30, 56px)');

    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(grid().style.gridTemplateColumns).toBe('repeat(30, 36px)');
    expect(grid().getAttribute('data-tile-size')).toBe('36');

    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(grid().style.gridTemplateColumns).toBe('repeat(30, 18px)');
    expect(screen.getByLabelText('Zoom out')).toBeDisabled();
    expect(screen.getByLabelText('Zoom in')).not.toBeDisabled();
  });

  test('zoom-in is disabled at the close step', () => {
    renderMap(20);
    expect(screen.getByLabelText('Zoom in')).toBeDisabled();
    expect(screen.getByLabelText('Zoom out')).not.toBeDisabled();
  });

  test('at the fit step the whole 30x30 grid renders (no culling window needed)', () => {
    const { container } = renderMap(30);
    fireEvent.click(screen.getByLabelText('Zoom out')); // medium
    fireEvent.click(screen.getByLabelText('Zoom out')); // fit: 18px -> 540px grid in 560px pane
    expect(container.querySelectorAll('.map-tile')).toHaveLength(900);
  });

  test('the chosen step is remembered across close/reopen (module session state)', () => {
    const first = renderMap(30);
    fireEvent.click(screen.getByLabelText('Zoom out')); // medium
    first.unmount();

    const second = renderMap(30);
    const grid = second.container.querySelector('.world-map-grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(30, 36px)');
  });

  test('the remembered step never touches 10x10 worlds (still 56px, no UI)', () => {
    const big = renderMap(30);
    fireEvent.click(screen.getByLabelText('Zoom out'));
    big.unmount();

    const { container } = renderMap(10);
    const grid = container.querySelector('.world-map-grid');
    expect(grid.style.gridTemplateColumns).toBe('repeat(10, 56px)');
    expect(container.querySelector('.world-map-zoom')).toBeNull();
  });
});

describe('click-vs-pan guard', () => {
  // jsdom has no PointerEvent, and fireEvent's generic pointer events carry null
  // coordinates. Dispatching MouseEvents under the pointer-event type names gives
  // React's synthetic pointer events real clientX/clientY.
  const pointer = (el, type, x, y) =>
    fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));

  test('a drag beyond the threshold swallows the trailing click', () => {
    const { container, onTileClick } = renderMap(30);
    const pane = container.querySelector('.world-map-viewport');
    const tile = screen.getByTitle('(1, 1) - plains (Explored)');

    pointer(pane, 'pointerdown', 100, 100);
    pointer(pane, 'pointermove', 140, 100);
    pointer(pane, 'pointerup', 140, 100);
    fireEvent.click(tile);
    expect(onTileClick).not.toHaveBeenCalled();

    // the guard resets: the next clean click goes through
    fireEvent.click(tile);
    expect(onTileClick).toHaveBeenCalledWith(1, 1);
  });

  test('sub-threshold jitter still counts as a click', () => {
    const { container, onTileClick } = renderMap(30);
    const pane = container.querySelector('.world-map-viewport');
    const tile = screen.getByTitle('(1, 1) - plains (Explored)');

    pointer(pane, 'pointerdown', 100, 100);
    pointer(pane, 'pointermove', 103, 101);
    pointer(pane, 'pointerup', 103, 101);
    fireEvent.click(tile);
    expect(onTileClick).toHaveBeenCalledWith(1, 1);
  });
});

describe('props contract preserved', () => {
  test('hidden milestone POI: sprite suppressed until unlocked (both render paths)', () => {
    const buildMap = (n) => {
      const m = makeMap(n);
      m[2][2] = { ...m[2][2], poi: 'milestone_site', milestonePoi: true, poiName: 'Dark Altar' };
      return m;
    };
    for (const n of [10, 12]) {
      const hidden = render(
        <WorldMapDisplay
          mapData={buildMap(n)}
          playerPosition={{ x: 0, y: 0 }}
          onTileClick={() => {}}
          firstHero={null}
          visibleMilestonePois={new Set()}
        />
      );
      expect(hidden.queryByText('Dark Altar')).toBeNull();
      hidden.unmount();

      const shown = render(
        <WorldMapDisplay
          mapData={buildMap(n)}
          playerPosition={{ x: 0, y: 0 }}
          onTileClick={() => {}}
          firstHero={null}
          visibleMilestonePois={new Set(['milestone_site'])}
        />
      );
      expect(shown.getByText('Dark Altar')).toBeInTheDocument();
      shown.unmount();
    }
  });

  test('loading state unchanged', () => {
    render(<WorldMapDisplay mapData={[]} playerPosition={{ x: 0, y: 0 }} />);
    expect(screen.getByText('Loading map...')).toBeInTheDocument();
  });
});
