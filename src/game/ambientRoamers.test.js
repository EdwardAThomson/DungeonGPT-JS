import generateSiteMap from '../utils/siteMapGenerator';
import { populateSite, repopulateSiteRoamers } from './sitePopulator';
import { AMBIENT_ROAMER_TARGET } from './mobMovement';

const liveRoamers = (site) => site.mobs.filter(m => m.wandering && !m.defeated);

test('a fresh site is seeded with ambient roamers; clearing + re-entry re-colonises', () => {
  const site = generateSiteMap('cave', 'Test Cave', 'south', 1234, { biome: 'plains' });
  populateSite(site, 1234, 3);
  const seeded = liveRoamers(site);
  expect(seeded.length).toBe(AMBIENT_ROAMER_TARGET);
  // roamers are gentle (never hard/deadly) and start idle
  expect(seeded.every(m => ['easy','medium'].includes(m.encounter.difficulty))).toBe(true);
  expect(seeded.every(m => m.state === 'idle')).toBe(true);

  // Player clears them all.
  seeded.forEach(m => { m.defeated = true; });
  expect(liveRoamers(site).length).toBe(0);

  // Re-entry tops back up to target, and prunes the defeated husks.
  repopulateSiteRoamers(site, 3);
  expect(liveRoamers(site).length).toBe(AMBIENT_ROAMER_TARGET);
  expect(site.mobs.filter(m => m.wandering && m.defeated).length).toBe(0); // pruned

  // Re-entry when already at target is a no-op (idempotent).
  const before = site.mobs.length;
  repopulateSiteRoamers(site, 3);
  expect(site.mobs.length).toBe(before);

  // Roamers never sit on the entrance or a content/slot tile.
  const md = site.mapData;
  liveRoamers(site).forEach(m => {
    const t = md[m.y][m.x];
    expect(t.type).not.toBe('entrance');
    expect(t.walkable).toBe(true);
    expect(!!t.content).toBe(false);
    expect(!!t.contentSlot).toBe(false);
  });
});
