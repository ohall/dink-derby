import { expect, test, type Page } from '@playwright/test';

async function onboard(page: Page, name: string) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /angler profile/i })).toBeVisible();
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: /save profile/i }).click();
  await expect(page.getByRole('heading', { name: 'Derbies', exact: true })).toBeVisible();
}

test('two anglers exercise the full derby feature surface', async ({ browser }) => {
  const creatorContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  const creator = await creatorContext.newPage();
  const joiner = await joinerContext.newPage();

  // 1. Creator onboards, creates a derby, and grabs the invite code.
  await onboard(creator, 'Creator Angler');
  await creator.getByRole('button', { name: /start a derby/i }).first().click();
  await creator.getByLabel('Derby name').fill('Multi User Smoke Test');
  await creator.getByLabel('Water').fill('Lake Multi');
  await creator.getByRole('button', { name: /length/i }).click();
  await creator.getByLabel('Scoring').selectOption('biggest');
  await creator.getByRole('button', { name: /create derby/i }).click();
  await expect(creator.getByRole('heading', { name: 'Multi User Smoke Test' })).toBeVisible();
  await expect(creator.getByText('Synced to derby')).toBeVisible({ timeout: 15_000 });

  const inviteButton = creator.locator('.invite-button');
  await expect(inviteButton).toBeVisible();
  const inviteCode = (await inviteButton.innerText()).trim();

  // 2. Joiner signs up with that code.
  await onboard(joiner, 'Joining Angler');
  await joiner.getByRole('button', { name: /join with code/i }).click();
  await joiner.getByLabel('Invite code').fill(inviteCode);
  await joiner.getByRole('button', { name: /join derby/i }).click();
  await expect(joiner.getByRole('heading', { name: 'Multi User Smoke Test' })).toBeVisible();

  // 3. Creator logs a catch with a photo, species, and note.
  await creator.getByRole('button', { name: /log a catch/i }).first().click();
  await creator.locator('input[type="file"]').setInputFiles({
    name: 'catch.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBAQEBAVERAWEhITEhIRFhMREREsEhcNBREOERIPGBUXGxgbGxAaHxYXGxsbIRseHx8iIB8XHwAeIR8iFhqBAN0AiKi4uLj6AhkWDg4NWFsdI1sNTRYnt7S31BfY6OsxM6GzAqhM4CTA0r1MaZbWJpGMlKN44Vxt2dmt9LdCxQ4DNZIWZo2G5xfXxQUI1qxCXoIsFyxsmqyTZcR9NlG5jRBZWYc831s3Y93lc2fpq3kQtf3SeOeL47XDUiOcQqMWeKubFiJuPTcx8UcNVAyJ69/LrQDxTTdRdruGZkqj+2D+yNTs+R2FHF4s0Bs2WgKwT9KKo9K6QKuGXKogoEpmMMeEgjIkBJARHw8I1AWfVWjDuMrRXIogAAH/1ABQDAPC1UuA4zABLsk9RgAP/xAApEAAAwEAAwEBAAAAAAAAYGC1BUfE9L6H9XR0dHVoLWcUxJdS34/xAAZEQEAAwEAAwEBAAAAAAAAAQIDBBEFJgIRFSD8Z/xAAhEQADAgIBAwQAAAAAAAAAAQIDBBEFJgIRFSD8Z/xAAqEQACAgEDAwEAAAAAAAAAAQIDBBEFJgIRFSD8Z/xAAnEQACAQEAAwEAAAAAAAAAAQIDBBEFJgIRFSD8Z/xAAeEQACAQEAAwEAAAAAAAAAAQIDBBEFJgIRFSD8Z/xAAVEQACAQEAAwEAAAAAAAAAAQIDBBEFJgIRFSD8Z/xAAsEQACAQEAAwEAAAAAAAAAAQIDBBEFJgIRFSD8Z/xAAkEQACAQEAAwEAAAAAAAAAAQIDBBEFJgIRFSD8Z/xAAcEQACAQEAAwEAAAAAAAAAAQIDBBEFJgIRFSD8Z/xABeEQACAQEAAwEAAAAAAAAAAQIDBBEFJgIRFSD8Z/xAAWAEAACEDAwIDAAMAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAfEQABBAECAwAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xABmEQABBAECAwAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAeEQAAgEFAAAAAAAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAlEQABBQEAAAAAAAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAuEAEAACEDAwIDAAMAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAkEQABAQEAAAAAAAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAjEQADAAAAAAAAAAAAAAAAAQIDBBEFJgIRFSD8Z/xAA9EQAGAwEAAAAAAAAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAnEQACAQEAAAAAAAAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAcEQABBQAAAAAAAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAlEQACAQEAAAAAAAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAA2EQABAQEAAAAAAAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAkEQEAHQEAAAAAAAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAlEQAEAEAAAAAAAAAAAAAAABAgMgAREmMzGEMiIHEvE1YnE1vE5P/xAAcEQAAAAAAAAAAAAAAAAAAAAD/2wA=', 'base64'),
  });
  await creator.getByLabel('Length').fill('21.25');
  await creator.getByLabel('Species').fill('Smallmouth bass');
  await creator.getByLabel('Note').fill('Two-user test catch.');
  await creator.getByRole('button', { name: 'Save catch' }).click();
  await expect(creator.locator('.catch-card').filter({ hasText: 'Two-user test catch.' })).toContainText('21.25');

  // 4. Creator sends a chat message.
  await creator.getByRole('textbox', { name: /message the derby/i }).fill('Your turn.');
  await creator.getByRole('button', { name: /send message/i }).click();
  await expect(creator.getByText('Your turn.')).toBeVisible();

  // 5. Creator reacts to the joiner's future catch (fire). We register before joiner writes it.
  await joiner.reload();
  await joiner.getByRole('button', { name: /Multi User Smoke Test/i }).click();
  await expect(joiner.getByText('Two-user test catch.')).toBeVisible({ timeout: 15_000 });
  await expect(joiner.getByText('Your turn.')).toBeVisible({ timeout: 15_000 });

  // 6. Joiner writes a catch back.
  await joiner.getByRole('button', { name: /log a catch/i }).first().click();
  await joiner.getByLabel('Length').fill('19.5');
  await joiner.getByLabel('Species').fill('Largemouth bass');
  await joiner.getByLabel('Note').fill('Joiner blows the whistle.');
  await joiner.getByRole('button', { name: 'Save catch' }).click();
  await expect(joiner.locator('.catch-card').filter({ hasText: 'Joiner blows the whistle.' })).toContainText('19.5');

  // 7. Both users react to each other's catches. Creator uses fire, joiner uses trophy.
  await creator.getByRole('button', { name: /fire/i }).first().click();
  await joiner.getByRole('button', { name: /trophy/i }).first().click();

  // 8. Activity tab should render both catches plus messages and reaction entries on both sides.
  await creator.getByRole('button', { name: /activity/i }).click();
  await expect(creator.getByText(/logged Largemouth bass/i)).toBeVisible();
  await expect(creator.getByText(/said "Your turn."/i)).toBeVisible();
  await joiner.getByRole('button', { name: /activity/i }).click();
  await expect(joiner.getByText(/logged Smallmouth bass/i)).toBeVisible({ timeout: 15_000 });

  // 9. Standings should show the creator ahead (biggest fish) on both devices.
  await creator.getByRole('button', { name: /standings/i }).click();
  await expect(creator.locator('.leaderboard__angler strong').first()).toContainText('Creator Angler');
  await joiner.getByRole('button', { name: /standings/i }).click();
  await expect(joiner.locator('.leaderboard__angler strong').filter({ hasText: 'Creator Angler' })).toBeVisible({ timeout: 15_000 });

  await creatorContext.close();
  await joinerContext.close();
});
