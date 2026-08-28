import { expect, test } from '@playwright/test';

async function finishOnboarding(page: import('@playwright/test').Page, name: string) {
  await expect(page.getByRole('heading', { name: /angler profile/i })).toBeVisible();
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: /save profile/i }).click();
  await expect(page.getByRole('heading', { name: 'Derbies', exact: true })).toBeVisible();
}

test('creates a derby with a deterministic scoring rule', async ({ page }) => {
  await page.goto('/');
  await finishOnboarding(page, 'Oakley');

  await page.getByRole('button', { name: /start a derby/i }).click();
  await page.getByLabel('Derby name').fill('Little Tupper Classic');
  await page.getByLabel('Water').fill('Little Tupper Lake');
  await page.getByRole('button', { name: 'length', exact: true }).click();
  await page.getByLabel('Scoring').selectOption('best_3');
  await page.getByRole('button', { name: /create derby/i }).click();

  await expect(page.getByRole('heading', { name: 'Little Tupper Classic' })).toBeVisible();
  await page.getByRole('button', { name: /rules/i }).click();
  await expect(page.getByText('Best 3 fish by total length')).toBeVisible();
});

test('logs exactly one fish in a count derby without requiring a measurement or photo', async ({ page }) => {
  await page.goto('/');
  await finishOnboarding(page, 'Count Angler');
  await page.getByRole('button', { name: /start a derby/i }).click();
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
  await page.getByRole('button', { name: /start a derby/i }).click();
  await page.getByLabel('Derby name').fill('Offline Throwdown');
  await page.getByLabel('Water').fill('Little Tupper Lake');
  await page.getByRole('button', { name: /create derby/i }).click();
  await expect(page.getByRole('heading', { name: 'Offline Throwdown' })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: /log a catch/i }).first().click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'catch.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8IAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAMCBAEFAAYHCAkKC//EAMMQAAEDAwIEAwQGBAcGBAgGcwECAAMRBBIhBTETIhAGQVEyFGFxIweBIJFCFaFSM7EkYjAWwXLRQ5I0ggjhU0AlYxc18JNzolBEsoPxJlQ2ZJR0wmDShKMYcOInRTdls1V1pJXDhfLTRnaA40dWZrQJChkaKCkqODk6SElKV1hZWmdoaWp3eHl6hoeIiYqQlpeYmZqgpaanqKmqsLW2t7i5usDExcbHyMnK0NTV1tfY2drg5OXm5+jp6vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAQIAAwQFBgcICQoL/8QAwxEAAgIBAwMDAgMFAgUCBASHAQACEQMQEiEEIDFBEwUwIjJRFEAGMyNhQhVxUjSBUCSRoUOxFgdiNVPw0SVgwUThcvEXgmM2cCZFVJInotIICQoYGRooKSo3ODk6RkdISUpVVldYWVpkZWZnaGlqc3R1dnd4eXqAg4SFhoeIiYqQk5SVlpeYmZqgo6SlpqeoqaqwsrO0tba3uLm6wMLDxMXGx8jJytDT1NXW19jZ2uDi4+Tl5ufo6ery8/T19vf4+fr/2wBDAAICAgICAgMCAgMFAwMDBQYFBQUFBggGBgYGBggKCAgICAgICgoKCgoKCgoMDAwMDAwODg4ODg8PDw8PDw8PDw//2wBDAQICAgQEBAcEBAcQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/2gAMAwEAAhEDEQAAAeE6RvdeZ6H/2gAIAQEAAQUCG43CXHvt1h7/ALYpNvfbUpH/2gAIAQMRAT8Bl1Uv8V//2gAIAQIRAT8Bx/Fx9Zv/2gAIAQEABj8CVOZlDrfOTLQLoDT9ZZPuqOOrQBao1D//xAAzEAEAAwACAgICAgMBAQAAAgsBEQAhMUFRYXGBkaGxwfDREOHxIDBAUGBwgJCgsMDQ4P/aAAgBAQABPyE+BER1szHxYNQ9+TcDqe6yy8O00gXYxiW//9oADAMBAAIRAxEAABBn/8QAMxEBAQEAAwABAgUFAQEAAQEJAQARITEQQVFhIHHwkYGhsdHB4fEwQFBgcICQoLDA0OD/2gAIAQMRAT8QYD8zve/g4/W3/9oACAECEQE/ENI8gZ89cfrb/9oACAEBAAE/EBXISkUVIqzKQkivm7VDsENUBx29U/NSDJHa7z7bIlwBJCCs8+7/AP/Z', 'base64'),
  });
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
