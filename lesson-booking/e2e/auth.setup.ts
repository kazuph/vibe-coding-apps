import { test as setup, expect } from '@playwright/test';
import { goToHome, clickLoginButton } from './helpers/navigation';

const INSTRUCTOR_AUTH_FILE = '.auth/instructor.json';
const STUDENT_AUTH_FILE = '.auth/student.json';

/**
 * Authentication Setup for E2E Tests
 *
 * This setup requires manual Google OAuth login.
 * Run this setup first, then run the authenticated tests.
 *
 * Usage:
 * 1. Run: npx playwright test --project=setup
 * 2. Manually complete Google OAuth login in the browser
 * 3. The session will be saved for subsequent tests
 *
 * For instructor tests: Use a Google account registered as instructor
 * For student tests: Use a Google account registered as student
 */

setup.describe.configure({ mode: 'serial' });

setup('authenticate as instructor', async ({ page }) => {
  // Skip if already authenticated
  try {
    await page.goto('/instructor');
    await page.waitForLoadState('networkidle');
    if (page.url().includes('/instructor')) {
      // Already authenticated
      await page.context().storageState({ path: INSTRUCTOR_AUTH_FILE });
      return;
    }
  } catch {
    // Not authenticated, continue with login
  }

  await goToHome(page);
  await clickLoginButton(page);

  // Wait for user to complete OAuth manually
  // Playwright will pause here if run in headed mode
  console.log('Please complete Google OAuth login as an instructor...');

  // Wait for redirect back to instructor dashboard
  await page.waitForURL('**/instructor**', { timeout: 120000 });

  // Verify we're on the instructor dashboard
  await expect(page.locator('h1')).toContainText('講師');

  // Save authentication state
  await page.context().storageState({ path: INSTRUCTOR_AUTH_FILE });
});

setup('authenticate as student', async ({ page }) => {
  // Skip if already authenticated
  try {
    await page.goto('/student');
    await page.waitForLoadState('networkidle');
    if (page.url().includes('/student')) {
      // Already authenticated
      await page.context().storageState({ path: STUDENT_AUTH_FILE });
      return;
    }
  } catch {
    // Not authenticated, continue with login
  }

  await goToHome(page);
  await clickLoginButton(page);

  // Wait for user to complete OAuth manually
  console.log('Please complete Google OAuth login as a student...');

  // Wait for redirect back to student dashboard
  await page.waitForURL('**/student**', { timeout: 120000 });

  // Verify we're on the student dashboard
  await expect(page.locator('h1')).toContainText('生徒');

  // Save authentication state
  await page.context().storageState({ path: STUDENT_AUTH_FILE });
});
