import { defineConfig, devices } from '@playwright/test';

const live = process.env.E2E_BASE_URL;
export default defineConfig({
  testDir: './e2e', testMatch: 'angler-removal.spec.ts', workers: 1, timeout: 120_000,
  outputDir: '/tmp/dink-derby-removal-results',
  use: { baseURL: live || 'http://localhost:5177', ...devices['Pixel 7'], trace: 'retain-on-failure' },
  webServer: live ? undefined : [
    { command: 'npm run dev -w @dink-derby/server', cwd: '../..', url: 'http://localhost:3007',
      env: { PORT: '3007', DATABASE_URL: 'postgres://dink_test:dink_test@127.0.0.1:55433/dink_derby_removal_test', SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', ALLOWED_ORIGINS: 'http://localhost:5177' } },
    { command: 'npm run dev -- --port 5177 --strictPort --force', url: 'http://localhost:5177',
      env: { VITE_API_URL: 'http://localhost:3007', VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_SUPABASE_ANON_KEY: '', VITE_SYNC_INTERVAL_MS: '2000' } },
  ],
});
