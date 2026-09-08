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
async function catchFish(page: Page, weight: string, species: string) {
  await page.getByRole('button', { name: 'Log a catch', exact: true }).click();
  await page.getByLabel('Weight', { exact: true }).fill(weight);
  await page.getByLabel('Species').fill(species);
  await page.getByLabel('Include my location').uncheck();
  await page.getByRole('button', { name: 'Save catch', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
}

test('creator confirms removal, other anglers cannot remove, and revoked access survives reconnect and reload', async ({ browser }) => {
  const ownerContext = await browser.newContext({ viewport: { width: 375, height: 950 } });
  const guestContext = await browser.newContext({ viewport: { width: 375, height: 950 } });
  const owner = await ownerContext.newPage(), guest = await guestContext.newPage();
  const name = `Removal QA ${Date.now().toString(36)}`;
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
    await catchFish(owner, '1', 'Creator bass'); await catchFish(guest, '5', 'Guest bass');
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
    await expect(guest.getByRole('heading', { name: 'You were removed from this derby', exact: true })).toBeVisible({ timeout: 35_000 });
    await expect(guest.getByRole('button', { name: 'Log a catch', exact: true })).toHaveCount(0);
    await guest.reload();
    await expect(guest.getByRole('heading', { name: 'You were removed from this derby', exact: true })).toBeVisible();
    await guest.getByRole('button', { name: 'All derbies', exact: true }).click();
    await expect(guest.getByRole('heading', { name, exact: true })).toHaveCount(0);
    await guest.getByRole('button', { name: 'Join a derby', exact: true }).click();
    await guest.getByLabel('Invite code').fill(invite);
    await guest.getByRole('button', { name: 'Join derby', exact: true }).click();
    await expect(guest.getByRole('alert')).toContainText('cannot rejoin');
    await owner.reload();
    await expect(owner.getByRole('button', { name: 'Manage anglers (1)', exact: true })).toBeVisible();
    await owner.getByRole('button', { name: 'Finish derby', exact: true }).click();
    await owner.getByRole('button', { name: 'Finish and view results', exact: true }).click();
    await expect(owner.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible();
    await expect(owner.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    expect(errors).toEqual([]);
    console.log(`Verified creator-only confirmation, history/scoring, cross-device access revocation and blocked rejoin: ${name}`);
  } finally { await ownerContext.close(); await guestContext.close(); }
});
