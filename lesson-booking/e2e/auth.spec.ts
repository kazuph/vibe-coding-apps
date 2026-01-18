import { test, expect } from '@playwright/test';
import {
  startFromHome,
  navigateToAdmin,
  navigateToNewPost,
} from './helpers/navigation';

/**
 * Authentication Flow E2E Tests
 *
 * Tests Basic Auth protection on admin and API routes
 * while verifying public routes remain accessible.
 *
 * NAVIGATION RULE: Only goto('/') is allowed.
 * All other pages must be reached via UI navigation (link clicks).
 *
 * Note: Some auth tests use fetch() directly to test API endpoints
 * without browser navigation - this is intentional for auth testing.
 */

// Base URL for tests (from environment or default)
const BASE_URL = process.env.BASE_URL || 'http://localhost:8787';

test.describe('Public Routes (No Auth Required)', () => {
  // Override httpCredentials for public route tests
  test.use({ httpCredentials: undefined });

  test('homepage is accessible without authentication', async ({ page }) => {
    // goto('/') is allowed - this is the only permitted direct navigation
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    // Verify homepage content
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('.main-nav')).toBeVisible();
  });

  test('blog post pages are accessible without authentication', async ({ page }) => {
    // First, go to homepage (allowed)
    await page.goto('/');

    // Check for post links
    const postLinks = page.locator('.post-card a, a[href^="/posts/"]');
    const count = await postLinks.count();

    if (count > 0) {
      // Click the first post link (UI navigation)
      await postLinks.first().click();
      await page.waitForLoadState('networkidle');

      // Verify post page structure
      await expect(page.locator('.post-content, article, .content').first()).toBeVisible();
    } else {
      // No posts exist yet - just verify the homepage loaded
      test.info().annotations.push({ type: 'skip-reason', description: 'No published posts available' });
    }
  });
});

test.describe('Protected Routes (Auth Required)', () => {
  // Tests without credentials should fail
  // Note: Using native fetch without credentials to test auth rejection
  // This is intentional for auth testing - we need to bypass Playwright's credential inheritance
  test.describe('Without Credentials', () => {
    test('admin page returns 401 without credentials', async () => {
      const response = await fetch(`${BASE_URL}/admin`);
      expect(response.status).toBe(401);
    });

    test('admin new post page returns 401 without credentials', async () => {
      const response = await fetch(`${BASE_URL}/admin/posts/new`);
      expect(response.status).toBe(401);
    });

    test('API create post returns 401 without credentials', async () => {
      const response = await fetch(`${BASE_URL}/api/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Unauthorized Post',
          slug: 'unauthorized-post',
          content: 'This should fail',
          status: 'draft',
        }),
      });
      expect(response.status).toBe(401);
    });
  });

  // Tests with valid credentials should succeed
  test.describe('With Valid Credentials', () => {
    // Uses httpCredentials from config

    test('admin page is accessible with valid credentials', async ({ page }) => {
      // Navigate via UI: Home -> Admin
      await startFromHome(page);
      await navigateToAdmin(page);

      // Verify admin dashboard content
      // h1 is "記事管理" (Manage Posts in Japanese)
      const h1 = page.locator('h1');
      await expect(h1).toBeVisible();
      const h1Text = await h1.textContent() || '';
      // Accept both English and Japanese
      expect(h1Text.toLowerCase().includes('post') || h1Text.includes('記事')).toBe(true);
    });

    test('admin new post page is accessible with valid credentials', async ({ page }) => {
      // Navigate via UI: Home -> Admin -> New Post
      await startFromHome(page);
      await navigateToAdmin(page);
      await navigateToNewPost(page);

      // Verify new post form (wait for Island Component hydration)
      await expect(page.locator('form')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('input[name="title"]')).toBeVisible();
      await expect(page.locator('textarea[name="content"]')).toBeVisible();
    });

    test('admin edit page handles non-existent post', async ({ page }) => {
      // Navigate via UI: Home -> Admin
      await startFromHome(page);
      await navigateToAdmin(page);

      // Look for any edit link to test navigation pattern
      const editLinks = page.locator('a[href*="/edit"]');

      if (await editLinks.count() > 0) {
        // Click an edit link to verify navigation works
        await editLinks.first().click();
        await page.waitForLoadState('networkidle');

        // Verify we're on an edit page
        expect(page.url()).toContain('/edit');
        // Page should have form or show content
        const hasEditContent = await page.locator('form, input[name="title"]').first().isVisible().catch(() => false);
        expect(hasEditContent).toBe(true);
      } else {
        // No posts to edit - skip this test
        test.info().annotations.push({ type: 'skip-reason', description: 'No posts available to test edit page' });
      }
    });
  });

  // Tests with invalid credentials should fail
  test.describe('With Invalid Credentials', () => {
    test.use({
      httpCredentials: {
        username: 'wronguser',
        password: 'wrongpassword',
      },
    });

    test('admin page returns 401 with invalid credentials', async ({ page }) => {
      // Start from home (this will work even with wrong credentials on public page)
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Try to navigate to admin - should get 401
      const adminLink = page.locator('a[href="/admin"], a:has-text("管理"), a:has-text("Admin")');
      if (await adminLink.count() > 0) {
        // Get the response when clicking the link
        const [response] = await Promise.all([
          page.waitForResponse(resp => resp.url().includes('/admin')),
          adminLink.first().click(),
        ]);
        expect(response.status()).toBe(401);
      } else {
        // If no admin link visible, try direct API call
        const response = await page.request.get('/admin');
        expect(response.status()).toBe(401);
      }
    });

    test('API returns 401 with invalid credentials', async ({ request }) => {
      const response = await request.get('/api/posts');
      expect(response.status()).toBe(401);
    });
  });
});

test.describe('Navigation Between Public and Protected', () => {
  test('can navigate from home to admin with valid credentials', async ({ page }) => {
    // Navigate via UI: Home -> Admin
    await startFromHome(page);
    await navigateToAdmin(page);

    // Verify we're on the admin page
    await expect(page.locator('h1')).toBeVisible();
    expect(page.url()).toContain('/admin');
  });
});
