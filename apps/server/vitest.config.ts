import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit/integration tests must never inherit live auth, storage, or database
    // credentials from a developer's .env. Real deployed auth is tested via E2E.
    env: {
      SUPABASE_URL: '', SUPABASE_PUBLISHABLE_KEY: '', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgres://test:test@127.0.0.1:1/dink_derby_test',
    },
  },
});
