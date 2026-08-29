import { expect, test } from '@playwright/test';
import { testPhoto } from './fixtures';

async function finishOnboarding(page: import('@playwright/test').Page, name: string) {
  await expect(page.getByRole('heading', { name: /angler profile/i })).toBeVisible();
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: /save profile/i }).click();
  await expect(page.getByRole('heading', { name: 'Derbies', exact: true })).toBeVisible();
}

test('creates a derby with a deterministic scoring rule', async ({ page }) => {
  await page.goto('/');
  await finishOnboarding(page, 'Oakley');

  await page.getByRole('button', { name: /start a derby/i }).first().click();
  await page.getByLabel('Derby name').fill('Little Tupper Classic');
  await page.getByLabel('Water').fill('Little Tupper Lake');
  await page.getByRole('button', { name: /length/i }).click();
  await page.getByLabel('Scoring').selectOption('best_3');
  await page.getByRole('button', { name: /create derby/i }).click();

  await expect(page.getByRole('heading', { name: 'Little Tupper Classic' })).toBeVisible();
  await page.getByRole('button', { name: /rules/i }).click();
  await expect(page.getByText('Best 3 fish by total length')).toBeVisible();
});

test('logs exactly one fish in a count derby without requiring a measurement or photo', async ({ page }) => {
  await page.goto('/');
  await finishOnboarding(page, 'Count Angler');
  await page.getByRole('button', { name: /start a derby/i }).first().click();
  await page.getByLabel('Derby name').fill('One Fish At A Time');
  await page.getByLabel('Water').fill('Test Pond');
  await page.getByRole('button', { name: /fish count/i }).click();
  await page.getByRole('button', { name: /create derby/i }).click();

  await page.getByRole('button', { name: /log a catch/i }).first().click();
  await expect(page.getByText('This catch adds one fish to your total.')).toBeVisible();
  await page.getByLabel('Note').fill('No measurement or photo.');
  await page.getByRole('button', { name: 'Save catch' }).click();

  await expect(page.locator('.catch-card').filter({ hasText: 'No measurement or photo.' })).toContainText('1fish');
});

test('saves a catch with its photo while offline and restores it after reload', async ({ page, context }) => {
  await page.goto('/');
  await finishOnboarding(page, 'Offline Angler');
  await page.getByRole('button', { name: /start a derby/i }).first().click();
  await page.getByLabel('Derby name').fill('Offline Throwdown');
  await page.getByLabel('Water').fill('Little Tupper Lake');
  await page.getByRole('button', { name: /create derby/i }).click();
  await expect(page.getByRole('heading', { name: 'Offline Throwdown' })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: /log a catch/i }).first().click();
  await page.locator('input[type="file"]').setInputFiles(testPhoto);
  await page.getByLabel('Length').fill('21.25');
  await page.getByLabel('Species').fill('Smallmouth bass');
  await page.getByLabel('Note').fill('Saved with zero bars.');
  await page.getByRole('button', { name: 'Save catch' }).click();

  await expect(page.getByText('21.25').first()).toBeVisible();
  await expect(page.getByText('Provisional score')).toBeVisible();

  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: /Offline Throwdown/i }).click();
  await expect(page.getByText('Saved with zero bars.')).toBeVisible();
  await expect(page.getByText('21.25').first()).toBeVisible();
});
