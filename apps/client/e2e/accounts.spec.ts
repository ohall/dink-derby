import { expect, test, type Page } from '@playwright/test';

const guestId = '11111111-1111-4111-8111-111111111111';
const savedId = '22222222-2222-4222-8222-222222222222';
const derbyId = '33333333-3333-4333-8333-333333333333';
const now = new Date().toISOString();
function user(id: string, anonymous = false) {
  return { id, aud: 'authenticated', role: 'authenticated', email: anonymous ? '' : 'saved@example.com', email_confirmed_at: anonymous ? undefined : now, is_anonymous: anonymous, created_at: now, app_metadata: {}, user_metadata: {}, identities: [] };
}
function session(id: string, anonymous = false) {
  const payload = { sub: id, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), is_anonymous: anonymous };
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.test`;
  return { user: user(id, anonymous), access_token: token, refresh_token: `test-${id}`, expires_in: 3600, expires_at: payload.exp, token_type: 'bearer' };
}

async function mockServices(page: Page) {
  const syncCalls: { userId: string; outbox: { entityType: string; entityId: string }[] }[] = [];
  let linked = false;
  await page.route('https://accounts.test/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200 });
    if (path.endsWith('/signup')) return route.fulfill({ json: session(guestId, true) });
    if (path.endsWith('/otp')) return route.fulfill({ json: {} });
    if (path.endsWith('/verify')) {
      const body = req.postDataJSON();
      if (body.token !== '123456') return route.fulfill({ status: 403, json: { code: 'otp_expired', msg: 'Expired code' } });
      if (body.type === 'email_change') { linked = true; return route.fulfill({ json: session(guestId) }); }
      return route.fulfill({ json: session(savedId) });
    }
    if (path.endsWith('/user')) {
      const token = req.headers().authorization?.split(' ')[1];
      const id = token ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub : guestId;
      return route.fulfill({ json: user(id, id === guestId && !linked) });
    }
    return route.fulfill({ status: 400, json: { msg: `Unexpected auth route ${path}` } });
  });
  await page.route('https://api.test/sync', async route => {
    const request = route.request().postDataJSON(); syncCalls.push(request);
    const saved = request.userId === savedId;
    const patches = {
      users: saved ? [{ id: savedId, displayName: 'Returning Angler', createdAt: now, updatedAt: now }] : [],
      derbies: saved ? [{ id: derbyId, name: 'Family fishing finals', bodyOfWaterName: 'Test pond', createdByUserId: savedId, scoringMode: 'weight', status: 'finished', isArchived: false, createdAt: now, updatedAt: now }] : [],
      derbyParticipants: saved ? [{ id: '44444444-4444-4444-8444-444444444444', derbyId, userId: savedId, isAdmin: true, createdAt: now }] : [],
      catches: [], chatMessages: [], reactions: [], media: [],
    };
    await route.fulfill({ json: { serverTime: now, appliedOperationIds: request.outbox.map((op: { id: string }) => op.id), rejected: [], events: [], nextCursor: 0, patches } });
  });
  return syncCalls;
}

test('saves a guest in place after email verification, including error recovery', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await mockServices(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Save my account', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('save-account-mobile.png'), fullPage: true });
  await page.getByLabel('Email address').fill('saved@example.com');
  await page.getByRole('button', { name: 'Send email code' }).click();
  await page.getByLabel('Email code').fill('000000');
  await page.getByRole('button', { name: 'Verify and save account' }).click();
  await expect(page.getByRole('alert')).toContainText('invalid or expired');
  await page.getByLabel('Email code').fill('123456');
  await page.getByRole('button', { name: 'Verify and save account' }).click();
  await expect(page.getByRole('heading', { name: 'Account saved' })).toBeVisible();
  const identity = await page.evaluate(async () => {
    const { db } = await import('/src/db.ts');
    return (await db.settings.get('app'))?.currentUserId;
  });
  expect(identity).toBe(guestId);
  expect(errors).toEqual([]);
});

test('restores a saved angler into a separate database without sending the guest outbox', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const requests = await mockServices(page);
  await page.goto('/');
  const otherTab = await page.context().newPage();
  await mockServices(otherTab);
  await otherTab.goto('/');
  await expect(otherTab.getByRole('heading', { name: 'Derbies', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in to saved account', exact: true }).click();
  await page.getByLabel('Email address').fill('saved@example.com');
  await page.getByRole('button', { name: 'Send email code' }).click();
  await page.getByLabel('Email code').fill('123456');
  await page.getByRole('button', { name: 'Verify and sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Angler profile' })).toBeHidden();
  await expect.poll(() => page.evaluate(async () => {
    const { db } = await import('/src/db.ts'); return (await db.settings.get('app'))?.currentUserId;
  })).toBe(savedId);
  const data = await page.evaluate(async () => {
    const { db, DinkDerbyDatabase } = await import('/src/db.ts');
    const legacy = new DinkDerbyDatabase();
    const previous = (await legacy.settings.get('app'))?.currentUserId; legacy.close();
    return { name: db.name, previous, derbies: await db.derbies.count(), users: await db.users.toArray() };
  });
  expect(data.name).toBe(`DinkDerbyFieldDB:${savedId}`);
  expect(data.previous).toBe(guestId);
  expect(data.derbies).toBe(1);
  expect(data.users[0].displayName).toBe('Returning Angler');
  await expect.poll(() => otherTab.evaluate(async () => {
    const { db } = await import('/src/db.ts'); return (await db.settings.get('app'))?.currentUserId;
  })).toBe(savedId);
  await page.getByRole('button', { name: 'Past derbies (1)' }).click();
  await expect(page.getByRole('heading', { name: 'Family fishing finals' })).toBeVisible();
  await page.getByRole('button', { name: /Family fishing finals/ }).click();
  await expect(page.getByRole('heading', { name: 'Family fishing finals' })).toBeVisible();
  expect(requests.filter(req => req.userId === savedId).flatMap(req => req.outbox).some(op => op.entityType === 'user')).toBe(false);
  await page.reload();
  await expect.poll(() => page.evaluate(async () => {
    const { db } = await import('/src/db.ts'); return (await db.settings.get('app'))?.currentUserId;
  })).toBe(savedId);
  expect(errors).toEqual([]);
  await otherTab.close();
});
