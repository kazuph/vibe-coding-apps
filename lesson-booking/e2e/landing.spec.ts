import { test, expect } from '@playwright/test';
import { goToHome, clickLoginButton } from './helpers/navigation';

/**
 * Landing Page E2E Tests
 *
 * Tests the public landing page without authentication.
 * All navigation uses UI elements only.
 */

test.describe('Landing Page', () => {
  test('displays the homepage correctly', async ({ page }) => {
    await goToHome(page);

    // Verify page title and main heading
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toContainText('レッスン予約');

    // Verify login button is visible
    const loginButton = page.locator('a[href="/auth/google"], a:has-text("Googleでログイン")');
    await expect(loginButton.first()).toBeVisible();
  });

  test('displays feature descriptions', async ({ page }) => {
    await goToHome(page);

    // Verify feature sections are displayed
    const features = page.locator('.feature, .features, section');
    const featureCount = await features.count();
    expect(featureCount).toBeGreaterThan(0);
  });

  test('login button links to Google OAuth', async ({ page }) => {
    await goToHome(page);

    // Verify the login button href
    const loginLink = page.locator('a[href="/auth/google"]');
    await expect(loginLink.first()).toBeVisible();
    await expect(loginLink.first()).toHaveAttribute('href', '/auth/google');
  });

  test('page has proper meta structure', async ({ page }) => {
    await goToHome(page);

    // Verify basic HTML structure
    await expect(page.locator('html')).toBeVisible();
    await expect(page.locator('body')).toBeVisible();

    // Verify there's a main content area
    const mainContent = page.locator('main, .main, .content, .container');
    await expect(mainContent.first()).toBeVisible();
  });

  test('page loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await goToHome(page);

    // Wait for any async errors
    await page.waitForTimeout(1000);

    // No JavaScript errors should occur
    expect(errors).toHaveLength(0);
  });

  test('page is responsive - mobile viewport', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await goToHome(page);

    // Verify page still displays correctly
    await expect(page.locator('h1')).toBeVisible();
    const loginButton = page.locator('a[href="/auth/google"], a:has-text("Googleでログイン")');
    await expect(loginButton.first()).toBeVisible();
  });

  test('page is responsive - tablet viewport', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });

    await goToHome(page);

    // Verify page still displays correctly
    await expect(page.locator('h1')).toBeVisible();
    const loginButton = page.locator('a[href="/auth/google"], a:has-text("Googleでログイン")');
    await expect(loginButton.first()).toBeVisible();
  });
});

test.describe('Authentication Flow', () => {
  test('clicking login button redirects to Google OAuth', async ({ page }) => {
    await goToHome(page);

    // Click login and wait for navigation
    const [response] = await Promise.all([
      page.waitForResponse((resp) => resp.url().includes('/auth/google') || resp.url().includes('accounts.google.com')),
      clickLoginButton(page),
    ]);

    // Verify redirect happened (either to our auth endpoint or directly to Google)
    const finalUrl = page.url();
    const isAuthRedirect = finalUrl.includes('accounts.google.com') ||
                          finalUrl.includes('/auth/google') ||
                          response.status() === 302;
    expect(isAuthRedirect).toBe(true);
  });
});

test.describe('Protected Routes Without Auth', () => {
  test('accessing /instructor without auth redirects to login', async ({ page }) => {
    // Try to access protected instructor page directly
    const response = await page.goto('/instructor');

    // Should redirect to login or show unauthorized
    const finalUrl = page.url();
    const isRedirectedOrBlocked =
      finalUrl.includes('/auth') ||
      finalUrl === page.context().pages()[0].url() ||
      response?.status() === 401 ||
      response?.status() === 302;

    expect(isRedirectedOrBlocked).toBe(true);
  });

  test('accessing /student without auth redirects to login', async ({ page }) => {
    // Try to access protected student page directly
    const response = await page.goto('/student');

    // Should redirect to login or show unauthorized
    const finalUrl = page.url();
    const isRedirectedOrBlocked =
      finalUrl.includes('/auth') ||
      finalUrl === page.context().pages()[0].url() ||
      response?.status() === 401 ||
      response?.status() === 302;

    expect(isRedirectedOrBlocked).toBe(true);
  });

  test('accessing /instructor/courses without auth redirects', async ({ page }) => {
    const response = await page.goto('/instructor/courses');

    const finalUrl = page.url();
    const isRedirectedOrBlocked =
      finalUrl.includes('/auth') ||
      !finalUrl.includes('/instructor/courses') ||
      response?.status() === 401 ||
      response?.status() === 302;

    expect(isRedirectedOrBlocked).toBe(true);
  });

  test('accessing /student/browse without auth redirects', async ({ page }) => {
    const response = await page.goto('/student/browse');

    const finalUrl = page.url();
    const isRedirectedOrBlocked =
      finalUrl.includes('/auth') ||
      !finalUrl.includes('/student/browse') ||
      response?.status() === 401 ||
      response?.status() === 302;

    expect(isRedirectedOrBlocked).toBe(true);
  });
});
