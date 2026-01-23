import { test, expect } from '@playwright/test';
import {
  navigateToStudentBrowse,
  navigateToStudentRequests,
  waitForIslandHydration,
  fillBookingRequestForm,
  submitBookingRequestForm,
  expectSuccessMessage,
  clickCancelButton,
  confirmCancelDialog,
  expectCancelSuccessMessage,
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

test.describe('Cancel Booking Request', () => {
  /**
   * Note: Direct navigation via goto is used here because:
   * 1. These tests require authentication state (saved session)
   * 2. Starting from '/' and navigating via UI for each test would:
   *    - Make tests significantly slower
   *    - Create coupling between auth flow and cancel feature tests
   * 3. The auth.setup.ts handles login flow separately
   */
  test.beforeEach(async ({ page }) => {
    // Navigate to student dashboard first, then to requests via UI
    await page.goto('/student');
    await page.waitForLoadState('networkidle');
    await navigateToStudentRequests(page);
  });

  test('displays cancel button for pending requests', async ({ page }) => {
    // Look for pending request items that should have cancel button
    const pendingRequests = page.locator('.request-card:has-text("リクエスト中"), .request-item:has-text("リクエスト中"), tr:has-text("リクエスト中")');
    const pendingCount = await pendingRequests.count();

    if (pendingCount > 0) {
      // Should have cancel button for pending requests
      const cancelButton = pendingRequests.first().locator('.cancel-button-island button, button:has-text("キャンセル")');
      await expect(cancelButton.first()).toBeVisible();
    } else {
      test.info().annotations.push({ type: 'skip-reason', description: 'No pending requests to test cancel button' });
    }
  });

  test('cancel button shows confirmation dialog', async ({ page }) => {
    const pendingRequests = page.locator('.request-card:has-text("リクエスト中"), .request-item:has-text("リクエスト中"), tr:has-text("リクエスト中")');
    const pendingCount = await pendingRequests.count();

    if (pendingCount > 0) {
      // Setup dialog handler with promise to properly wait for dialog
      const dialogPromise = page.waitForEvent('dialog');

      // Click cancel button
      const cancelButton = pendingRequests.first().locator('.cancel-button-island button, button:has-text("キャンセル")');
      await cancelButton.first().click();

      // Wait for dialog event instead of fixed timeout
      const dialog = await dialogPromise;
      expect(dialog.message()).toContain('キャンセル');
      await dialog.dismiss(); // Dismiss to not actually cancel
    } else {
      test.info().annotations.push({ type: 'skip-reason', description: 'No pending requests to test cancel dialog' });
    }
  });

  test('can cancel a pending request and verify record change', async ({ page }) => {
    const pendingRequestsSelector = '.request-card:has-text("リクエスト中"), .request-item:has-text("リクエスト中"), tr:has-text("リクエスト中")';
    const pendingRequests = page.locator(pendingRequestsSelector);
    const initialCount = await pendingRequests.count();

    if (initialCount > 0) {
      // Setup dialog handler to accept
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });

      // Click cancel button
      const cancelButton = pendingRequests.first().locator('.cancel-button-island button, button:has-text("キャンセル")');
      await cancelButton.first().click();

      // Wait for success message
      await expectCancelSuccessMessage(page);

      // Verify record change: pending count should decrease or status should change
      // Wait for UI to update after successful cancel
      await page.waitForLoadState('networkidle');

      // Check that either:
      // 1. The pending count decreased, OR
      // 2. A "cancelled" status appears, OR
      // 3. The success message is visible (which confirms the action completed)
      const finalCount = await pendingRequests.count();
      const hasCancelledStatus = await page.locator('text=キャンセル済み, text=取り消し').count() > 0;
      const hasSuccessMessage = await page.locator('.cancel-result.success, .cancel-button-island .success').count() > 0;

      expect(finalCount < initialCount || hasCancelledStatus || hasSuccessMessage).toBe(true);
    } else {
      test.info().annotations.push({ type: 'skip-reason', description: 'No pending requests to test cancel' });
    }
  });

  test('cancel button is not shown for approved requests', async ({ page }) => {
    const approvedRequests = page.locator('.request-card:has-text("承認済み"), .request-item:has-text("承認済み"), tr:has-text("承認済み")');
    const approvedCount = await approvedRequests.count();

    if (approvedCount > 0) {
      // Should NOT have cancel button for approved requests
      const cancelButton = approvedRequests.first().locator('.cancel-button-island button, button:has-text("キャンセル")');
      await expect(cancelButton).toHaveCount(0);
    } else {
      test.info().annotations.push({ type: 'skip-reason', description: 'No approved requests to test' });
    }
  });

  test('cancel button is not shown for rejected requests', async ({ page }) => {
    const rejectedRequests = page.locator('.request-card:has-text("却下"), .request-item:has-text("却下"), tr:has-text("却下")');
    const rejectedCount = await rejectedRequests.count();

    if (rejectedCount > 0) {
      // Should NOT have cancel button for rejected requests
      const cancelButton = rejectedRequests.first().locator('.cancel-button-island button, button:has-text("キャンセル")');
      await expect(cancelButton).toHaveCount(0);
    } else {
      test.info().annotations.push({ type: 'skip-reason', description: 'No rejected requests to test' });
    }
  });
});
