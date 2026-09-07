import { expect, test, type Page } from '@playwright/test';

test('edit, remove, restore, and navigate a derby without losing its state', async ({ page, browser }) => {
  const deployed = !!process.env.E2E_BASE_URL;
  const name = `Corrections QA ${Date.now().toString(36)}`;
  const guestContext = deployed ? await browser.newContext() : undefined;
  const guest = guestContext ? await guestContext.newPage() : undefined;
  async function sync(page: Page) {
    if (deployed) await expect(page.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
  }
  async function onboard(target: Page, displayName: string) {
    await target.goto(process.env.E2E_BASE_URL || '/');
    await target.getByLabel('Display name').fill(displayName);
    await target.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(target.getByRole('dialog')).toHaveCount(0);
  }
  try {
    await onboard(page, 'Correction QA owner');
    await page.getByRole('button', { name: 'Start a derby', exact: true }).click();
    await page.getByLabel('Derby name').fill(name);
    await page.getByLabel('Water', { exact: true }).fill('QA pond');
    await page.getByRole('button', { name: 'Weight', exact: true }).click();
    await page.getByRole('button', { name: 'Create derby', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await sync(page);
    const derbyUrl = page.url();
    expect(derbyUrl).toContain('?derby=');
    if (guest) {
      await page.getByRole('button', { name: 'Invite anglers', exact: true }).click();
      const code = await page.getByLabel('Invite code').inputValue();
      await page.getByRole('button', { name: 'Close', exact: true }).click();
      await onboard(guest, 'Correction QA guest');
      await guest.getByRole('button', { name: 'Join with code', exact: true }).click();
      await guest.getByLabel('Invite code').fill(code);
      await guest.getByRole('button', { name: 'Join derby', exact: true }).click();
      await expect(guest.getByRole('dialog')).toHaveCount(0);
    }

    await page.getByRole('button', { name: 'Log a catch', exact: true }).click();
    await page.getByLabel('Weight', { exact: true }).fill('2.5');
    await page.getByLabel('Species').fill('Bass');
    await page.getByRole('button', { name: 'Save catch', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await sync(page);
    await page.getByRole('button', { name: 'Edit catch', exact: true }).click();
    await page.getByLabel('Weight (lb)').fill('3.75');
    await page.getByLabel('Species').fill('');
    await page.getByLabel('Note').fill('Corrected weight');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.catch-card')).toContainText('3.75');
    await sync(page);
    if (guest) {
      await expect(guest.locator('.catch-card')).toContainText('3.75', { timeout: 30_000 });
      await expect(guest.getByRole('button', { name: 'Edit catch', exact: true })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Standings', exact: true }).click();
    await expect(page.locator('.biggest-fish-card')).toContainText('3.75');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Leaderboard', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rules & info', exact: true }).click();
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Leaderboard', exact: true })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Derby rules', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Catches & chat', exact: true }).click();

    await page.getByRole('button', { name: 'Edit catch', exact: true }).click();
    await page.getByRole('button', { name: 'Remove catch', exact: true }).click();
    await page.getByRole('button', { name: 'Keep catch', exact: true }).click();
    await page.getByRole('button', { name: 'Remove catch', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm removal', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.catch-card')).toHaveCount(0);
    await sync(page);
    if (guest) await expect(guest.locator('.catch-card')).toHaveCount(0, { timeout: 30_000 });
    await page.reload();
    await expect(page.locator('.catch-card')).toHaveCount(0);
    await page.getByText('Removed catches (1)', { exact: true }).click();
    await page.getByRole('button', { name: 'Restore catch', exact: true }).click();
    await expect(page.locator('.catch-card')).toContainText('3.75');
    await sync(page);
    if (guest) await expect(guest.locator('.catch-card')).toContainText('3.75', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Finish derby', exact: true }).click();
    await page.getByRole('button', { name: 'Finish and view results', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Catches & chat', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit catch', exact: true })).toHaveCount(0);
    await sync(page);
    await page.getByRole('button', { name: 'All derbies', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('button', { name: /Past derbies/ })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await expect(page.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible();
    await page.screenshot({ path: `/tmp/dink-derby-corrections-${deployed ? 'production' : 'local'}.png`, fullPage: true, animations: 'disabled' });
    console.log(`Verified ${deployed ? 'deployed' : 'local'} corrections: ${name}`);
  } finally { await guestContext?.close(); }
});
