import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  expect: { timeout: 120_000 },
  workers: 1,
  use: { baseURL: process.env.BASE_URL, channel: 'chrome', headless: true, screenshot: 'only-on-failure' },
});
