import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: ['production-completion.spec.ts', 'catch-corrections.spec.ts', 'catch-map.spec.ts'],
  outputDir: '/tmp/dink-derby-production-results', workers: 1, timeout: 120_000,
  use: { baseURL: process.env.E2E_BASE_URL, ...devices['Pixel 7'], trace: 'retain-on-failure' },
});
