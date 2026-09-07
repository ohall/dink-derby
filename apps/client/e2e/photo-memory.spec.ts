import { expect, test } from '@playwright/test';

test('recovers a draft, accepts a phone photo, rejects oversized photos, and saves offline', async ({ page, context, browser }, testInfo) => {
  const completedUploads: number[] = [];
  page.on('console', message => {
    if (message.text().includes('Catch draft could not be persisted.')) console.log(message.text());
  });
  page.on('response', response => {
    if (/\/media\/[^/]+\/complete$/.test(response.url()) && response.request().method() === 'POST') completedUploads.push(response.status());
  });
  await page.goto('/');
  await page.getByLabel('Display name').fill('Photo validation');
  await page.getByRole('button', { name: /save profile/i }).click();
  await page.getByRole('button', { name: /start a derby/i }).first().click();
  const derbyName = `Photo check ${Date.now().toString(36)}`;
  await page.getByLabel('Derby name').fill(derbyName);
  await page.getByLabel('Water').fill('Private test pond');
  await page.getByRole('button', { name: /create derby/i }).click();
  await page.getByRole('button', { name: 'Invite anglers', exact: true }).click();
  const inviteCode = await page.getByLabel('Invite code').inputValue();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: /log a catch/i }).first().click();
  await page.getByLabel('Length').fill('18.5');
  await page.getByText('Note & location', { exact: false }).click();
  await page.getByLabel('Note').fill('Draft survives the camera handoff');
  const picker = page.getByLabel('Catch photo');
  await expect(picker).toBeEnabled(); // The draft is committed before the picker opens.
  await expect(picker).not.toHaveAttribute('capture');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Log a catch', exact: true })).toBeVisible();
  await expect(page.getByLabel('Length')).toHaveValue('18.5');
  await expect(page.getByLabel('Note')).toHaveValue('Draft survives the camera handoff');

  // A real 12 MP encoded image exercises decoding, compression and hashing.
  const jpeg = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 4032; canvas.height = 3024;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#123b35'); gradient.addColorStop(1, '#e9c56b');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const encoded = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
    canvas.width = canvas.height = 0;
    return encoded;
  });
  await picker.setInputFiles({ name: 'phone-12mp.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
  const preview = page.getByAltText('Selected catch preview');
  await expect(preview).toBeVisible();
  await expect(picker).toBeEnabled();
  await expect(page.getByText('Draft could not be backed up', { exact: false })).toHaveCount(0);
  const dimensions = await preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(Math.max(...dimensions)).toBeLessThanOrEqual(1600);
  expect(Math.min(...dimensions)).toBeGreaterThan(500);
  await page.reload();
  await expect(preview).toBeVisible(); // Prepared photo is in the saved draft too.
  await page.getByRole('button', { name: 'Save catch', exact: true }).click();
  const card = page.locator('.catch-card').filter({ hasText: 'Draft survives the camera handoff' });
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toBeVisible();
  if (process.env.E2E_BASE_URL) {
    await expect(card).toContainText('Counts in standings', { timeout: 30_000 });
    await expect.poll(() => completedUploads.filter(status => status === 200).length, { timeout: 30_000 }).toBe(1);
  }

  await page.getByRole('button', { name: /log a catch/i }).first().click();
  await expect(page.locator('.catch-card img')).toHaveCount(0); // Release feed photos behind the sheet.
  await page.getByLabel('Length').fill('7');
  // Header-only file: must be rejected before any attempt to decode 48 MP.
  await picker.setInputFiles({ name: '48mp.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255,216,255,192,0,11,8,23,160,31,128,1,1,17,0]) });
  await expect(page.getByRole('status').filter({ hasText: '16 MP' })).toBeVisible();
  await expect(preview).toHaveCount(0);
  await page.getByText('Note & location', { exact: false }).click();
  await page.getByLabel('Note').fill('Oversized photo skipped; fish saved');
  await page.getByRole('button', { name: 'Save catch', exact: true }).click();
  await expect(page.locator('.catch-card').filter({ hasText: 'Oversized photo skipped; fish saved' })).toBeVisible();

  // WebKit's offline emulation also breaks reading an in-memory File (verified
  // independently of this app). Block HTTP and signal offline in that engine.
  const offlinePattern = /^https?:\/\//;
  const blockRequest = (route: import('@playwright/test').Route) => route.abort('internetdisconnected');
  if (testInfo.project.name === 'mobile-webkit') {
    await context.route(offlinePattern, blockRequest);
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      window.dispatchEvent(new Event('offline'));
    });
  } else await context.setOffline(true);
  await page.getByRole('button', { name: /log a catch/i }).first().click();
  await page.getByLabel('Length').fill('9');
  await page.getByText('Note & location', { exact: false }).click();
  await page.getByLabel('Note').fill('Offline photo survives reload');
  await picker.setInputFiles({ name: 'offline-phone.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(jpeg, 'base64') });
  await expect(preview).toBeVisible();
  await page.getByRole('button', { name: 'Save catch', exact: true }).click();
  await expect(page.getByText('Offline photo survives reload')).toBeVisible();
  if (testInfo.project.name === 'mobile-webkit') {
    await context.unroute(offlinePattern, blockRequest);
    await page.evaluate(() => {
      Reflect.deleteProperty(navigator, 'onLine');
      window.dispatchEvent(new Event('online'));
    });
  } else await context.setOffline(false);
  await page.reload();
  await expect(page.getByRole('heading', { name: derbyName, exact: true })).toBeVisible();
  const offlineCard = page.locator('.catch-card').filter({ hasText: 'Offline photo survives reload' });
  await expect(offlineCard.locator('img')).toBeVisible();
  if (process.env.E2E_BASE_URL) {
    await expect(offlineCard).toContainText('Counts in standings', { timeout: 30_000 });
    await expect.poll(() => completedUploads.filter(status => status === 200).length, { timeout: 30_000 }).toBe(2);
    // A fresh browser has no local photo Blobs: this verifies the real upload,
    // server snapshot and authenticated download rather than only the preview.
    const viewerContext = await browser.newContext();
    try {
      const viewer = await viewerContext.newPage();
      await viewer.goto(process.env.E2E_BASE_URL);
      await viewer.getByLabel('Display name').fill('Photo validation viewer');
      await viewer.getByRole('button', { name: /save profile/i }).click();
      await viewer.getByRole('button', { name: /join with code/i }).click();
      await viewer.getByLabel('Invite code').fill(inviteCode);
      await viewer.getByRole('button', { name: 'Join derby', exact: true }).click();
      const remotePhoto = viewer.locator('.catch-card').filter({ hasText: 'Draft survives the camera handoff' }).locator('img');
      await expect(remotePhoto).toBeVisible();
      await expect.poll(() => remotePhoto.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      await expect(viewer.getByText('Offline photo survives reload')).toBeVisible();
    } finally { await viewerContext.close(); }
  }
  await page.screenshot({ path: `/tmp/dink-derby-${process.env.E2E_BASE_URL ? 'production' : 'local'}-${testInfo.project.name}.png`, fullPage: true });
});
