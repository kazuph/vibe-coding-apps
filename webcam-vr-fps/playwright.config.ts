import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const humanHandsFixture = fileURLToPath(new URL('./e2e/fixtures/human-hands.y4m', import.meta.url))

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /human-camera\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'human-camera',
      testMatch: /human-camera\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['camera'],
        video: 'on',
        launchOptions: {
          channel: 'chrome',
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-video-capture=${humanHandsFixture}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
