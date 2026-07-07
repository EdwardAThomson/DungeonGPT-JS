import { expect, test, Page, Route } from '@playwright/test';

/**
 * E2E: frozen-frontier-t1's milestone quest building exists and is interactable
 * (playtest 2026-07-07: "the snow quest is asking me to recover something from the
 * Trading Post in the town, but there is no Trading Post building").
 *
 * Runs as a GUEST with the entitlements dev override (dungeongpt:premium) lifting the
 * tier to member, which unlocks the snow template. World seed 103 is pinned: on that
 * world Hearthmere (the milestone town) is the STARTING town and "The Hearthmere
 * Trading Post" (warehouse) is injected at town tile (6, 8).
 *
 * Proves, in the real built app:
 *   1. Starting the Frozen Frontier arc launches on a world containing Hearthmere.
 *   2. Entering Hearthmere shows exactly one warehouse tile (the injected venue).
 *   3. Walking within reach reveals the venue's authored name and opens its
 *      BuildingModal (the interaction surface the quest item search lives on).
 *
 * NOTE: needs the dev override enabled in the bundle (dev server, or a production
 * build made with REACT_APP_ENABLE_DEBUG_ROUTES=true).
 *
 * Run with: npx playwright test frozen-frontier-trading-post
 */

const WORLD_SEED = '103';
const POST_NAME = 'The Hearthmere Trading Post';
const POST_TILE = { x: 6, y: 8 };

const guestHero = {
  heroId: 'guest-e2e-hero-ff',
  heroName: 'Sigrid the Guest',
  heroGender: 'Female',
  profilePicture: 'assets/portraits/human_male_fighter_1.webp',
  heroRace: 'Human',
  heroClass: 'Fighter',
  heroLevel: 1,
  heroBackground: 'A frontier scout.',
  heroAlignment: 'Neutral Good',
  stats: { Strength: 14, Dexterity: 12, Constitution: 13, Intelligence: 10, Wisdom: 11, Charisma: 9 }
};

const mockAi = async (page: Page) => {
  await page.route('**/api/ai/**', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'E2E mock DM narrative.' }) }));
  await page.route('**/api/embed**', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ embedding: [] }) }));
};

// Town tiles carry `title="(x, y) - <name>..."`; clickable (in-range walkable) tiles
// have cursor:pointer. Click the clickable tile that gets the party closest to the
// target, one 5-tile hop per call. Returns the titles snapshot for probing.
const hopToward = (page: Page, target: { x: number, y: number }) =>
  page.evaluate((tgt) => {
    const tiles = Array.from(document.querySelectorAll('div[title]')) as HTMLElement[];
    const parse = (t: HTMLElement) => {
      const m = (t.getAttribute('title') || '').match(/^\((\d+), (\d+)\)/);
      return m ? { el: t, x: Number(m[1]), y: Number(m[2]) } : null;
    };
    const clickable = tiles.map(parse).filter((p): p is NonNullable<typeof p> => !!p)
      .filter((p) => getComputedStyle(p.el).cursor === 'pointer')
      .filter((p) => !(p.el.getAttribute('title') || '').includes('Leave'));
    if (clickable.length === 0) return { moved: false };
    clickable.sort((a, b) =>
      (Math.abs(a.x - tgt.x) + Math.abs(a.y - tgt.y)) - (Math.abs(b.x - tgt.x) + Math.abs(b.y - tgt.y)));
    clickable[0].el.click();
    return { moved: true, to: { x: clickable[0].x, y: clickable[0].y } };
  }, target);

const townTileTitles = (page: Page) =>
  page.evaluate(() =>
    (Array.from(document.querySelectorAll('div[title]')) as HTMLElement[])
      .map((t) => t.getAttribute('title') || '')
      .filter((t) => /^\(\d+, \d+\) - /.test(t)));

test('frozen-frontier-t1: The Hearthmere Trading Post exists in Hearthmere and opens', async ({ page }) => {
  test.setTimeout(180_000);

  await page.addInitScript(([h]) => {
    if (!localStorage.getItem('dungeongpt:localHeroes')) {
      localStorage.setItem('dungeongpt:localHeroes', JSON.stringify([h]));
    }
    localStorage.setItem('tutorialDone', 'true');
    // Entitlements dev override: lift the guest tier to member so the snow
    // (premium-biome) template is startable. Non-production bundles only.
    localStorage.setItem('dungeongpt:premium', 'true');
  }, [guestHero]);
  await mockAi(page);

  await page.goto('/new-game');
  await expect(page.getByRole('heading', { name: /New Game Setup/i })).toBeVisible();

  // Re-enact the playtest bug flow: build a preview map on ANOTHER tab first (the
  // seed input + Generate button only exist on Custom/Freeform). This preview has
  // NO Hearthmere on it; before the fix, picking the template kept it and the
  // trading post never existed anywhere.
  await page.getByRole('button', { name: /Freeform/i }).click();
  await page.locator('#worldSeed').fill(WORLD_SEED); // pinned: Hearthmere is the starting town
  await page.getByRole('button', { name: /Generate World Map|Build Map from Seed/i }).click();
  await expect(page.getByText(/Map generated!/i)).toBeVisible();

  // Now pick the Frozen Frontier arc (its entry chapter is t1).
  await page.getByRole('button', { name: /Ready-Made/i }).click();
  await page.locator('[data-testid^="arc-card-frozen"]').first().click();

  await page.getByRole('button', { name: /Next: Select Heroes/i }).click();
  await expect(page).toHaveURL(/hero-selection/, { timeout: 15_000 });
  await page.locator('.hero-item', { hasText: 'Sigrid the Guest' }).first().click();
  await page.getByRole('button', { name: /Start Game with Selected Heroes/i }).click();

  await expect(page.getByRole('heading', { name: 'Adventure Log' })).toBeVisible({ timeout: 15_000 });
  const startBtn = page.getByRole('button', { name: /Start the Adventure/i });
  if (await startBtn.count()) await startBtn.click();
  await page.waitForTimeout(800);

  // Open the map; the party starts ON Hearthmere, so the Enter button is offered.
  await page.getByRole('button', { name: /Map/i }).first().click();
  await expect(page.getByRole('heading', { name: 'World Map' })).toBeVisible();
  await page.getByRole('button', { name: /Enter Hearthmere/i }).click();
  await expect(page.getByRole('heading', { name: /Hearthmere/ })).toBeVisible({ timeout: 10_000 });

  // DOM probe 1: the town renders EXACTLY ONE warehouse tile (the injected quest
  // venue; village rosters carry no warehouse of their own), at the pinned coords.
  const titles = await townTileTitles(page);
  const warehouseTiles = titles.filter((t) => /warehouse|Trading Post/i.test(t));
  expect(warehouseTiles.length).toBe(1);
  expect(warehouseTiles[0]).toContain(`(${POST_TILE.x}, ${POST_TILE.y})`);

  // Walk toward the trading post until its authored name is visible (<= 2 tiles).
  let named = false;
  for (let i = 0; i < 14 && !named; i++) {
    await hopToward(page, POST_TILE);
    await page.waitForTimeout(250);
    const t = await townTileTitles(page);
    named = t.some((x) => x.includes(POST_NAME));
  }
  expect(named).toBe(true);

  // DOM probe 2 + screenshot: the building tile opens its BuildingModal by name.
  await page.locator(`div[title*="${POST_NAME}"]`).first().click();
  await expect(page.getByText(POST_NAME).first()).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: 'test-results/frozen-frontier-trading-post.png', fullPage: true });
});
