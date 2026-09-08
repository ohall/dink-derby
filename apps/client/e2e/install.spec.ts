import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

// Fresh profiles get the first-run profile sheet; save it so the header is clickable.
async function completeFirstRunProfile(page: Page) {
  await page.getByLabel('Display name').fill('Install test angler');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

// Simulated PWA install flow: we fire a synthetic beforeinstallprompt event to
// verify the Install button appears and drives the native prompt wiring.
test('install button appears on beforeinstallprompt and triggers the prompt', async ({ page }) => {
  await page.goto('/');
  await completeFirstRunProfile(page);
  await expect(page.locator('.install-button')).toHaveCount(0);

  const prompted = await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<{ outcome: 'accepted' }>;
      userChoice: Promise<{ outcome: 'accepted' }>;
    };
    (window as unknown as { __installPrompted: boolean }).__installPrompted = false;
    event.prompt = async () => {
      (window as unknown as { __installPrompted: boolean }).__installPrompted = true;
      return { outcome: 'accepted' };
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
    return true;
  });
  expect(prompted).toBe(true);

  const button = page.locator('.install-button');
  await expect(button).toBeVisible();
  await button.click();
  expect(await page.evaluate(() => (window as unknown as { __installPrompted: boolean }).__installPrompted)).toBe(true);
});

test('iOS Safari user agent gets an Install button with home screen instructions', async ({ browser }) => {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  });
  const page = await context.newPage();
  await page.goto('/');
  await completeFirstRunProfile(page);

  const button = page.locator('.install-button');
  await expect(button).toBeVisible();
  await button.click();

  const sheet = page.locator('.sheet');
  await expect(sheet.getByRole('heading', { name: 'Add to your home screen' })).toBeVisible();
  await expect(sheet.getByText('Add to Home Screen')).toBeVisible();

  await sheet.getByRole('button', { name: 'Not now' }).click();
  await expect(sheet).toHaveCount(0);
  // Dismissed: button stays hidden on reload within the cooldown window.
  await page.reload();
  await page.waitForSelector('.brand-header');
  await expect(page.locator('.install-button')).toHaveCount(0);

  await context.close();
});