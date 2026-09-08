import { expect, test, type Page } from '@playwright/test';

// Never use headless tests to prefetch/pan public OSM tiles. All basemap requests
// are local fixtures; geolocation, catch persistence and (when enabled) sync are real app paths.
const tile = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH2kAAAAASUVORK5CYII=', 'base64');
const tilePattern = 'https://tile.openstreetmap.org/**';
async function onboard(page: Page, name: string) {
  await page.goto(process.env.E2E_BASE_URL || '/');
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function createDerby(page: Page, name: string) {
  await page.getByRole('button', { name: 'Start a derby', exact: true }).click();
  await page.getByLabel('Derby name').fill(name);
  await page.getByLabel('Water', { exact: true }).fill('Map verification pond');
  await page.getByRole('button', { name: 'Weight', exact: true }).click();
  await page.getByRole('button', { name: 'Create derby', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function logCatch(page: Page, species: string, locate = true) {
  await page.getByRole('button', { name: 'Log a catch', exact: true }).click();
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  await page.getByLabel('Weight', { exact: true }).fill('2.5');
  await page.getByLabel('Species').fill(species);
  await expect(page.getByLabel('Include my location')).not.toBeChecked();
  if (locate) await page.getByLabel('Include my location').check();
  await page.getByRole('button', { name: 'Save catch', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

for (const width of [320, 375, 1280]) {
  test(`catch map captures locations, fits mobile controls and survives completion at ${width}px`, async ({ page, context }) => {
    test.skip(!!process.env.E2E_BASE_URL, 'Local-only layout and lifecycle checks.');
    await page.setViewportSize({ width, height: 900 });
    let tileRequests = 0;
    let failTiles = false;
    await context.route(tilePattern, route => { tileRequests++; return failTiles ? route.abort() : route.fulfill({ contentType: 'image/png', body: tile }); });
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 44.28, longitude: -73.98 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await onboard(page, 'Map reviewer');
    await createDerby(page, 'Catch map review');
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No catch locations for you yet' })).toBeVisible();
    expect(tileRequests).toBe(0);
    await logCatch(page, 'Bass');
    await expect(page.locator('.map-heading')).toContainText('1 of 1 catch mapped');
    await expect(page.locator('.catch-map-pin')).toHaveCount(1);
    await logCatch(page, 'Perch');
    await context.setGeolocation({ latitude: 44.30, longitude: -73.99 });
    await logCatch(page, 'Trout');
    await logCatch(page, 'No GPS fish', false);
    await expect(page.locator('.map-heading')).toContainText('3 of 4 catches mapped');
    await expect(page.locator('.map-missing')).toHaveText('1 catch has no saved location.');
    await expect(page.locator('.catch-map-pin')).toHaveCount(2);
    await expect(page.locator('.catch-map-pin').first()).toContainText('1+');
    await page.getByRole('button', { name: /Catch 2 · Perch/ }).click();
    await expect(page.locator('.map-selection')).toContainText('Catch 2: Perch');
    await expect(page.locator('.catch-map-pin--selected')).toHaveCount(1);
    await expect(page.locator('.leaflet-popup-content')).toContainText('Catch 2: Perch');
    await page.locator('.leaflet-popup-close-button').click();
    await page.getByRole('button', { name: /Catch 2 · Perch/ }).click();
    await expect(page.locator('.leaflet-popup-content')).toContainText('Catch 2: Perch');
    await page.getByRole('button', { name: 'Fit all catches', exact: true }).click();
    await page.locator('.catch-map-pin[title="Catch 3: Trout"]').click();
    await expect(page.locator('.map-selection')).toContainText('Catch 3: Trout');
    await page.getByRole('button', { name: 'Fit all catches', exact: true }).click();
    for (const button of [page.getByRole('button', { name: 'Map', exact: true }), page.getByRole('button', { name: 'My catches', exact: true }), page.getByRole('button', { name: 'Fit all catches', exact: true }), page.getByRole('button', { name: 'Zoom in', exact: true })]) {
      const box = await button.boundingBox();
      // Chromium can report 43.9999993 for a 44px target after device scaling.
      expect(box!.height + 0.01).toBeGreaterThanOrEqual(44); expect(box!.width + 0.01).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/dink-derby-map-${width}.png`, fullPage: true });
    await page.reload();
    await expect(page.locator('.map-heading')).toContainText('3 of 4 catches mapped');
    await expect(page.getByRole('list', { name: 'Mapped catches' })).toContainText('44.28000, -73.98000');
    for (let index = 0; index < 3; index++) {
      await page.getByRole('button', { name: 'Catches & chat', exact: true }).click();
      await expect(page.locator('.leaflet-container')).toHaveCount(0);
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await expect(page.locator('.leaflet-container')).toHaveCount(1);
    }
    await context.setOffline(true);
    await expect(page.locator('.map-tile-notice')).toContainText('Offline');
    await page.getByRole('button', { name: /Catch 3 · Trout/ }).click();
    await expect(page.locator('.map-selection')).toContainText('Trout');
    await context.setOffline(false);
    failTiles = true;
    await page.getByRole('button', { name: 'Catches & chat', exact: true }).click();
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(page.locator('.map-tile-notice')).toContainText('Map background unavailable.');
    failTiles = false;
    await page.getByRole('button', { name: 'Retry background', exact: true }).click();
    await expect(page.locator('.map-tile-notice')).toHaveCount(0);
    await page.getByRole('button', { name: 'Finish derby', exact: true }).click();
    await page.getByRole('button', { name: 'Finish and view results', exact: true }).click();
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await page.reload();
    await expect(page.locator('.map-heading')).toContainText('3 of 4 catches mapped');
    await expect(page.getByRole('button', { name: 'Log a catch', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('denied GPS never blocks a catch or silently claims it was mapped', async ({ page, context }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Local-only permission failure test.');
  await context.route(tilePattern, route => route.fulfill({ contentType: 'image/png', body: tile }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_: unknown, failure: (error: { code: number }) => void) => failure({ code: 1 }) } });
  });
  await onboard(page, 'Denied GPS tester');
  await createDerby(page, 'Denied location review');
  await logCatch(page, 'Saved despite denial');
  await expect(page.locator('.toast')).toContainText('Catch saved without a location. Location permission was denied.');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(page.locator('.map-heading')).toContainText('0 of 1 catch mapped');
  await expect(page.locator('.map-missing')).toHaveText('1 catch has no saved location.');
});

test('shared coordinates sync to another angler and remain visible in historical maps', async ({ browser }) => {
  test.skip(!process.env.E2E_BASE_URL, 'Explicit deployed target required; creates a dedicated QA derby.');
  const ownerContext = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 44.28, longitude: -73.98 } });
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage(), guest = await guestContext.newPage();
  const name = `Map QA ${Date.now().toString(36)}`;
  for (const context of [ownerContext, guestContext]) await context.route(tilePattern, route => route.fulfill({ contentType: 'image/png', body: tile }));
  try {
    await onboard(owner, 'Map QA owner');
    await createDerby(owner, name);
    await expect(owner.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    await owner.getByRole('button', { name: 'Invite anglers', exact: true }).click();
    const code = await owner.getByLabel('Invite code').inputValue();
    await owner.getByRole('button', { name: 'Close', exact: true }).click();
    await onboard(guest, 'Map QA guest');
    await guest.getByRole('button', { name: 'Join with code', exact: true }).click();
    await guest.getByLabel('Invite code').fill(code);
    await guest.getByRole('button', { name: 'Join derby', exact: true }).click();
    await expect(guest.getByRole('dialog')).toHaveCount(0);
    await logCatch(owner, 'Map QA bass');
    await expect(owner.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    await guest.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(guest.locator('.map-heading')).toContainText('0 of 0 catches mapped');
    await guest.getByRole('button', { name: 'All catches', exact: true }).click();
    await expect(guest.locator('.map-heading')).toContainText('1 of 1 catch mapped', { timeout: 30_000 });
    await expect(guest.getByRole('list', { name: 'Mapped catches' })).toContainText('44.28000, -73.98000');
    await guest.getByRole('button', { name: /Catch 1 · Map QA bass/ }).click();
    await expect(guest.locator('.map-selection')).toContainText('Map QA owner');
    await owner.getByRole('button', { name: 'Edit catch', exact: true }).click();
    await owner.getByRole('button', { name: 'Remove catch', exact: true }).click();
    await owner.getByRole('button', { name: 'Confirm removal', exact: true }).click();
    await expect(guest.locator('.catch-map-pin')).toHaveCount(0, { timeout: 30_000 });
    await owner.getByText('Removed catches (1)', { exact: true }).click();
    await owner.getByRole('button', { name: 'Restore catch', exact: true }).click();
    await expect(guest.locator('.catch-map-pin')).toHaveCount(1, { timeout: 30_000 });
    await owner.getByRole('button', { name: 'Finish derby', exact: true }).click();
    await owner.getByRole('button', { name: 'Finish and view results', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible({ timeout: 30_000 });
    await guest.getByRole('button', { name: 'Map', exact: true }).click();
    await guest.getByRole('button', { name: 'All catches', exact: true }).click();
    await expect(guest.locator('.catch-map-pin')).toHaveCount(1);
    await guest.reload();
    await expect(guest.getByRole('button', { name: 'Map', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await guest.getByRole('button', { name: 'All catches', exact: true }).click();
    await expect(guest.getByRole('list', { name: 'Mapped catches' })).toContainText('Map QA bass');
    console.log(`Verified production map and cross-device location sync: ${name}`);
  } finally { await ownerContext.close(); await guestContext.close(); }
});
