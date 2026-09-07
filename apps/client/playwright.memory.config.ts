import { defineConfig, devices } from '@playwright/test';

const productionUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  testMatch: 'photo-memory.spec.ts',
  outputDir: '/tmp/dink-derby-memory-results',
  workers: 1,
  timeout: productionUrl ? 120_000 : 60_000,
  use: { baseURL: productionUrl || 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], launchOptions: { executablePath: process.env.PLAYWRIGHT_WEBKIT_EXECUTABLE } } },
  ],
  webServer: productionUrl ? undefined : {
    command: 'npm run dev -- --port 5174 --strictPort',
    url: 'http://localhost:5174',
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_SUPABASE_ANON_KEY: '', VITE_API_URL: 'http://localhost:1' },
  },
});
