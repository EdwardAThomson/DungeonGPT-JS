import { expect, test, Page, Route } from '@playwright/test';

/**
 * E2E Test: Guest (logged-out) local save + hard-reload resume + save naming.
 *
 * A guest's game is saved to browser IndexedDB (dungeongpt-games), with NO backend and
 * NO auth. This test proves:
 *   1. A manual Save writes a row to IndexedDB (guest saves persist locally).
 *   2. A hard browser reload RESUMES the game with progress intact (the GameResumeGate
 *      wrapper), instead of starting a blank adventure. Regression guard for the
 *      data-loss bug where reload reverted to the game's starting snapshot.
 *   3. The editable save-name root persists (game_settings.saveName) and the display name
 *      is "<root> - <date> <time>".
 *   4. The Save button reports honestly: a second save with no changes says "Already saved".
 *
 * Never signs in, so all persistence routes to the browser (localHeroStore + localGameStore).
 *
 * Run with: npx playwright test guest-save-reload-resume
 */

const guestHero = {
  heroId: 'guest-e2e-hero',
  heroName: 'Kael the Guest',
  heroGender: 'Male',
  profilePicture: 'assets/portraits/human_male_fighter_1.webp',
  heroRace: 'Human',
  heroClass: 'Fighter',
  heroLevel: 1,
  heroBackground: 'A veteran scout from the borderlands.',
  heroAlignment: 'Neutral Good',
  stats: { Strength: 14, Dexterity: 12, Constitution: 13, Intelligence: 10, Wisdom: 11, Charisma: 9 }
};

// Read the guest games out of IndexedDB for hard evidence that the save persisted.
const readGames = (page: Page) => page.evaluate(() => new Promise<any[]>((resolve) => {
  const req = indexedDB.open('dungeongpt-games');
  req.onerror = () => resolve([]);
  req.onsuccess = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains('games')) return resolve([]);
    const all = db.transaction('games', 'readonly').objectStore('games').getAll();
    all.onsuccess = () => resolve(all.result.map((r: any) => ({
      session_id: r.session_id,
      conversation_name: r.conversation_name,
      convLen: (r.conversation_data || []).length,
      hasWorldMap: !!r.world_map,
      player_position: r.player_position,
      saveName: r.game_settings && r.game_settings.saveName
    })));
    all.onerror = () => resolve([]);
  };
}));

// Guests use local narration, but mock the AI/embed endpoints so nothing hangs on a
// missing/misconfigured backend during a start.
const mockAi = async (page: Page) => {
  await page.route('**/api/ai/**', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: 'E2E mock DM narrative.' }) }));
  await page.route('**/api/embed**', (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ embedding: [] }) }));
};

const location = (page: Page) => page.locator('.game-info-header p').first().textContent().then((t) => (t || '').trim());

const moveOneTile = async (page: Page) => {
  await page.getByRole('button', { name: /Map/i }).first().click();
  await expect(page.getByRole('heading', { name: 'World Map' })).toBeVisible();
  await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.world-map-grid .map-tile'));
    const pi = tiles.findIndex((t) => t.classList.contains('player-tile'));
    const width = 10;
    const x = pi % width;
    const y = Math.floor(pi / width);
    const cands = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
      .filter(([cx, cy]) => cx >= 0 && cx < width && cy >= 0)
      .map(([cx, cy]) => cy * width + cx)
      .filter((i) => i >= 0 && i < tiles.length);
    if (cands.length) (tiles[cands[0]] as HTMLElement).click();
  });
  const closeMap = page.getByRole('button', { name: /Close Map/i });
  if (await closeMap.isVisible().catch(() => false)) await closeMap.click();
  for (const name of [/Continue Journey/i, /Continue/i, /Close/i]) {
    const b = page.getByRole('button', { name }).first();
    if (await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); break; }
  }
  await page.waitForTimeout(600);
};

test('guest save persists to IndexedDB and a hard reload resumes with progress', async ({ page }) => {
  test.setTimeout(120_000);

  // Seed a guest hero. NOTE: addInitScript re-runs on every load (incl. reload), so it must
  // NOT touch activeGameSessionId or it would sabotage the resume we are testing.
  await page.addInitScript(([h]) => {
    if (!localStorage.getItem('dungeongpt:localHeroes')) {
      localStorage.setItem('dungeongpt:localHeroes', JSON.stringify([h]));
    }
    localStorage.setItem('tutorialDone', 'true');
  }, [guestHero]);
  await mockAi(page);

  // New game via a ready-made template.
  await page.goto('/new-game');
  await expect(page.getByRole('heading', { name: /New Game Setup/i })).toBeVisible();
  const readyTab = page.getByRole('button', { name: /Ready-Made/i });
  if (await readyTab.count()) await readyTab.click().catch(() => {});
  await page.getByText('The Goblin Threat', { exact: true }).first().click(); // select the card (not "details")
  await page.getByRole('button', { name: /Next: Select Heroes/i }).click();

  await expect(page).toHaveURL(/hero-selection/, { timeout: 15_000 });
  await page.locator('.hero-item', { hasText: 'Kael the Guest' }).first().click();
  await page.getByRole('button', { name: /Start Game with Selected Heroes/i }).click();

  await expect(page.getByRole('heading', { name: 'Adventure Log' })).toBeVisible({ timeout: 15_000 });
  const startBtn = page.getByRole('button', { name: /Start the Adventure/i });
  if (await startBtn.count()) await startBtn.click();
  await page.waitForTimeout(1000);

  // Make progress: move one tile.
  const locBefore = await location(page);
  await moveOneTile(page);
  const locAfter = await location(page);
  expect(locAfter).not.toEqual(locBefore);

  // 1) Manual save -> confirmation + a real IndexedDB row.
  await page.getByRole('button', { name: /Save game manually/i }).first().click();
  await expect(page.getByRole('heading', { name: /Game Saved/i })).toBeVisible();
  const afterSave = await readGames(page);
  expect(afterSave.length).toBeGreaterThan(0);
  expect(afterSave[0].hasWorldMap).toBeTruthy();
  expect(afterSave[0].player_position).toBeTruthy();

  // 3) Rename the campaign root -> persists in game_settings.saveName + "<root> - <ts>".
  await page.locator('#save-root-name').fill('Goblin Test');
  await page.getByRole('button', { name: /^Rename$/ }).click();
  await page.waitForTimeout(400);
  const afterRename = await readGames(page);
  expect(afterRename[0].saveName).toBe('Goblin Test');
  expect(afterRename[0].conversation_name).toMatch(/^Goblin Test - /);
  await page.getByRole('button', { name: /^Continue$/ }).click();

  // 2) THE DATA-LOSS FIX: hard reload must resume at the same progress, not the start.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Adventure Log' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(1000);
  const locReloaded = await location(page);
  expect(locReloaded).toEqual(locAfter);

  // Rename survived the reload.
  const afterReload = await readGames(page);
  expect(afterReload[0].saveName).toBe('Goblin Test');

  // 4) Honest feedback: save (writes) then save again with no changes (already saved).
  await page.getByRole('button', { name: /Save game manually/i }).first().click();
  await expect(page.getByRole('heading', { name: /Game Saved/i })).toBeVisible();
  await page.getByRole('button', { name: /^Continue$/ }).click();
  await page.getByRole('button', { name: /Save game manually/i }).first().click();
  await expect(page.getByRole('heading', { name: /Already saved/i })).toBeVisible();
});
