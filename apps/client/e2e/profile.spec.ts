import { test, expect } from '@playwright/test';

test('create and update angler profile', async ({ page }) => {
  await page.goto('/');

  // 1. Check initial state (no profile)
  await expect(page.getByRole('link', { name: 'Create Profile' })).toBeVisible();

  // 2. Navigate to Profile creation
  await page.getByRole('link', { name: 'Create Profile' }).click();
  await expect(page).toHaveURL('/profile');
  await expect(page.getByRole('heading', { name: 'Create Angler Profile' })).toBeVisible();

  // 3. Create Profile
  await page.getByLabel('Display Name').fill('Captain Hook');
  await page.getByRole('button', { name: 'Save Profile' }).click();

  // 4. Verify redirect and header update
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Captain Hook' })).toBeVisible();

  // 5. Update Profile
  await page.getByRole('link', { name: 'Captain Hook' }).click();
  await expect(page.getByRole('heading', { name: 'Edit Profile' })).toBeVisible();
  await expect(page.getByLabel('Display Name')).toHaveValue('Captain Hook');
  
  await page.getByLabel('Display Name').fill('Captain Hook II');
  await page.getByRole('button', { name: 'Save Profile' }).click();

  await expect(page).toHaveURL('/');
  await expect(page.getByRole('link', { name: 'Captain Hook II' })).toBeVisible();
});
