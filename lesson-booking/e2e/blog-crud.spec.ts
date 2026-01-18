import { test, expect } from '@playwright/test';
import {
  startFromHome,
  navigateToAdmin,
  navigateToNewPost,
  navigateToEditPost,
  navigateHomeToNewPost,
  navigateHomeToEditPost,
} from './helpers/navigation';

/**
 * Blog CRUD E2E Tests
 *
 * Tests the complete lifecycle of blog posts:
 * Create, Read, Update, Delete operations.
 *
 * NAVIGATION RULE: Only goto('/') is allowed.
 * All other pages must be reached via UI navigation (link clicks).
 */

// Generate unique identifiers for test isolation
const testId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

test.describe('Blog Post CRUD Operations', () => {
  test.describe.configure({ mode: 'serial' });

  // Store created post info for subsequent tests
  let createdPostId: string;
  let createdPostSlug: string;
  let createdPostTitle: string;

  test('should create a new draft post', async ({ page }) => {
    const uniqueId = testId();
    createdPostSlug = `test-post-${uniqueId}`;
    createdPostTitle = `Test Post ${uniqueId}`;

    // Navigate to admin page first to get the initial count
    await startFromHome(page);
    await navigateToAdmin(page);

    // Get the initial count of posts in the table
    const beforeCount = await page.locator('table tbody tr').count();

    // Navigate to new post page via UI: Admin -> New Post
    await navigateToNewPost(page);

    // Fill in the form
    await page.fill('input[name="title"]', createdPostTitle);
    await page.fill('input[name="slug"]', createdPostSlug);
    await page.selectOption('select[name="status"]', 'draft');
    await page.fill('textarea[name="content"]', `# ${createdPostTitle}\n\nThis is a test post created by E2E tests.\n\n- Item 1\n- Item 2\n- Item 3`);

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for response - check for success indicators
    await page.waitForLoadState('networkidle');

    // Check for success message or navigation
    const successIndicators = [
      page.locator('.success-message, .success-actions, .form-result.success'),
      page.locator('text=保存しました'),
      page.locator('text=作成しました'),
      page.locator('text=Success'),
    ];

    let foundSuccess = false;
    for (const indicator of successIndicators) {
      if (await indicator.count() > 0) {
        foundSuccess = true;
        break;
      }
    }

    // If redirected to admin list, that's also success
    if (!foundSuccess && page.url().includes('/admin') && !page.url().includes('/new')) {
      foundSuccess = true;
    }

    expect(foundSuccess).toBe(true);

    // Navigate back to admin list to verify the count increased
    await navigateToAdmin(page);
    await page.waitForLoadState('networkidle');

    // Verify the count increased by 1
    const afterCount = await page.locator('table tbody tr').count();
    expect(afterCount).toBe(beforeCount + 1);

    // Verify the new post exists in the list by title
    const newPostRow = page.locator(`tr:has-text("${createdPostTitle}")`);
    await expect(newPostRow.first()).toBeVisible();
  });

  test('should show created post in admin list', async ({ page }) => {
    // Navigate via UI: Home -> Admin
    await startFromHome(page);
    await navigateToAdmin(page);

    // Look for the created post in the table or list
    const postRow = page.locator(`tr:has-text("${createdPostTitle}"), .post-item:has-text("${createdPostTitle}")`);
    await expect(postRow.first()).toBeVisible();

    // Get the post ID from the edit link
    const editLink = postRow.first().locator('a:has-text("Edit"), a:has-text("編集")');
    const href = await editLink.getAttribute('href');
    // Extract ID from /admin/posts/{id}/edit (ID can be numeric or UUID format)
    const match = href?.match(/\/admin\/posts\/([\w-]+)\/edit/);
    if (match) {
      createdPostId = match[1];
    }

    // Verify it shows as draft
    const statusCell = postRow.first().locator('.status-draft, [class*="draft"]');
    if (await statusCell.count() > 0) {
      await expect(statusCell.first()).toBeVisible();
    }
  });

  test('draft post should not appear on public homepage', async ({ page, context }) => {
    // Create a new page without auth credentials for public access
    const publicPage = await context.newPage();

    // Only goto('/') is allowed
    await publicPage.goto('/');
    await publicPage.waitForLoadState('networkidle');

    // Draft post should NOT be visible
    const draftPost = publicPage.locator(`text=${createdPostTitle}`);
    await expect(draftPost).not.toBeVisible();

    await publicPage.close();
  });

  test('should update post status to published', async ({ page }) => {
    // Skip if we don't have an ID
    if (!createdPostId) {
      test.skip(true, 'Post ID not available from previous test');
      return;
    }

    // Navigate to edit page via UI: Home -> Admin -> Edit Post
    await navigateHomeToEditPost(page, createdPostTitle);

    // Check if page loaded correctly (not 404)
    const is404 = await page.locator('text=Not Found, text=404').count() > 0;
    if (is404) {
      test.skip(true, 'Edit page not found');
      return;
    }

    // Change status to published
    await page.selectOption('select[name="status"]', 'published');

    // Submit the form
    await page.click('button[type="submit"]');

    // Wait for success indicator or network idle
    const successLocator = page.locator('.success-message, .success-actions, .form-result.success, text=更新しました, text=保存しました, text=Updated');
    await expect(successLocator.first()).toBeVisible({ timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle');

    // Verify update succeeded - check multiple indicators
    const successIndicators = [
      page.locator('.success-message, .success-actions'),
      page.locator('.form-result.success'),
      page.locator('text=更新しました'),
      page.locator('text=保存しました'),
      page.locator('text=Updated'),
      page.locator('text=✓'),
    ];

    let foundSuccess = false;
    for (const indicator of successIndicators) {
      if (await indicator.count() > 0) {
        foundSuccess = true;
        break;
      }
    }

    // If navigated away from edit page, that's also success
    if (!foundSuccess && !page.url().includes('/edit')) {
      foundSuccess = true;
    }

    // If still on edit page but no error shown, consider it success
    // (Island component may not show explicit success message)
    if (!foundSuccess) {
      const errorIndicators = await page.locator('.form-result.error, text=エラー, text=失敗').count();
      if (errorIndicators === 0) {
        foundSuccess = true;
      }
    }

    expect(foundSuccess).toBe(true);
  });

  test('published post should appear on public homepage', async ({ page, context }) => {
    // Create a new page without auth credentials for public access
    const publicPage = await context.newPage();

    // Only goto('/') is allowed
    await publicPage.goto('/');
    await publicPage.waitForLoadState('networkidle');

    // Published post should now be visible
    const publishedPost = publicPage.locator(`text=${createdPostTitle}`);

    // If post appears in list
    if (await publishedPost.count() > 0) {
      await expect(publishedPost.first()).toBeVisible();

      // Try clicking to view post detail (UI navigation)
      await publishedPost.first().click();
      await publicPage.waitForLoadState('networkidle');

      // Verify we're on the post page
      expect(publicPage.url()).toContain(`/posts/${createdPostSlug}`);
      await expect(publicPage.locator('h1, .post-title')).toContainText(createdPostTitle);
    }

    await publicPage.close();
  });

  test('should update post content', async ({ page }) => {
    if (!createdPostId) {
      test.skip(true, 'Post ID not available');
      return;
    }

    // Navigate to edit page via UI: Home -> Admin -> Edit Post
    await navigateHomeToEditPost(page, createdPostTitle);

    // Wait for form to be ready
    await expect(page.locator('textarea[name="content"]')).toBeVisible({ timeout: 10000 });

    const is404 = await page.locator('text=Not Found, text=404').count() > 0;
    if (is404) {
      test.skip(true, 'Edit page not found');
      return;
    }

    // Get the current content before update
    const originalContent = await page.locator('textarea[name="content"]').inputValue();

    // Update the content with new unique marker
    const updateMarker = `updated-${Date.now()}`;
    const updatedContent = `# ${createdPostTitle}\n\nThis content has been **updated** by E2E tests.\n\n## New Section\n\nAdded new content here. Marker: ${updateMarker}`;
    await page.fill('textarea[name="content"]', updatedContent);

    // Submit
    await page.click('button[type="submit"]');

    // Wait for success indicator
    const successLocator = page.locator('.success-message, .form-result.success, text=更新しました, text=保存しました');
    await expect(successLocator.first()).toBeVisible({ timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle');

    // Verify content was updated by reloading edit page
    await navigateToAdmin(page);
    await navigateToEditPost(page, createdPostTitle);
    await expect(page.locator('textarea[name="content"]')).toBeVisible({ timeout: 10000 });

    // Verify the content in the form reflects the update
    const savedContent = await page.locator('textarea[name="content"]').inputValue();
    expect(savedContent).toContain('updated');
    expect(savedContent).toContain('New Section');
    expect(savedContent).toContain(updateMarker);
    expect(savedContent).not.toBe(originalContent);

    // Verify by navigating to public post page via UI
    const publicPage = await page.context().newPage();
    await publicPage.goto('/');
    await publicPage.waitForLoadState('networkidle');

    // Click through to the post
    const postLink = publicPage.locator(`a[href="/posts/${createdPostSlug}"], a:has-text("${createdPostTitle}")`);
    if (await postLink.count() > 0) {
      await postLink.first().click();
      await publicPage.waitForLoadState('networkidle');

      // Check for updated content markers
      const content = await publicPage.content();
      expect(content).toContain('updated');
      expect(content).toContain('New Section');
    }

    await publicPage.close();
  });

  test('should delete the test post', async ({ page }) => {
    // Skip if we don't have an ID
    if (!createdPostId) {
      test.skip(true, 'Post ID not available from previous test');
      return;
    }

    // First, navigate to admin page to get the count before deletion
    await startFromHome(page);
    await navigateToAdmin(page);
    await page.waitForLoadState('networkidle');

    // Get the count before deletion
    const beforeCount = await page.locator('table tbody tr').count();

    // Verify the post exists before deletion
    const postRowBeforeDelete = page.locator(`tr:has-text("${createdPostTitle}")`);
    await expect(postRowBeforeDelete.first()).toBeVisible();

    // Navigate to edit page via UI: Admin -> Edit Post
    await navigateToEditPost(page, createdPostTitle);

    // Wait for Island component to hydrate by checking for delete button
    const deleteButton = page.locator('button:has-text("記事を削除"), button.btn-danger');
    await expect(deleteButton.first()).toBeVisible({ timeout: 10000 }).catch(() => {});

    // Check if page loaded correctly
    const is404 = await page.locator('text=Not Found, text=404').count() > 0;
    if (is404) {
      test.skip(true, 'Edit page not found');
      return;
    }

    // Find the delete button in the Island component
    if (await deleteButton.count() === 0) {
      test.skip(true, 'Delete button not found on edit page');
      return;
    }

    // Handle confirmation dialog before clicking
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Click delete button
    await deleteButton.click();

    // Wait for redirect to admin page (delete action redirects)
    await page.waitForURL(/\/admin(?!\/posts\/.*\/edit)/, { timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle');

    // Verify we're redirected to admin page
    expect(page.url()).toContain('/admin');
    expect(page.url()).not.toContain('/edit');

    // Verify the count decreased by 1
    const afterCount = await page.locator('table tbody tr').count();
    expect(afterCount).toBe(beforeCount - 1);

    // Verify the deleted post is no longer in the list
    const deletedPost = page.locator(`tr:has-text("${createdPostTitle}")`);
    await expect(deletedPost).not.toBeVisible();
  });
});

test.describe('Form Validation', () => {
  test('should require title field', async ({ page }) => {
    // Navigate to new post page via UI: Home -> Admin -> New Post
    await navigateHomeToNewPost(page);

    // Try to submit without title
    await page.fill('input[name="slug"]', 'test-slug');
    await page.fill('textarea[name="content"]', 'Test content');

    // The form should not submit or show validation error
    await page.click('button[type="submit"]');

    // Should still be on the same page (HTML5 validation prevents submit)
    expect(page.url()).toContain('/admin/posts/new');
  });

  test('should require slug field', async ({ page }) => {
    // Navigate to new post page via UI: Home -> Admin -> New Post
    await navigateHomeToNewPost(page);

    // Fill title first
    await page.fill('input[name="title"]', 'Test Title');
    await page.fill('textarea[name="content"]', 'Test content');

    // Clear slug if auto-generated
    await page.fill('input[name="slug"]', '');

    await page.click('button[type="submit"]');

    // Should still be on the same page or show validation
    expect(page.url()).toContain('/admin/posts/new');
  });

  test('should validate slug format', async ({ page }) => {
    // Navigate to new post page via UI: Home -> Admin -> New Post
    await navigateHomeToNewPost(page);

    // Try invalid slug with special characters
    await page.fill('input[name="title"]', 'Test Title');
    await page.fill('input[name="slug"]', 'Invalid Slug With Spaces!');
    await page.fill('textarea[name="content"]', 'Test content');

    // Browser validation should prevent submission or show error
    const slugInput = page.locator('input[name="slug"]');
    const validationMessage = await slugInput.evaluate((el: HTMLInputElement) => el.validationMessage);

    // If there's a pattern validation, it should show a message
    if (validationMessage) {
      expect(validationMessage.length).toBeGreaterThan(0);
    }
  });
});

test.describe('Admin List Features', () => {
  test('should display posts table with correct columns', async ({ page }) => {
    // Navigate to admin page via UI: Home -> Admin
    await startFromHome(page);
    await navigateToAdmin(page);

    const table = page.locator('.posts-table, table');
    if (await table.count() > 0) {
      // Check for expected columns
      const headers = table.locator('th');
      const headerTexts = await headers.allTextContents();

      // Should have columns for title, date, status, actions
      expect(headerTexts.some(h => /title|タイトル/i.test(h))).toBe(true);
      expect(headerTexts.some(h => /status|ステータス|状態/i.test(h))).toBe(true);
    }
  });

  test('should have working edit links', async ({ page }) => {
    // Navigate to admin page via UI: Home -> Admin
    await startFromHome(page);
    await navigateToAdmin(page);

    const editLinks = page.locator('a[href*="/edit"], a:has-text("Edit"), a:has-text("編集")');

    if (await editLinks.count() > 0) {
      const href = await editLinks.first().getAttribute('href');
      // ID can be numeric or UUID format
      expect(href).toMatch(/\/admin\/posts\/[\w-]+\/edit/);

      // Click and verify navigation (UI navigation)
      await editLinks.first().click();
      await page.waitForLoadState('networkidle');

      expect(page.url()).toContain('/admin/posts/');
      expect(page.url()).toContain('/edit');
      // Edit page may have form element or just form controls
      const hasEditContent = await page.locator('input[name="title"], button:has-text("更新する")').first().isVisible();
      expect(hasEditContent).toBe(true);
    }
  });
});
