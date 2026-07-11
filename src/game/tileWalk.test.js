import { computeWalkPath, runTileWalk, TILE_STEP_MS } from './tileWalk';

// Build a rectangular grid of tiles. `blocked` is a set of "x,y" strings marked
// unwalkable; every other tile is walkable.
const makeGrid = (width, height, blocked = new Set()) => {
  const mapData = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      row.push({ x, y, walkable: !blocked.has(`${x},${y}`) });
    }
    mapData.push(row);
  }
  return mapData;
};

const isWalkable = (tile) => !!tile && tile.walkable;

describe('computeWalkPath', () => {
  test('straight line returns each intermediate step through the goal', () => {
    const grid = makeGrid(5, 1);
    const path = computeWalkPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 }, isWalkable);
    expect(path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
  });

  test('routes around an obstacle (shortest length preserved)', () => {
    // Wall down the middle column except the bottom row, forcing a detour.
    const blocked = new Set(['2,0', '2,1']);
    const grid = makeGrid(5, 3, blocked);
    const path = computeWalkPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 }, isWalkable);
    // Manhattan distance is 4 but the wall forces a longer route; the path must be
    // contiguous, avoid blocked tiles, and end on the goal.
    expect(path.length).toBeGreaterThan(4);
    path.forEach((p) => expect(blocked.has(`${p.x},${p.y}`)).toBe(false));
    expect(path[path.length - 1]).toEqual({ x: 4, y: 0 });
    let prev = { x: 0, y: 0 };
    path.forEach((p) => {
      expect(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)).toBe(1);
      prev = p;
    });
  });

  test('unreachable goal returns empty', () => {
    // Wall the goal off entirely.
    const blocked = new Set(['3,0', '3,1', '3,2', '2,0', '2,1', '2,2']);
    const grid = makeGrid(5, 3, blocked);
    const path = computeWalkPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 }, isWalkable);
    expect(path).toEqual([]);
  });

  test('goal equal to start returns empty', () => {
    const grid = makeGrid(5, 5);
    const path = computeWalkPath(grid, { x: 2, y: 2 }, { x: 2, y: 2 }, isWalkable);
    expect(path).toEqual([]);
  });

  test('unwalkable goal tile returns empty', () => {
    const grid = makeGrid(5, 1, new Set(['4,0']));
    const path = computeWalkPath(grid, { x: 0, y: 0 }, { x: 4, y: 0 }, isWalkable);
    expect(path).toEqual([]);
  });
});

describe('runTileWalk', () => {
  test('enters tiles one per TILE_STEP_MS via an injected scheduler', () => {
    // Collect (fn, ms) pairs instead of firing them; fire manually to model timers.
    const pending = [];
    const schedule = (fn, ms) => {
      pending.push({ fn, ms });
      return pending.length - 1;
    };
    const flushOne = () => {
      const job = pending.shift();
      if (job) job.fn();
    };

    const path = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const entered = [];
    runTileWalk({
      path,
      stepIntervalMs: TILE_STEP_MS,
      schedule,
      onEnterTile: (pos, index) => {
        entered.push({ pos, index });
        return 'continue';
      },
    });

    // Nothing runs until the scheduler fires; each fire enters exactly one tile and
    // queues the next at the same interval.
    expect(entered).toHaveLength(0);
    expect(pending[0].ms).toBe(TILE_STEP_MS);
    flushOne();
    expect(entered).toEqual([{ pos: { x: 1, y: 0 }, index: 0 }]);
    flushOne();
    flushOne();
    expect(entered.map((e) => e.pos)).toEqual(path);
    // No further steps scheduled once the path is exhausted.
    expect(pending).toHaveLength(0);
  });

  test("onEnterTile returning 'halt' stops the walk; later tiles never entered", () => {
    const pending = [];
    const schedule = (fn) => { pending.push(fn); return pending.length - 1; };
    const flushOne = () => { const fn = pending.shift(); if (fn) fn(); };

    const path = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }];
    const entered = [];
    runTileWalk({
      path,
      stepIntervalMs: TILE_STEP_MS,
      schedule,
      // Encounter fires on the 2nd tile: halt there.
      onEnterTile: (pos, index) => {
        entered.push(pos);
        return index === 1 ? 'halt' : 'continue';
      },
    });

    flushOne(); // enter tile 0
    flushOne(); // enter tile 1 -> halt
    // Halting must have scheduled nothing further.
    expect(pending).toHaveLength(0);
    flushOne(); // no-op
    expect(entered).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  test('cancel() stops pending steps', () => {
    const pending = [];
    const schedule = (fn) => { pending.push(fn); return pending.length - 1; };
    const flushOne = () => { const fn = pending.shift(); if (fn) fn(); };

    const path = [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];
    const entered = [];
    const cancel = runTileWalk({
      path,
      stepIntervalMs: TILE_STEP_MS,
      schedule,
      onEnterTile: (pos) => { entered.push(pos); return 'continue'; },
    });

    flushOne(); // enter tile 0, schedules tile 1
    cancel();   // cancel before tile 1 fires
    flushOne(); // the queued callback should no-op due to the cancelled flag
    expect(entered).toEqual([{ x: 1, y: 0 }]);
  });

  test('drives real setTimeout by default (fake timers)', () => {
    jest.useFakeTimers();
    try {
      const path = [{ x: 1, y: 0 }, { x: 2, y: 0 }];
      const entered = [];
      runTileWalk({
        path,
        stepIntervalMs: TILE_STEP_MS,
        onEnterTile: (pos) => { entered.push(pos); return 'continue'; },
      });
      expect(entered).toHaveLength(0);
      jest.advanceTimersByTime(TILE_STEP_MS);
      expect(entered).toEqual([{ x: 1, y: 0 }]);
      jest.advanceTimersByTime(TILE_STEP_MS);
      expect(entered).toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    } finally {
      jest.useRealTimers();
    }
  });
});
