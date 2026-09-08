import { expect, test, type Page } from '@playwright/test';

const result = { source: 'USGS National Hydrography Dataset', radiusMeters: 5000, partial: false, suggestions: [
  { id: 'mirror', name: 'Mirror Lake', kind: 'Lake / pond', containsLocation: true, distanceMeters: 0 },
  { id: 'placid', name: 'Lake Placid', kind: 'Lake / pond', containsLocation: false, distanceMeters: 1200 },
] };
async function start(page: Page, name: string) {
  await page.goto('/');
  await page.getByLabel('Display name').fill('Water lookup QA');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Start a derby', exact: true }).click();
  await page.getByLabel('Derby name').fill(name);
}

for (const width of [320, 375, 1280]) test(`water selection is opt-in, editable and persists at ${width}px`, async ({ page, context }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Local fixture test.');
  await page.setViewportSize({ width, height: 1000 });
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.285, longitude: -73.984 });
  let requests = 0;
  await context.route('**/waters/nearby', route => {
    requests++;
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual({ lat: 44.285, lon: -73.984 });
    return route.fulfill({ json: result });
  });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await start(page, 'Water selection review');
  expect(requests).toBe(0);
  await page.getByLabel('Water', { exact: true }).fill('My original entry');
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  const suggestions = page.getByRole('list', { name: 'Nearby water suggestions' });
  await expect(suggestions).toBeVisible();
  await expect(page.getByLabel('Water', { exact: true })).toHaveValue('My original entry');
  const mirror = suggestions.getByRole('button', { name: /Mirror Lake/ });
  await mirror.click();
  await expect(mirror).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Water', { exact: true })).toHaveValue('Mirror Lake');
  await page.getByLabel('Water', { exact: true }).fill('Mirror Lake — south end');
  await expect(mirror).toHaveAttribute('aria-pressed', 'false');
  for (const button of [mirror, page.getByRole('button', { name: 'Use my location', exact: true })]) {
    const box = await button.boundingBox(); expect(box!.height + 0.01).toBeGreaterThanOrEqual(44); expect(box!.width + 0.01).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/dink-derby-water-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Create derby', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Mirror Lake — south end', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Mirror Lake — south end', { exact: true })).toBeVisible();
  expect(errors).toEqual([]); expect(requests).toBe(1);
});

test('offline and denied GPS never block manual derby creation', async ({ page, context }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Local failure simulation.');
  await page.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: (_: unknown, fail: (error: { code: number }) => void) => fail({ code: 1 }) } }));
  await start(page, 'Manual water review');
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect(page.locator('.water-suggestions [role=status]')).toContainText('permission was denied');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect(page.locator('.water-suggestions [role=status]')).toContainText('You’re offline');
  await page.getByLabel('Water', { exact: true }).fill('Offline Pond');
  await page.getByRole('button', { name: 'Create derby', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Offline Pond', { exact: true })).toBeVisible();
});

test('a slow lookup can be canceled and a late response cannot change the name', async ({ page, context }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Local failure simulation.');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 44.285, longitude: -73.984 });
  let release!: () => void;
  let started!: () => void;
  const requested = new Promise<void>(resolve => { started = resolve; });
  await context.route('**/waters/nearby', async route => { started(); await new Promise<void>(resolve => { release = resolve; }); await route.fulfill({ json: result }); });
  await start(page, 'Canceled lookup review');
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await requested;
  await page.getByLabel('Water', { exact: true }).fill('Private Pond');
  await page.getByRole('button', { name: 'Cancel lookup', exact: true }).click();
  release();
  await expect(page.locator('.water-suggestions [role=status]')).toContainText('Lookup canceled');
  await expect(page.getByRole('list', { name: 'Nearby water suggestions' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Create derby', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Private Pond', { exact: true })).toBeVisible();
});

test('live USGS suggestion syncs the confirmed name to a second device', async ({ browser }) => {
  test.skip(!process.env.E2E_BASE_URL, 'Explicit deployed target required; creates one dedicated QA derby.');
  const ownerContext = await browser.newContext({ permissions: ['geolocation'], geolocation: { latitude: 44.285, longitude: -73.984 } });
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage(), guest = await guestContext.newPage();
  const name = `Water QA ${Date.now().toString(36)}`;
  try {
    await start(owner, name);
    const lookup = owner.waitForResponse(response => response.url().endsWith('/waters/nearby') && response.request().method() === 'POST');
    await owner.getByRole('button', { name: 'Use my location', exact: true }).click();
    const response = await lookup;
    expect(response.status()).toBe(200);
    const body = await response.json(); expect(body.suggestions[0].name).toBe('Mirror Lake');
    await owner.getByRole('list', { name: 'Nearby water suggestions' }).getByRole('button', { name: /Mirror Lake/ }).click();
    await expect(owner.getByLabel('Water', { exact: true })).toHaveValue('Mirror Lake');
    await owner.getByRole('button', { name: 'Create derby', exact: true }).click();
    await expect(owner.getByRole('dialog')).toHaveCount(0);
    await expect(owner.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    await owner.getByRole('button', { name: 'Invite anglers', exact: true }).click();
    const code = await owner.getByLabel('Invite code').inputValue();
    await owner.getByRole('button', { name: 'Close', exact: true }).click();
    await guest.goto('/');
    await guest.getByLabel('Display name').fill('Water QA guest');
    await guest.getByRole('button', { name: 'Save profile', exact: true }).click();
    await guest.getByRole('button', { name: 'Join with code', exact: true }).click();
    await guest.getByLabel('Invite code').fill(code);
    await guest.getByRole('button', { name: 'Join derby', exact: true }).click();
    await expect(guest.getByRole('dialog')).toHaveCount(0);
    await expect(guest.getByText('Mirror Lake', { exact: true })).toBeVisible();
    await guest.reload();
    await expect(guest.getByText('Mirror Lake', { exact: true })).toBeVisible();
    await owner.getByRole('button', { name: 'Finish derby', exact: true }).click();
    await owner.getByRole('button', { name: 'Finish and view results', exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible({ timeout: 30_000 });
    console.log(`Verified live USGS lookup and cross-device water-name persistence: ${name}; response ${JSON.stringify(body)}`);
  } finally { await ownerContext.close(); await guestContext.close(); }
});
