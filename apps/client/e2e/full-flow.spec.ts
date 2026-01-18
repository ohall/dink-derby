import { test, expect } from '@playwright/test';

test('full flow: create derby and log catch', async ({ page }) => {
  await page.goto('/');

  // 1. Create Derby
  await page.getByRole('link', { name: 'New Derby' }).click();
  await page.getByLabel('Derby Name').fill('Dink Masters 2025');
  await page.getByLabel('Body of Water').fill('The Big Pond');
  await page.getByRole('button', { name: 'Create Derby' }).click();

  // 2. Navigate to Details
  await page.getByRole('link', { name: 'Dink Masters 2025' }).click();
  await expect(page.getByText('The Big Pond')).toBeVisible();
  
  // Join Derby
  await page.getByRole('button', { name: 'Join Derby' }).click();
  
  // Check Live Feed (Tab)
  await page.getByRole('button', { name: 'Live Feed' }).click();
  await expect(page.getByText('No fish caught yet')).toBeVisible();

  // 3. Log Catch
  await page.getByRole('link', { name: 'Log Catch' }).click();
  await page.getByLabel('Species').fill('Smallmouth Bass');
  await page.getByLabel('Length (inches)').fill('14.5');
  await page.getByRole('button', { name: 'Log Catch' }).click();

  // 4. Verify Catch in Feed
  await page.getByRole('button', { name: 'Live Feed' }).click();
  await expect(page.getByText('Smallmouth Bass')).toBeVisible();
  await expect(page.getByText('14.5"')).toBeVisible();
});
