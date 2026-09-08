import { expect, test, type Page } from '@playwright/test';

const code = 'DINK-QRTEST123456';
async function profile(page: Page, name: string) {
  await page.getByLabel('Display name').fill(name);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
}
async function create(page: Page, name: string) {
  await page.getByRole('button', { name: 'Start a derby', exact: true }).click();
  await page.getByLabel('Derby name').fill(name);
  await page.getByLabel('Water', { exact: true }).fill('QR verification pond');
  await page.getByRole('button', { name: 'Create derby', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function fixtureJoin(page: Page) {
  let count = 0;
  await page.route('**/join', route => {
    count++;
    const { user, inviteCode } = route.request().postDataJSON();
    expect(inviteCode).toBe(code);
    const now = new Date().toISOString();
    const derby = { id: 'qr-fixture-derby', name: 'QR test derby', location: 'QR verification pond', scoringMode: 'count', startsAt: now, createdAt: now, updatedAt: now, createdByUserId: 'fixture-owner', inviteCode: code };
    const participant = { id: 'qr-fixture-angler', derbyId: derby.id, userId: user.id, isAdmin: false, createdAt: now };
    return route.fulfill({ json: { derby, participant, snapshot: { users: [user], derbies: [derby], derbyParticipants: [participant], catches: [], media: [], chatMessages: [], reactions: [] } } });
  });
  return () => count;
}

// Feed real QR pixels through a real video MediaStream. Only the camera hardware
// is replaced; QR generation, the production decoder/worker, and join UI are real.
function cameraFixture({ svg, pending = false }: { svg: string; pending?: boolean }) {
  const state = { requests: 0, streams: [] as MediaStream[], release: undefined as undefined | (() => void) };
  Object.assign(window, { __qrTest: state });
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
    state.requests++;
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    const ctx = canvas.getContext('2d')!;
    const image = new Image();
    if (svg) { image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await image.decode(); }
    function draw() { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 640, 480); if (svg) ctx.drawImage(image, 120, 40, 400, 400); }
    draw();
    const stream = canvas.captureStream(10); state.streams.push(stream);
    const timer = setInterval(() => { if (stream.getTracks().every(track => track.readyState === 'ended')) clearInterval(timer); else draw(); }, 100);
    if (pending) await new Promise<void>(resolve => { state.release = resolve; });
    return stream;
  } });
}
async function allCamerasStopped(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const state = (window as unknown as { __qrTest: { streams: MediaStream[] } }).__qrTest;
    return state.streams.length > 0 && state.streams.every(stream => stream.getTracks().every(track => track.readyState === 'ended'));
  })).toBe(true);
}
async function svgFromInvite(page: Page) {
  await page.getByRole('button', { name: 'Invite anglers', exact: true }).click();
  await expect(page.locator('.invite-qr svg')).toBeVisible();
  return page.locator('.invite-qr svg').evaluate(svg => { svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); return svg.outerHTML; });
}

