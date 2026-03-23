import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 120_000,
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: process.env.RUBY_SKETCH_BASE_URL ?? 'http://localhost:8765',
    trace: 'on-first-retry',
  },
});
