import { test, expect } from '@playwright/test';

test('create a new derby', async ({ page }) => {
  await page.goto('/');

  // Click New Derby
  await page.getByRole('link', { name: 'New Derby' }).click();
  await expect(page).toHaveURL('/new');

  // Fill form
  await page.getByLabel('Derby Name').fill('Test Derby 2025');
  await page.getByLabel('Body of Water').fill('Lake Test');
  
  // Submit
  await page.getByRole('button', { name: 'Create Derby' }).click();

  // Should redirect to list
  await expect(page).toHaveURL('/');

  // Check if it appears in the list
  await expect(page.getByText('Test Derby 2025')).toBeVisible();
  await expect(page.getByText('Lake Test')).toBeVisible();
});
