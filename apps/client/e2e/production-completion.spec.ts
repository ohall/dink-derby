import { expect, test, type Page } from '@playwright/test';

test('two identities finish a derby and reconcile a late offline catch', async ({ browser }) => {
  test.skip(!process.env.E2E_BASE_URL, 'Explicit deployed target required. Creates a dedicated smoke-test derby.');
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const owner = await ownerContext.newPage(), guest = await guestContext.newPage();
  const name = `Deployment completion check ${Date.now().toString(36)}`;
  async function onboard(page: Page, name: string) {
    await page.goto(process.env.E2E_BASE_URL!);
    await page.getByLabel('Display name').fill(name);
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  try {
    await onboard(owner, 'Completion QA owner');
    await owner.getByRole('button', { name: 'Start a derby', exact: true }).first().click();
    await owner.getByLabel('Derby name').fill(name);
    await owner.getByLabel('Water', { exact: true }).fill('Deployment verification pond');
    await owner.getByRole('button', { name: 'Weight', exact: true }).click();
    await owner.getByRole('combobox', { name: 'Scoring', exact: true }).selectOption({ label: 'Best 3 fish' });
    await owner.getByLabel('Species').fill('Smallmouth bass');
    await owner.getByRole('button', { name: 'Create derby', exact: true }).click();
    await expect(owner.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    await owner.getByRole('button', { name: 'Invite anglers', exact: true }).click();
    const invite = await owner.getByLabel('Invite code').inputValue();
    await owner.getByRole('button', { name: 'Close', exact: true }).click();
    await onboard(guest, 'Completion QA guest');
    await guest.getByRole('button', { name: 'Join with code', exact: true }).click();
    await guest.getByLabel('Invite code').fill(invite);
    await guest.getByRole('button', { name: 'Join derby', exact: true }).click();
    await expect(guest.getByRole('heading', { name, exact: true })).toBeVisible();
    await expect(guest.getByRole('button', { name: 'Finish derby', exact: true })).toHaveCount(0);
    async function catchFish(page: Page, weight: string) {
      await page.getByRole('button', { name: 'Log a catch', exact: true }).click();
      await expect(page.getByLabel('Species')).toHaveValue('Smallmouth bass');
      await page.getByLabel('Weight', { exact: true }).fill(weight);
      await page.getByRole('button', { name: 'Save catch', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    await catchFish(owner, '2.5');
    await expect(owner.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    await guestContext.setOffline(true);
    await catchFish(guest, '4.5');
    await owner.getByRole('button', { name: 'Finish derby', exact: true }).click();
    await owner.getByRole('button', { name: 'Finish and view results', exact: true }).click();
    await expect(owner.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible();
    await expect(owner.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    await guestContext.setOffline(false);
    await expect(guest.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(guest.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(owner.locator('.completion-summary')).toContainText('Completion QA guest', { timeout: 30_000 });
    await expect(guest.getByRole('button', { name: /log.*catch/i })).toHaveCount(0);
    await owner.reload();
    await expect(owner.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible();
    await owner.getByRole('button', { name: 'All derbies', exact: true }).click();
    await owner.getByRole('button', { name: new RegExp(name) }).click();
    await expect(owner.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible();
    await expect(owner.locator('.biggest-fish-card')).toContainText('4.50');
    await owner.screenshot({ path: '/tmp/dink-derby-production-completion.png', fullPage: true });
    console.log(`Verified deployed completion: ${name}`);
  } finally { await ownerContext.close(); await guestContext.close(); }
});
