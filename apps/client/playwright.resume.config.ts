import { defineConfig } from '@playwright/test';
import memoryConfig from './playwright.memory.config';

export default defineConfig({
  ...memoryConfig,
  testMatch: 'resume-sync.spec.ts',
  outputDir: '/tmp/dink-derby-resume-results',
});
