import { test, expect } from '@playwright/test';
import {
  navigateToStudentBrowse,
  navigateToStudentRequests,
  waitForIslandHydration,
  fillBookingRequestForm,
  submitBookingRequestForm,
  expectSuccessMessage,
} from './helpers/navigation';

/**
 * Student Dashboard E2E Tests
 *
 * These tests require authentication state saved by auth.setup.ts
 * Run: npx playwright test --project=setup first, then --project=student
 */

test.describe('Student Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student');
    await page.waitForLoadState('networkidle');
  });

  test('displays student dashboard', async ({ page }) => {
    // Verify dashboard heading
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toContainText('生徒');

    // Verify navigation links are present
    await expect(page.locator('a[href="/student/browse"]')).toBeVisible();
    await expect(page.locator('a[href="/student/requests"]')).toBeVisible();
  });

  test('can navigate to browse page', async ({ page }) => {
    await navigateToStudentBrowse(page);

    // Verify we're on browse page
    expect(page.url()).toContain('/student/browse');
    await expect(page.locator('h1, h2')).toContainText(/検索|空き時間/);
  });

  test('can navigate to requests page', async ({ page }) => {
    await navigateToStudentRequests(page);

    // Verify we're on requests page
    expect(page.url()).toContain('/student/requests');
    await expect(page.locator('h1, h2')).toContainText(/リクエスト|予約/);
  });
});

test.describe('Browse Available Slots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student/browse');
    await page.waitForLoadState('networkidle');
  });

  test('displays browse page', async ({ page }) => {
    // Verify page heading
    await expect(page.locator('h1, h2')).toContainText(/検索|空き時間/);
  });

  test('shows available instructors or empty message', async ({ page }) => {
    // Look for instructor list or empty state
    const hasInstructors = await page.locator('.instructor-card, .availability-card, .slot-card').count() > 0;
    const hasEmptyMessage = await page.locator('text=空き時間はありません').count() > 0;

    // Either there are available slots, or there's an empty state message
    expect(hasInstructors || hasEmptyMessage).toBe(true);
  });
});

test.describe('Booking Request Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student/browse');
    await page.waitForLoadState('networkidle');
  });

  test('can view booking form when slot is available', async ({ page }) => {
    // Look for an available slot to click
    const slotCard = page.locator('.availability-card, .slot-card, [data-availability-id]');
    const slotCount = await slotCard.count();

    if (slotCount > 0) {
      // Click the first available slot
      await slotCard.first().click();
      await page.waitForLoadState('networkidle');

      // Should show booking form
      await waitForIslandHydration(page, '.booking-form-island');

      // Verify form elements
      await expect(page.locator('select[name="preference_order"]')).toBeVisible();
      await expect(page.locator('textarea[name="message"]')).toBeVisible();
      await expect(page.locator('.booking-form-island button[type="submit"]')).toBeVisible();
    } else {
      // No slots available - skip test with annotation
      test.info().annotations.push({ type: 'skip-reason', description: 'No available slots to test' });
    }
  });

  test('can fill booking request form', async ({ page }) => {
    const slotCard = page.locator('.availability-card, .slot-card, [data-availability-id]');
    const slotCount = await slotCard.count();

    if (slotCount > 0) {
      await slotCard.first().click();
      await page.waitForLoadState('networkidle');

      await fillBookingRequestForm(page, '1', 'E2Eテストからのメッセージ');

      // Verify values are filled
      await expect(page.locator('select[name="preference_order"]')).toHaveValue('1');
      await expect(page.locator('textarea[name="message"]')).toHaveValue('E2Eテストからのメッセージ');
    } else {
      test.info().annotations.push({ type: 'skip-reason', description: 'No available slots to test' });
    }
  });

  test('can submit booking request', async ({ page }) => {
    const slotCard = page.locator('.availability-card, .slot-card, [data-availability-id]');
    const slotCount = await slotCard.count();

    if (slotCount > 0) {
      await slotCard.first().click();
      await page.waitForLoadState('networkidle');

      await fillBookingRequestForm(page, '1', 'E2Eテストリクエスト');
      await submitBookingRequestForm(page);

      // Wait for success message
      await expectSuccessMessage(page);
    } else {
      test.info().annotations.push({ type: 'skip-reason', description: 'No available slots to test' });
    }
  });
});

test.describe('My Requests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/student/requests');
    await page.waitForLoadState('networkidle');
  });

  test('displays requests page', async ({ page }) => {
    // Verify page heading
    await expect(page.locator('h1, h2')).toContainText(/リクエスト|予約/);
  });

  test('shows request list or empty message', async ({ page }) => {
    // Look for request items or empty state
    const hasRequests = await page.locator('.request-card, .request-item, tr').count() > 0;
    const hasEmptyMessage = await page.locator('text=リクエストはありません').count() > 0;

    // Either there are requests, or there's an empty state message
    expect(hasRequests || hasEmptyMessage).toBe(true);
  });

  test('displays request status correctly', async ({ page }) => {
    const requestItems = page.locator('.request-card, .request-item');
    const itemCount = await requestItems.count();

    if (itemCount > 0) {
      // Verify each item shows status
      for (let i = 0; i < Math.min(itemCount, 3); i++) {
        const item = requestItems.nth(i);
        const hasStatus = await item.locator('text=リクエスト中, text=承認済み, text=却下').count() > 0;
        expect(hasStatus).toBe(true);
      }
    } else {
      test.info().annotations.push({ type: 'skip-reason', description: 'No requests to check status' });
    }
  });
});
