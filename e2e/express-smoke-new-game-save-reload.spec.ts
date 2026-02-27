import { expect, test, Page, Route } from '@playwright/test';

/**
 * E2E Test: Express Backend - Full Game Flow
 * 
 * Tests complete game workflow using Express/SQLite backend (local dev).
 * Validates: hero creation, map generation, movement, save, and reload.
 * 
 * Run with: npx playwright test express-smoke-new-game-save-reload
 * Requires: Express server running on localhost:5000
 */

const createHeroPayload = (name: string, id: string) => ({
  heroId: id,
  heroName: name,
  heroGender: 'Male',
  profilePicture: 'https://picsum.photos/seed/dungeongpt-e2e/200/200',
  heroRace: 'Human',
  heroClass: 'Fighter',
  heroLevel: 1,
  heroBackground: 'A veteran scout from the borderlands.',
  heroAlignment: 'Neutral Good',
  stats: {
    Strength: 14,
    Dexterity: 12,
    Constitution: 13,
    Intelligence: 10,
    Wisdom: 11,
    Charisma: 9
  }
});

const mockLlmEndpoints = async (page: Page) => {
  let taskCounter = 0;

  await page.route('**/api/llm/generate', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: 'E2E mock narrative response.' })
    });
  });

  await page.route('**/api/llm/tasks', async (route: Route) => {
    taskCounter += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: `e2e-task-${taskCounter}`, status: 'queued' })
    });
  });

  await page.route('**/api/llm/tasks/*/stream', async (route: Route) => {
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream'
      },
      body:
        'data: {"type":"status","data":{"state":"running"}}\n\n' +
        'data: {"type":"log","data":{"stream":"stdout","line":"E2E streamed narrative."}}\n\n' +
        'data: {"type":"done"}\n\n'
    });
  });
};

const moveOneTile = async (page: Page) => {
  await page.locator('button:has-text("Map")').first().click();
  await expect(page.getByRole('heading', { name: 'World Map' })).toBeVisible();

  await page.evaluate(() => {
    const tiles = Array.from(document.querySelectorAll('.world-map-grid .map-tile'));
    const playerIndex = tiles.findIndex((tile) => tile.classList.contains('player-tile'));
    if (playerIndex < 0) throw new Error('Player tile not found');

    // 10x10 world map in game generation defaults.
    const width = 10;
    const x = playerIndex % width;
    const y = Math.floor(playerIndex / width);
    const coords = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
      [x + 1, y + 1],
      [x + 1, y - 1],
      [x - 1, y + 1],
      [x - 1, y - 1]
    ];
    const targetIndex = coords
      .filter(([cx, cy]) => cx >= 0 && cx < width && cy >= 0)
      .map(([cx, cy]) => cy * width + cx)
      .find((idx) => idx >= 0 && idx < tiles.length);
    if (targetIndex === undefined) throw new Error('No adjacent tile candidate found');

    (tiles[targetIndex] as HTMLElement).click();
  });

  // Close map if still visible.
  const closeMapButton = page.getByRole('button', { name: 'Close Map' });
  if (await closeMapButton.isVisible()) {
    await closeMapButton.click();
  }

  const closeEncounterButton = page.getByRole('button', { name: /Close/i }).first();
  if (await closeEncounterButton.isVisible()) {
    await closeEncounterButton.click();
  }

  const dismissCandidates = [
    page.getByRole('button', { name: /Continue Journey/i }),
    page.getByRole('button', { name: /Flee Encounter/i }),
    page.getByRole('button', { name: /Continue/i }),
    page.getByRole('button', { name: /Close/i })
  ];
  for (const button of dismissCandidates) {
    if (await button.isVisible()) {
      await button.click();
      break;
    }
  }
};

test('new game -> move -> save -> reload', async ({ page, request }) => {
  const heroName = `E2E Hero ${Date.now()}`;
  const heroId = `e2e-hero-${Date.now()}`;

  const createHeroResponse = await request.post('http://127.0.0.1:5000/heroes', {
    data: createHeroPayload(heroName, heroId)
  });
  expect(createHeroResponse.ok()).toBeTruthy();

  await mockLlmEndpoints(page);

  await page.goto('/');
  await page.getByRole('link', { name: /Start Adventure/i }).click();

  await page.getByLabel('Adventure Description').fill('A compact E2E smoke scenario.');
  await page.getByLabel('Grimness').selectOption('Neutral');
  await page.getByLabel('Darkness').selectOption('Grey');
  await page.getByRole('button', { name: /Generate World Map|Build Map from Seed/ }).click();
  await expect(page.getByText('Map generated!')).toBeVisible();
  await page.getByRole('button', { name: /Next: Select Heroes/i }).click();

  await expect(page.getByRole('heading', { name: /Select Your Party/i })).toBeVisible();
  await page.locator('.hero-item', { hasText: heroName }).first().click();
  await page.getByRole('button', { name: /Start Game with Selected Heroes/i }).click();

  await expect(page.getByRole('heading', { name: 'Adventure Log' })).toBeVisible();
  await page.getByRole('button', { name: /Start the Adventure!/i }).click();
  await expect(page.getByText(/E2E (mock|streamed) narrative/i)).toBeVisible();

  const locationBefore = (await page.locator('.game-info-header p').nth(0).textContent()) || '';
  await moveOneTile(page);
  const locationAfter = (await page.locator('.game-info-header p').nth(0).textContent()) || '';
  expect(locationAfter).not.toEqual(locationBefore);

  await page.getByRole('button', { name: /Save/i }).first().click();

  await page.getByRole('button', { name: /Games/i }).click();
  await page.getByRole('link', { name: /Saved Games/i }).click();

  await expect(page.getByRole('heading', { name: /Saved Conversations/i })).toBeVisible();
  await page.getByRole('button', { name: /Load Game/i }).first().click();

  await expect(page.getByRole('heading', { name: 'Adventure Log' })).toBeVisible();
  const locationReloaded = (await page.locator('.game-info-header p').nth(0).textContent()) || '';
  expect(locationReloaded).toEqual(locationAfter);
});
