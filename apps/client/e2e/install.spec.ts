import { test, expect, type Page } from '@playwright/test';

async function completeFirstRunProfile(page: Page) {
  await page.getByLabel('Display name').fill('Install test angler');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('home reminder is visible without an event; dismissal keeps labeled install access', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.install-reminder')).toHaveCount(0);
  await completeFirstRunProfile(page);
  const reminder = page.getByRole('complementary', { name: 'Install Dink Derby' });
  await expect(reminder).toBeVisible();
  await reminder.getByRole('button', { name: 'Not now' }).click();
  await page.reload();
  const button = page.locator('.install-button');
  await expect(button.getByText('Install app')).toBeVisible();
  await expect(reminder).toHaveCount(0);
  const box = await button.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await button.click();
  await expect(page.getByRole('dialog')).toContainText('Use your browser’s menu');
});

test('native install works even after dismissal and hides controls when installed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dink-derby:install-dismissed', String(Date.now())));
  await page.goto('/');
  await completeFirstRunProfile(page);
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => { document.body.dataset.installPrompted = 'true'; },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(event);
  });
  await page.locator('.install-button').click();
  await expect(page.locator('body')).toHaveAttribute('data-install-prompted', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.locator('.install-button')).toHaveCount(0);
  await expect(page.locator('.install-reminder')).toHaveCount(0);
});

test('expired native prompt opens manual instructions without a page error', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await completeFirstRunProfile(page);
  await page.evaluate(() => window.dispatchEvent(Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: async () => { throw new Error('Prompt expired'); },
    userChoice: Promise.resolve({ outcome: 'dismissed' }),
  })));
  await page.locator('.install-button').click();
  await expect(page.getByRole('dialog')).toContainText('Use your browser’s menu');
  expect(errors).toEqual([]);
});

for (const [platform, userAgent, expected] of [
  ['ios', 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1', 'Open as Web App'],
  ['android', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36', 'Install and create shortcut'],
]) {
  test(`${platform} gets manual instructions and can reopen them after closing`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent, viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await page.goto('/');
    await completeFirstRunProfile(page);
    await page.locator('.install-reminder').getByRole('button', { name: 'Install app' }).click();
    await expect(page.getByRole('dialog')).toContainText(expected);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.reload();
    await expect(page.locator('.install-reminder')).toHaveCount(0);
    await page.locator('.install-button').click();
    await expect(page.getByRole('dialog')).toContainText(expected);
    await context.close();
  });
}

test('installed standalone app does not advertise installation', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const result = original(query);
      if (query === '(display-mode: standalone)') Object.defineProperty(result, 'matches', { value: true });
      return result;
    };
  });
  await page.goto('/');
  await completeFirstRunProfile(page);
  await expect(page.locator('.install-button')).toHaveCount(0);
  await expect(page.locator('.install-reminder')).toHaveCount(0);
});
