import { expect, test, type Page } from '@playwright/test';

async function onboard(page: Page, name: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /angler profile/i })).toBeVisible();
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: /save profile/i }).click();
  await expect(page.getByRole('heading', { name: 'Derbies', exact: true })).toBeVisible();
}

test('two anglers create, join, and share a catch through the server', async ({ browser }) => {
  const creatorContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const joiner = await joinerContext.newPage();

  await onboard(creator, 'Creator Angler');
  await creator.getByRole('button', { name: /start a derby/i }).first().click();
  await creator.getByLabel('Derby name').fill('Two Phone Throwdown');
  await creator.getByLabel('Water').fill('Test Lake');
  await creator.getByRole('button', { name: /fish count/i }).click();
  await creator.getByRole('button', { name: /create derby/i }).click();
  await expect(creator.getByRole('heading', { name: 'Two Phone Throwdown' })).toBeVisible();
  await expect(creator.getByText('Synced to derby')).toBeVisible({ timeout: 10_000 });

  const inviteButton = creator.locator('.invite-button');
  await expect(inviteButton).toBeVisible();
  const inviteCode = (await inviteButton.innerText()).trim();

  await onboard(joiner, 'Joining Angler');
  await joiner.getByRole('button', { name: /join with code/i }).click();
  await joiner.getByLabel('Invite code').fill(inviteCode);
  await joiner.getByRole('button', { name: /join derby/i }).click();
  await expect(joiner.getByRole('heading', { name: 'Two Phone Throwdown' })).toBeVisible();

  await creator.getByRole('button', { name: /log a catch/i }).first().click();
  await creator.locator('input[type="file"]').setInputFiles({
    name: 'catch.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8IAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAMCBAEFAAYHCAkKC//EAMMQAAEDAwIEAwQGBAcGBAgGcwECAAMRBBIhBTETIhAGQVEyFGFxIweBIJFCFaFSM7EkYjAWwXLRQ5I0ggjhU0AlYxc18JNzolBEsoPxJlQ2ZJR0wmDShKMYcOInRTdls1V1pJXDhfLTRnaA40dWZrQJChkaKCkqODk6SElKV1hZWmdoaWp3eHl6hoeIiYqQlpeYmZqgpaanqKmqsLW2t7i5usDExcbHyMnK0NTV1tfY2drg5OXm5+jp6vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAQIAAwQFBgcICQoL/8QAwxEAAgIBAwMDAgMFAgUCBASHAQACEQMQEiEEIDFBEwUwIjJRFEAGMyNhQhVxUjSBUCSRoUOxFgdiNVPw0SVgwUThcvEXgmM2cCZFVJInotIICQoYGRooKSo3ODk6RkdISUpVVldYWVpkZWZnaGlqc3R1dnd4eXqAg4SFhoeIiYqQk5SVlpeYmZqgo6SlpqeoqaqwsrO0tba3uLm6wMLDxMXGx8jJytDT1NXW19jZ2uDi4+Tl5ufo6ery8/T19vf4+fr/2wBDAAICAgICAgMCAgMFAwMDBQYFBQUFBggGBgYGBggKCAgICAgICgoKCgoKCgoMDAwMDAwODg4ODg8PDw8PDw8PDw//2wBDAQICAgQEBAcEBAcQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/2gAMAwEAAhEDEQAAAeE6RvdeZ6H/2gAIAQEAAQUCG43CXHvt1h7/ALYpNvfbUpH/2gAIAQMRAT8Bl1Uv8V//2gAIAQIRAT8Bx/Fx9Zv/2gAIAQEABj8CVOZlDrfOTLQLoDT9ZZPuqOOrQBao1D//xAAzEAEAAwACAgICAgMBAQAAAgsBEQAhMUFRYXGBkaGxwfDREOHxIDBAUGBwgJCgsMDQ4P/aAAgBAQABPyE+BER1szHxYNQ9+TcDqe6yy8O00gXYxiW//9oADAMBAAIRAxEAABBn/8QAMxEBAQEAAwABAgUFAQEAAQEJAQARITEQQVFhIHHwkYGhsdHB4fEwQFBgcICQoLDA0OD/2gAIAQMRAT8QYD8zve/g4/W3/9oACAECEQE/ENI8gZ89cfrb/9oACAEBAAE/EBXISkUVIqzKQkivm7VDsENUBx29U/NSDJHa7z7bIlwBJCCs8+7/AP/Z', 'base64'),
  });
  await creator.getByLabel('Species').fill('Smallmouth bass');
  await creator.getByLabel('Note').fill('Shared across two phones.');
  await creator.getByRole('button', { name: 'Save catch' }).click();
  await expect(creator.locator('.catch-card').filter({ hasText: 'Shared across two phones.' })).toContainText('1fish');
  await expect(creator.getByText('Provisional score')).toBeVisible();
  await expect(creator.getByText('Provisional score')).toBeHidden({ timeout: 10_000 });

  await joiner.reload();
  await joiner.getByRole('button', { name: /Two Phone Throwdown/i }).click();
  await expect(joiner.getByText('Shared across two phones.')).toBeVisible({ timeout: 10_000 });
  await expect(joiner.locator('.catch-card').filter({ hasText: 'Shared across two phones.' })).toContainText('1fish');

  await creatorContext.close();
  await joinerContext.close();
});
