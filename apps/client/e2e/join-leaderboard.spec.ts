import { test, expect } from '@playwright/test';

test('join derby and view leaderboard', async ({ page }) => {
  await page.goto('/');

  // 1. Create Profile
  await page.getByRole('link', { name: 'Create Profile' }).click();
  await page.getByLabel('Display Name').fill('Pro Angler');
  await page.getByRole('button', { name: 'Save Profile' }).click();

  // 2. Create Derby
  await page.getByRole('link', { name: 'New Derby' }).click();
  await page.getByLabel('Derby Name').fill('Leaderboard Test');
  await page.getByLabel('Body of Water').fill('Lake Comp');
  await page.getByRole('button', { name: 'Create Derby' }).click();

  // 3. Navigate to Derby
  await page.getByRole('link', { name: 'Leaderboard Test' }).click();

  // 4. Join Derby (Should see Join button, not Log Catch)
  await expect(page.getByRole('link', { name: 'Log Catch' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Join Derby' }).click();
  
  // 5. Verify Join State (Should see Log Catch now)
  await expect(page.getByRole('link', { name: 'Log Catch' })).toBeVisible();

  // 6. Log Catches
  await page.getByRole('link', { name: 'Log Catch' }).click();
  await page.getByLabel('Species').fill('Fish 1');
  await page.getByLabel('Length (inches)').fill('10');
  await page.getByRole('button', { name: 'Log Catch' }).click();

  await page.getByRole('link', { name: 'Log Catch' }).click();
  await page.getByLabel('Species').fill('Fish 2');
  await page.getByLabel('Length (inches)').fill('20');
  await page.getByRole('button', { name: 'Log Catch' }).click();

  // 7. Verify Leaderboard
  // Tab should be active by default
  await expect(page.getByRole('cell', { name: 'Pro Angler' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '30"' })).toBeVisible(); // 10 + 20
  
  // 8. Check Live Feed
  await page.getByRole('button', { name: 'Live Feed' }).click();
  await expect(page.getByText('Fish 1')).toBeVisible();
  await expect(page.getByText('Fish 2')).toBeVisible();
});
