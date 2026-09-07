import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 375, height: 812 }, { width: 320, height: 740 }, { width: 1280, height: 900 }]) {
  test(`clear controls and recoverable forms at ${viewport.width}px`, async ({ page }) => {
    test.skip(!!process.env.E2E_BASE_URL, 'Isolated local UX test only.');
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByLabel('Display name').fill('UX reviewer');
    await page.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start a derby', exact: true }).click();
    await page.getByLabel('Derby name').fill('Saturday on the lake');
    await page.getByLabel('Water', { exact: true }).fill('Test pond');
    await page.getByRole('button', { name: 'Create derby', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const finish = page.getByRole('button', { name: 'Finish derby', exact: true });
    const catchButton = page.getByRole('button', { name: 'Log a catch', exact: true });
    await expect(catchButton).toHaveCount(1);
    const finishBounds = await finish.boundingBox();
    expect(finishBounds!.y + finishBounds!.height).toBeLessThan(viewport.height);
    for (const button of [finish, catchButton, page.getByRole('button', { name: 'Invite anglers', exact: true }), page.getByRole('button', { name: 'Edit angler profile', exact: true })]) {
      const bounds = await button.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `/tmp/dink-derby-ux-${viewport.width}.png`, fullPage: true, animations: 'disabled' });

    await page.getByRole('button', { name: 'Invite anglers', exact: true }).click();
    await expect(page.getByLabel('Invite code')).toHaveValue(/^DINK-/);
    await expect(page.getByRole('button', { name: 'Copy invite code', exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Copy invite code', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Invite anglers', exact: true })).toBeFocused();

    await catchButton.click();
    await page.getByText('Note & location', { exact: false }).click();
    await expect(page.getByLabel('Include my location')).not.toBeChecked();
    await expect(page.getByRole('button', { name: 'Save catch', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Save catch', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.getByLabel('Length', { exact: true })).toBeFocused();
    await page.getByLabel('Length', { exact: true }).fill('12.5');
    await page.getByLabel('Note').fill('Keep this draft');
    await page.getByRole('button', { name: 'Save draft & close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await catchButton.click();
    await expect(page.getByLabel('Length', { exact: true })).toHaveValue('12.5');
    await expect(page.getByLabel('Note')).toHaveValue('Keep this draft');
    await page.screenshot({ path: `/tmp/dink-derby-catch-ux-${viewport.width}.png`, fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Save catch', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await finish.click();
    await expect(page.getByRole('dialog')).toContainText('Current leader: UX reviewer');
    await page.getByRole('button', { name: 'Finish and view results', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible();
    await expect(catchButton).toHaveCount(0);
    await page.getByRole('button', { name: 'All derbies', exact: true }).click();
    await expect(page.getByRole('button', { name: /Past derbies/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /Saturday on the lake/ })).toBeVisible();
  });
}

test('profile, join, invite, and chat controls give useful feedback', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Isolated local UX test only.');
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new DOMException('Clipboard denied', 'NotAllowedError'); },
    } });
  });
  await page.goto('/');
  await page.getByLabel('Display name').fill('   ');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a display name.');
  await page.getByLabel('Display name').fill('Control reviewer');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Join with code', exact: true }).click();
  await page.getByLabel('Invite code').fill(' dink - test1 ');
  await expect(page.getByLabel('Invite code')).toHaveValue('DINK-TEST1');
  await page.getByRole('button', { name: 'Join derby', exact: true }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Invite code')).toHaveValue('DINK-TEST1');
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.getByRole('button', { name: 'Start a derby', exact: true }).click();
  await page.getByLabel('Derby name').fill('   ');
  await page.getByLabel('Water', { exact: true }).fill('Pond');
  await page.getByRole('button', { name: 'Create derby', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a derby name and the water you’re fishing.');
  await page.getByLabel('Derby name').fill('Control check');
  await page.getByRole('button', { name: 'Create derby', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Invite anglers', exact: true }).click();
  await page.getByRole('button', { name: 'Copy invite code', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not copy automatically. Select the code above and copy it.');
  await expect(page.getByLabel('Invite code')).toHaveValue(/^DINK-/);
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.getByLabel('Message the derby').fill('   ');
  await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled();
  await page.getByLabel('Message the derby').fill('Meet at the dock');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(page.getByLabel('Message the derby')).toHaveValue('');
  await expect(page.locator('.message-card')).toContainText('Meet at the dock');
});
