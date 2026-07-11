// Site exploration flow through the useGameMap hook (playtest 2026-07-04):
// - R4-R6: walking onto a harvest node returns its loot content to the dispatch layer
//   (Game.js grants it), and consuming it dims the node instead of deleting it silently.
// - R1: the in-modal siteNotice channel sets/appends, is cleared explicitly at the start
//   of a fresh walk (clearSiteNotice), and auto-clears after a few seconds. It is NOT
//   cleared per step, so several grants during one walk accumulate.
// - Multi-quest injection: entering a site injects EVERY active objective for its type,
//   idempotently across re-entries.
//
// Movement note: the party now walks to ANY reachable tile (the 5-tile cap is gone). The
// hook's moveSitePlayerTo moves ONE tile and returns it; Game.js computes the path and
// steps it. moveSitePlayerTo sets the position directly for any walkable tile (no adjacency
// enforced at the hook layer), so these tests move straight onto a target.
import { renderHook, act } from '@testing-library/react';
import useGameMap from './useGameMap';

const noop = () => {};

const renderMap = (requiredSiteObjectives = null) =>
  renderHook(() => useGameMap(
    null,        // loadedConversation
    true,        // hasAdventureStarted
    false,       // isLoading
    noop,        // setError
    '12345',     // worldSeed
    null, null, null, 'grassland',
    requiredSiteObjectives,
    null
  ));

const enterCave = (result) => {
  act(() => {
    result.current.handleEnterLocation(
      { poiType: 'cave_entrance', name: 'a Cave', tile: { x: 2, y: 3, biome: 'plains' } },
      noop, []
    );
  });
};

describe('useGameMap site flow', () => {
  test('R6: stepping onto a harvest node hands its loot to the dispatch layer, and consuming dims it', () => {
    const { result } = renderMap();
    enterCave(result);
    expect(result.current.isInsideSite).toBe(true);

    const node = result.current.currentSiteMap.mapData.flat()
      .find((t) => t.content && t.content.display && !t.content.consumed);
    expect(node).toBeTruthy(); // populated caves always carry harvest nodes

    // moving onto the node returns the tile with its content intact (Game.js branches on it)
    let returned;
    act(() => { returned = result.current.moveSitePlayerTo(node.x, node.y); });
    expect(returned).toBeTruthy();
    expect(returned.content.kind).toBe('loot');
    expect(returned.content.loot.items.length).toBeGreaterThan(0);

    act(() => { result.current.markSiteContentConsumed(node.x, node.y); });
    const after = result.current.currentSiteMap.mapData[node.y][node.x];
    expect(after.content.consumed).toBe(true); // renders as the dim dot, not deleted
  });

  test('siteNotice: pushes append, clearSiteNotice clears, a step does NOT clear, and it auto-dismisses', () => {
    jest.useFakeTimers();
    try {
      const { result } = renderMap();
      enterCave(result);

      act(() => { result.current.pushSiteNotice('💰 You find Raw Gems.'); });
      act(() => { result.current.pushSiteNotice('✓ Collect 3 raw gemstones (1/3)'); });
      expect(result.current.siteNotice).toBe('💰 You find Raw Gems.\n✓ Collect 3 raw gemstones (1/3)');

      // a fresh walk clears the notice explicitly
      act(() => { result.current.clearSiteNotice(); });
      expect(result.current.siteNotice).toBeNull();

      // a single step does NOT clear an accumulating notice (several grants in one walk)
      act(() => { result.current.pushSiteNotice('💰 You find a Copper Ring.'); });
      const entry = result.current.currentSiteMap.entryPoint;
      const step = result.current.currentSiteMap.mapData.flat()
        .find((t) => t.walkable && Math.abs(t.x - entry.x) + Math.abs(t.y - entry.y) === 1);
      act(() => { result.current.moveSitePlayerTo(step.x, step.y); });
      expect(result.current.siteNotice).toBe('💰 You find a Copper Ring.');

      // and a lingering notice dismisses itself after a few seconds
      act(() => { jest.advanceTimersByTime(8000); });
      expect(result.current.siteNotice).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('entering a site injects EVERY active objective for its type, idempotently across re-entries', () => {
    const objectives = {
      cave: [
        { type: 'cave', objectiveType: 'item', id: 'silver_locket', name: 'the Silver Locket', milestoneId: 'lh1', questId: 'lost_heirloom' },
        { type: 'cave', objectiveType: 'item', id: 'cure_root', name: 'the Cure-Root', milestoneId: 'cp1', questId: 'cursed_patient' },
      ],
    };
    const { result } = renderMap(objectives);
    enterCave(result);

    const objectiveIds = () => result.current.currentSiteMap.mapData.flat()
      .filter((t) => t.content?.kind === 'objective')
      .map((t) => t.content.milestoneId)
      .sort();
    expect(objectiveIds()).toEqual(['cp1', 'lh1']); // both quests, distinct slots

    // leave (player is standing on the entrance) and re-enter: no duplicates
    act(() => { result.current.handleLeaveSite(noop, []); });
    expect(result.current.isInsideSite).toBe(false);
    enterCave(result);
    expect(objectiveIds()).toEqual(['cp1', 'lh1']);
  });
});
