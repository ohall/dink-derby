import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'accounts.spec.ts', workers: 1,
  timeout: 60_000, outputDir: '/tmp/dink-derby-account-results',
  use: { baseURL: 'http://localhost:5176', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'npm run dev -- --port 5176 --strictPort', url: 'http://localhost:5176',
    env: { VITE_ACCOUNT_RECOVERY_ENABLED: 'true', VITE_API_URL: 'https://api.test', VITE_SUPABASE_URL: 'https://accounts.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test', VITE_SYNC_INTERVAL_MS: '60000' },
  },
});
