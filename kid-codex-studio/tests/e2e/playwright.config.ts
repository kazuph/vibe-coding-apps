import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:5277',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'ipad', use: { ...devices['iPad Pro 11'] } }
  ],
  webServer: {
    command: 'pnpm run dev',
    url: 'http://127.0.0.1:5277',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