for (const width of [320, 375, 1280]) test(`camera links survive onboarding and a participant can display a decodable QR at ${width}px`, async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Local fixture check.');
  // Exercise the real worker fallback as well as native BarcodeDetector.
  if (width === 375) await page.addInitScript(() => { Reflect.deleteProperty(window, 'BarcodeDetector'); });
  await page.setViewportSize({ width, height: 950 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const joins = await fixtureJoin(page);
  await page.goto(`/#join=${code}`);
  await profile(page, 'QR fixture guest');
  await expect(page.getByLabel('Invite code')).toHaveValue(code);
  expect(joins()).toBe(0);
  await page.reload();
  await expect(page.getByLabel('Invite code')).toHaveValue(code);
  await page.getByRole('button', { name: 'Join derby', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(joins()).toBe(1); expect(new URL(page.url()).hash).toBe('');
  await expect(page.getByRole('button', { name: 'Finish derby', exact: true })).toHaveCount(0);
  const svg = await svgFromInvite(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/dink-derby-qr-${width}.png`, fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'All derbies', exact: true }).click();
  await page.evaluate(cameraFixture, { svg });
  await page.getByRole('button', { name: 'Join a derby', exact: true }).click();
  await page.getByRole('button', { name: 'Scan QR code', exact: true }).click();
  await expect(page.getByLabel('Invite code')).toHaveValue(code, { timeout: 15_000 });
  await allCamerasStopped(page);
  expect(joins()).toBe(1);
  await expect(page.getByRole('button', { name: 'Join derby', exact: true })).toBeFocused();
  for (const button of [page.getByRole('button', { name: 'Scan QR code', exact: true }), page.getByRole('button', { name: 'Join derby', exact: true })]) {
    const box = await button.boundingBox(); expect(box!.width + 0.01).toBeGreaterThanOrEqual(44); expect(box!.height + 0.01).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('denied camera, bad links, and offline joins preserve a manual fallback', async ({ page, context }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Local failure simulation.');
  await page.addInitScript(() => Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: () => Promise.reject(new DOMException('Denied', 'NotAllowedError')) }));
  const joins = await fixtureJoin(page);
  await page.goto('/#join=invalid'); await profile(page, 'QR failure tester');
  await expect(page.getByRole('alert')).toContainText('invite link is invalid');
  await page.getByRole('button', { name: 'Scan QR code', exact: true }).click();
  await expect(page.locator('.invite-scanner [role=status]')).toContainText('permission was denied');
  await page.getByRole('button', { name: 'Cancel scan', exact: true }).click();
  await page.getByLabel('Invite code').fill(code);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Join derby', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Connect to join a new derby');
  await expect(page.getByLabel('Invite code')).toHaveValue(code); expect(joins()).toBe(0);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Join derby', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); expect(joins()).toBe(1);
});

test('closing, backgrounding and late camera permission all release camera tracks', async ({ page }) => {
  test.skip(!!process.env.E2E_BASE_URL, 'Local camera lifecycle simulation.');
  await page.goto('/'); await profile(page, 'QR camera tester');
  await page.evaluate(cameraFixture, { svg: '' });
  await page.getByRole('button', { name: 'Join a derby', exact: true }).click();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole('button', { name: 'Scan QR code', exact: true }).click();
    await expect(page.locator('.invite-scanner [role=status]')).toContainText('Point the camera');
    await page.getByRole('button', { name: 'Cancel scan', exact: true }).click();
    await allCamerasStopped(page);
  }
  await page.getByRole('button', { name: 'Scan QR code', exact: true }).click();
  await expect(page.locator('.invite-scanner [role=status]')).toContainText('Point the camera');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await allCamerasStopped(page);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.getByRole('button', { name: 'Try camera again', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(cameraFixture, { svg: '', pending: true });
  await page.getByRole('button', { name: 'Join a derby', exact: true }).click();
  await page.getByRole('button', { name: 'Scan QR code', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { __qrTest: { release?: () => void } }).__qrTest.release)).toBe(true);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => (window as unknown as { __qrTest: { release: () => void } }).__qrTest.release());
  await allCamerasStopped(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('live participant QR joins a third device, syncs membership, and survives reload', async ({ browser }) => {
  test.skip(!process.env.E2E_BASE_URL, 'Explicit deployed target required; creates one dedicated QA derby.');
  const ownerContext = await browser.newContext(), participantContext = await browser.newContext(), scannerContext = await browser.newContext();
  const owner = await ownerContext.newPage(), participant = await participantContext.newPage(), scanner = await scannerContext.newPage();
  const name = `QR QA ${Date.now().toString(36)}`;
  try {
    await owner.goto(process.env.E2E_BASE_URL!); await profile(owner, 'QR QA owner'); await create(owner, name);
    await expect(owner.getByText('Synced to derby', { exact: true })).toBeVisible({ timeout: 30_000 });
    await svgFromInvite(owner);
    const invite = await owner.getByLabel('Invite code').inputValue();
    await owner.getByRole('button', { name: 'Close', exact: true }).click();
    // This is the same link decoded by a phone's built-in camera.
    await participant.goto(`${process.env.E2E_BASE_URL}/#join=${invite}`);
    await profile(participant, 'QR QA participant');
    await expect(participant.getByLabel('Invite code')).toHaveValue(invite);
    const joined = participant.waitForResponse(response => response.url().endsWith('/join') && response.request().method() === 'POST');
    await participant.getByRole('button', { name: 'Join derby', exact: true }).click();
    const joinResponse = await joined; expect(joinResponse.status()).toBe(200); expect((await joinResponse.json()).participant.isAdmin).toBe(false);
    await expect(participant.getByRole('dialog')).toHaveCount(0);
    const svg = await svgFromInvite(participant);
    await scanner.goto(process.env.E2E_BASE_URL!); await profile(scanner, 'QR QA scanner');
    await scanner.evaluate(cameraFixture, { svg });
    await scanner.getByRole('button', { name: 'Join a derby', exact: true }).click();
    await scanner.getByRole('button', { name: 'Scan QR code', exact: true }).click();
    await expect(scanner.getByLabel('Invite code')).toHaveValue(invite, { timeout: 15_000 });
    await allCamerasStopped(scanner);
    const scanJoined = scanner.waitForResponse(response => response.url().endsWith('/join') && response.request().method() === 'POST');
    await scanner.getByRole('button', { name: 'Join derby', exact: true }).click();
    const response = await scanJoined; expect(response.status()).toBe(200);
    expect((await response.json()).snapshot.derbyParticipants).toHaveLength(3);
    await expect(scanner.getByRole('heading', { name, exact: true })).toBeVisible();
    await scanner.reload(); await expect(scanner.getByRole('heading', { name, exact: true })).toBeVisible();
    await owner.getByRole('button', { name: 'Finish derby', exact: true }).click();
    await owner.getByRole('button', { name: 'Finish and view results', exact: true }).click();
    await expect(scanner.getByRole('heading', { name: 'Derby results', exact: true })).toBeVisible({ timeout: 30_000 });
    console.log(`Verified built-in camera link, non-admin participant QR, real QR decode, authenticated three-device join, reload and completion: ${name}`);
  } finally { await ownerContext.close(); await participantContext.close(); await scannerContext.close(); }
});
