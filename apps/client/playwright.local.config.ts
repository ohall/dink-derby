import { defineConfig } from '@playwright/test';
import memoryConfig from './playwright.memory.config';

export default defineConfig({
  ...memoryConfig,
  testMatch: ['photo-memory.spec.ts', 'local-ui.spec.ts', 'ux-review.spec.ts', 'catch-corrections.spec.ts', 'catch-map.spec.ts', 'water-suggestions.spec.ts'],
  outputDir: '/tmp/dink-derby-local-results',
});
