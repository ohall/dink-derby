import { test, expect } from '@playwright/test';

test('launch and capture screenshot', async ({ page }) => {
  await page.goto('/');
  
  // Wait for the app to be ready (device ID generated)
  await expect(page.locator('text=Dink Derby')).toBeVisible();
  
  // Capture screenshot for AI review
  await page.screenshot({ path: 'current-ui.png', fullPage: true });
  
  // Capture accessibility tree for AI review (semantic structure)
  // const snapshot = await page.accessibility.snapshot();
  // console.log(JSON.stringify(snapshot, null, 2));
});
