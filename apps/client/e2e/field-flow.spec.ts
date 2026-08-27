import { expect, test } from '@playwright/test';
import path from 'node:path';

test('creates a derby with a deterministic scoring rule', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /the lake is calling/i })).toBeVisible();

  await page.getByRole('button', { name: /start a derby/i }).click();
  await page.getByLabel('Derby name').fill('Little Tupper Classic');
  await page.getByLabel('Water').fill('Little Tupper Lake');
  await page.getByRole('button', { name: 'length', exact: true }).click();
  await page.getByLabel('Scoring').selectOption('best_n');
  await page.getByLabel('Best how many?').fill('3');
  await page.getByRole('button', { name: /create derby/i }).click();

  await expect(page.getByRole('heading', { name: 'Little Tupper Classic' })).toBeVisible();
  await page.getByRole('button', { name: /rules/i }).click();
  await expect(page.getByText('Best 3 catches')).toBeVisible();
});

test('saves a catch with its photo while offline and restores it after reload', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Pine Lake Throwdown/i }).click();
  await expect(page.getByRole('heading', { name: 'Pine Lake Throwdown' })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: /log a catch/i }).first().click();
  await page.locator('input[type="file"]').setInputFiles(path.resolve('public/dink-derby-poster.png'));
  await page.getByLabel('Length').fill('21.25');
  await page.getByLabel('Species').fill('Smallmouth bass');
  await page.getByLabel('Note').fill('Saved with zero bars.');
  await page.getByRole('button', { name: 'Save catch' }).click();

  await expect(page.getByText('21.25').first()).toBeVisible();
  await expect(page.getByText('Provisional score')).toBeVisible();

  await context.setOffline(false);
  await page.reload();
  await page.getByRole('button', { name: /Pine Lake Throwdown/i }).click();
  await expect(page.getByText('Saved with zero bars.')).toBeVisible();
  await expect(page.getByText('21.25').first()).toBeVisible();
});
