import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';

/**
 * Playwright configuration for Lesson Booking System E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: '.',
  fullyParallel: false, // Run tests serially for auth state consistency
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker for auth state consistency
  reporter: [
    ['html', { outputFolder: '../.artifacts/test-reports' }],
    ['list'],
  ],

  use: {
    baseURL: BASE_URL,
    trace: 'on',
    screenshot: 'on',
    video: 'on',
  },

  projects: [
    // Setup project for authentication
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: false, // Need headed mode for manual OAuth
      },
    },

    // Public pages - no auth required
    {
      name: 'public',
      testMatch: /landing\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // Instructor tests - require auth setup
    {
      name: 'instructor',
      testMatch: /instructor\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/instructor.json',
      },
    },

    // Student tests - require auth setup
    {
      name: 'student',
      testMatch: /student\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/student.json',
      },
    },

    // Full booking flow test
    {
      name: 'booking-flow',
      testMatch: /booking-flow\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },

    // Booking cancellation and rejection tests
    {
      name: 'booking-cancellation',
      testMatch: /booking-cancellation\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },

    // Validation and edge cases tests
    {
      name: 'booking-validation',
      testMatch: /booking-validation\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/instructor.json',
      },
    },
  ],

  // Run local dev server before starting tests
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:8787',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },

  // Output directory for test artifacts
  outputDir: '../.artifacts/test-results',
});
