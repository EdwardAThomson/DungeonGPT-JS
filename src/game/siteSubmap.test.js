import { buildSubMapsPayload, buildSaveFingerprint } from './saveController';
import { buildPoiEncounter } from './worldMoveController';
import { generateSiteMap } from '../utils/siteMapGenerator';

describe('site sub-map persistence + entry wiring', () => {
  test('buildSubMapsPayload round-trips site state', () => {
    const site = generateSiteMap('cave', 'Hollow Deep', 'south', 7);
    const payload = buildSubMapsPayload({
      currentMapLevel: 'site',
      townMapsCache: {},
      currentSiteMap: site,
      sitePlayerPosition: { x: 3, y: 4 },
      currentSiteTile: { x: 5, y: 6, poi: 'cave_entrance', biome: 'plains' },
      isInsideSite: true,
      siteMapsCache: { 'cave_entrance_5,6': site },
    });
    expect(payload.currentMapLevel).toBe('site');
    expect(payload.isInsideSite).toBe(true);
    expect(payload.sitePlayerPosition).toEqual({ x: 3, y: 4 });
    expect(payload.currentSiteMap.name).toBe('Hollow Deep');
    expect(payload.siteMapsCache['cave_entrance_5,6']).toBeTruthy();
    // serialisable for the backend
    expect(() => JSON.stringify(payload)).not.toThrow();
  });

  test('payload defaults site fields when landlocked of sites (back-compat)', () => {
    const payload = buildSubMapsPayload({ currentMapLevel: 'world', townMapsCache: {} });
    expect(payload.currentSiteMap).toBeNull();
    expect(payload.isInsideSite).toBe(false);
    expect(payload.siteMapsCache).toEqual({});
  });

  test('site player position changes the save fingerprint (so moves autosave)', () => {
    const base = { conversation: [], playerPosition: { x: 1, y: 1 }, currentMapLevel: 'site', isInsideSite: true };
    const a = buildSaveFingerprint({ ...base, sitePlayerPosition: { x: 2, y: 2 } });
    const b = buildSaveFingerprint({ ...base, sitePlayerPosition: { x: 3, y: 2 } });
    expect(a).not.toBe(b);
  });

  test('caves, ruins, forests, hills and mountains are enterable from the world map', () => {
    expect(buildPoiEncounter({ poi: 'cave_entrance' }).canEnter).toBe(true);
    expect(buildPoiEncounter({ poi: 'ruins' }).canEnter).toBe(true);
    // and get a friendly label, not the raw poi key
    expect(buildPoiEncounter({ poi: 'cave_entrance' }).name).toBe('a Cave');
    expect(buildPoiEncounter({ poi: 'ruins' }).name).toBe('Ruins');
    // forest / hills / mountain are now explorable POI sites too (always, not quest-gated)
    expect(buildPoiEncounter({ poi: 'forest' }).canEnter).toBe(true);
    expect(buildPoiEncounter({ poi: 'hills' }).canEnter).toBe(true);
    expect(buildPoiEncounter({ poi: 'mountain' }).canEnter).toBe(true);
  });
});
