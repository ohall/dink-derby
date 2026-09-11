import { expect, test } from '@playwright/test';

test('syncs on becoming visible without focus or a polling timer', async ({ page }) => {
  if (!process.env.E2E_BASE_URL) {
    await page.route('**/sync', async route => {
      const { outbox } = route.request().postDataJSON();
      await route.fulfill({ json: {
        serverTime: new Date().toISOString(),
        appliedOperationIds: outbox.map((item: { id: string }) => item.id),
        rejected: [], events: [], nextCursor: 0,
        patches: { users: [], derbies: [], derbyParticipants: [], catches: [], chatMessages: [], reactions: [], media: [] },
      } });
    });
  }
  await page.clock.install();
  await page.goto('/');
  await page.getByLabel('Display name').fill('Resume validation');
  await page.getByRole('button', { name: /save profile/i }).click();
  await expect(page.locator('.sync-pill')).toHaveAttribute('title', 'Synced to derby');
  // Freeze polling/retry timers so only the visibility event can cause a sync.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await expect(page.locator('.sync-pill')).toHaveAttribute('title', 'Synced to derby');
  let syncRequests = 0;
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/sync' && request.method() === 'POST') syncRequests++;
  });
  await page.evaluate(() => {
    window.addEventListener('focus', () => { document.documentElement.dataset.resumeFocus = 'fired'; });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(syncRequests).toBe(0);
  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/sync' && response.request().method() === 'POST',
  { timeout: 5_000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await responsePromise).status()).toBe(200);
  await expect(page.locator('.sync-pill')).toHaveAttribute('title', 'Synced to derby');
  expect(syncRequests).toBe(1);
  expect(await page.evaluate(() => document.documentElement.dataset.resumeFocus)).toBeUndefined();
  await expect(page).toHaveTitle('Dink Derby');
});
