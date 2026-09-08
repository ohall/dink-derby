import { expect, test, type Page } from '@playwright/test';

async function onboard(page: Page, name: string) {
  const firstSync = page.waitForRequest(request => request.url().endsWith('/sync') && request.method() === 'POST');
  await page.goto(process.env.E2E_BASE_URL || '/');
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const request = await firstSync;
  const input = request.postDataJSON();
  const headers: Record<string, string> = { 'x-dink-user-id': input.userId };
  const authorization = request.headers().authorization;
  if (authorization) headers.authorization = authorization;
  return { api: new URL(request.url()).origin, headers, userId: input.userId };
}
async function catchFish(page: Page, weight: string, species: string, includeLocation = false) {
  await page.getByRole('button', { name: 'Log a catch', exact: true }).click();
  await page.getByLabel('Weight', { exact: true }).fill(weight);
  await page.getByLabel('Species').fill(species);
  if (!includeLocation) await page.getByLabel('Include my location').uncheck();
  await page.getByRole('button', { name: 'Save catch', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
}

test('removal ends participation but keeps every angler’s history through reconnect, cache recovery and completion', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 375, height: 950 } });
  const guestContext = await browser.newContext({ viewport: { width: 375, height: 950 }, permissions: ['geolocation'], geolocation: { latitude: 44.28, longitude: -73.98 } });
  const owner = await ownerContext.newPage(), guest = await guestContext.newPage();
  const name = `History QA ${Date.now().toString(36)}`;
  const errors: string[] = [];
  owner.on('pageerror', error => errors.push(error.message)); guest.on('pageerror', error => errors.push(error.message));
  try {
    const creator = await onboard(owner, 'Removal QA creator');
    await owner.getByRole('button', { name: 'Start a derby', exact: true }).click();
    await owner.getByLabel('Derby name').fill(name);
    await owner.getByLabel('Water', { exact: true }).fill('Removal QA pond');
    await owner.getByRole('button', { name: 'Weight', exact: true }).click();
    await owner.getByRole('button', { name: 'Create derby', exact: true }).click();
    await expect(owner.getByRole('dialog')).toHaveCount(0);
    await expect(owner.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    const derbyId = new URL(owner.url()).searchParams.get('derby')!;
    await owner.getByRole('button', { name: 'Invite anglers', exact: true }).click();
    const invite = await owner.getByLabel('Invite code').inputValue();
    await owner.getByRole('button', { name: 'Close', exact: true }).click();
    const angler = await onboard(guest, 'Removal QA guest');
    await guest.getByRole('button', { name: 'Join a derby', exact: true }).click();
    await guest.getByLabel('Invite code').fill(invite);
    await guest.getByRole('button', { name: 'Join derby', exact: true }).click();
    await expect(guest.getByRole('dialog')).toHaveCount(0);
    await guest.getByRole('button', { name: 'View anglers (2)', exact: true }).click();
    await expect(guest.getByRole('button', { name: /^Remove / })).toHaveCount(0);
    await guest.getByRole('button', { name: 'Close', exact: true }).click();
    const denied = await guestContext.request.post(`${angler.api}/derbies/${derbyId}/anglers/${creator.userId}/remove`, { headers: angler.headers });
    expect(denied.status()).toBe(403);
    await catchFish(owner, '1', 'Creator bass'); await catchFish(guest, '5', 'Guest bass', true);
    await guestContext.setOffline(true);
    await owner.getByRole('button', { name: 'Manage anglers (2)', exact: true }).click();
    await owner.getByRole('button', { name: 'Remove Removal QA guest', exact: true }).click();
    await expect(owner.getByRole('heading', { name: 'Remove Removal QA guest?', exact: true })).toBeVisible();
    await expect(owner.getByRole('button', { name: 'Keep angler', exact: true })).toBeFocused();
    await owner.getByRole('button', { name: 'Keep angler', exact: true }).click();
    await expect(owner.getByRole('button', { name: 'Remove Removal QA guest', exact: true })).toBeVisible();
    await owner.getByRole('button', { name: 'Remove Removal QA guest', exact: true }).click();
    for (const width of [320, 375, 1280]) {
      await owner.setViewportSize({ width, height: 950 });
      expect(await owner.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await owner.screenshot({ path: `/tmp/dink-derby-remove-${width}.png`, fullPage: true, animations: 'disabled' });
    }
    await owner.getByRole('button', { name: 'Confirm removal', exact: true }).click();
    await expect(owner.getByRole('status')).toContainText('Removal QA guest was removed');
    await owner.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(owner.getByRole('button', { name: 'Manage anglers (1)', exact: true })).toBeVisible();
    await expect(owner.getByText('Angler removed · not scored', { exact: true })).toBeVisible();
    await owner.getByRole('button', { name: 'Standings', exact: true }).click();
    await expect(owner.locator('.biggest-fish-card')).toContainText('1.00');
    await expect(owner.locator('.leaderboard__angler').filter({ hasText: 'Removal QA guest' })).toHaveCount(0);
    await guestContext.setOffline(false);
    await expect(guest.getByRole('heading', { name: 'Your derby history', exact: true })).toBeVisible({ timeout: 35_000 });
    await expect(guest.getByRole('button', { name: 'Log a catch', exact: true })).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'Edit catch', exact: true })).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'Invite anglers', exact: true })).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'Send message', exact: true })).toHaveCount(0);
    await expect(guest.getByRole('button', { name: 'fire reaction' }).first()).toBeDisabled();
    await expect(guest.getByText('Guest bass', { exact: true })).toBeVisible();
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'Your derby history', exact: true })).toBeVisible();
    await guestContext.setOffline(true);
    // Retain identity, but remove the local derby cache to prove history is
    // backed by the server, not only data this phone happened to download.
    await guest.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('DinkDerbyFieldDB');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const names = ['derbies', 'derbyParticipants', 'catches', 'chatMessages', 'reactions', 'media', 'derbyEvents', 'syncState'];
        const transaction = database.transaction(names, 'readwrite');
        for (const name of names) transaction.objectStore(name).clear();
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => { database.close(); reject(transaction.error); };
      };
    }));
    await guestContext.setOffline(false);
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'Your derby history', exact: true })).toBeVisible({ timeout: 35_000 });
    await expect(guest.getByText('Guest bass', { exact: true })).toBeVisible();
    await guest.getByRole('button', { name: 'Map', exact: true }).click();
    await expect(guest.getByText('1 of 1 catch mapped', { exact: true })).toBeVisible();
    await expect(guest.getByRole('button', { name: /Catch 1 · Guest bass/ })).toBeVisible();
    await guest.getByRole('button', { name: 'All derbies', exact: true }).click();
    await expect(guest.getByRole('button', { name: 'Past derbies (1)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(guest.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(guest.getByText('Participation ended', { exact: true })).toBeVisible();
    await expect(guest.getByText('Your catches: 1', { exact: true })).toBeVisible();
    for (const width of [320, 375, 1280]) {
      await guest.setViewportSize({ width, height: 950 });
      expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await guest.screenshot({ path: `/tmp/dink-derby-history-${width}.png`, fullPage: true });
    }
    await guest.getByRole('button', { name: 'Active derbies (0)', exact: true }).click();
    await expect(guest.getByRole('heading', { name, exact: true })).toHaveCount(0);
    await guest.getByRole('button', { name: 'Join a derby', exact: true }).click();
    await guest.getByLabel('Invite code').fill(invite);
    await guest.getByRole('button', { name: 'Join derby', exact: true }).click();
    await expect(guest.getByRole('alert')).toContainText('cannot rejoin');
    await guest.getByRole('button', { name: 'Close', exact: true }).click();
    await owner.reload();
    await expect(owner.getByRole('button', { name: 'Manage anglers (1)', exact: true })).toBeVisible();
    await owner.getByRole('button', { name: 'Finish derby', exact: true }).click();
    await owner.getByRole('button', { name: 'Finish and view results', exact: true }).click();
    await expect(owner.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible();
    await expect(owner.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    await guest.getByRole('button', { name: 'Past derbies (1)', exact: true }).click();
    await guest.getByRole('heading', { name, exact: true }).click();
    await expect(guest.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible({ timeout: 35_000 });
    await expect(guest.getByRole('heading', { name: 'Your derby history', exact: true })).toBeVisible();
    await expect(guest.locator('.biggest-fish-card')).toContainText('1.00');
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
    console.log(`Verified creator-only removal, persistent read-only history, cached-data recovery, catch map, completed results, and blocked rejoin: ${name}`);
  } finally { await ownerContext.close(); await guestContext.close(); }
});
