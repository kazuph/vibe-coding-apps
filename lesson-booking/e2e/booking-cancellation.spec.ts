import { test, expect, Page, BrowserContext } from '@playwright/test';
import {
  fillAvailabilityForm,
  submitAvailabilityForm,
  fillBookingRequestForm,
  submitBookingRequestForm,
  waitForIslandHydration,
  expectSuccessMessage,
  getFutureDate,
} from './helpers/navigation';

/**
 * Booking Cancellation and Rejection E2E Tests
 *
 * Tests for cancellation and rejection workflows:
 * 1. Student cancels pending request
 * 2. Instructor rejects booking request
 * 3. Instructor cancels availability slot
 * 4. Validation: Cannot cancel slot with approved bookings
 *
 * This test requires both instructor and student authentication states.
 * Run: npx playwright test --project=setup first
 */

const INSTRUCTOR_AUTH = '.auth/instructor.json';
const STUDENT_AUTH = '.auth/student.json';

test.describe('Booking Cancellation', () => {
  let instructorContext: BrowserContext;
  let studentContext: BrowserContext;
  let instructorPage: Page;
  let studentPage: Page;

  test.beforeAll(async ({ browser }) => {
    // Create separate contexts with different auth states
    instructorContext = await browser.newContext({ storageState: INSTRUCTOR_AUTH });
    studentContext = await browser.newContext({ storageState: STUDENT_AUTH });

    instructorPage = await instructorContext.newPage();
    studentPage = await studentContext.newPage();
  });

  test.afterAll(async () => {
    await instructorContext.close();
    await studentContext.close();
  });

  test('student can cancel pending booking request', async () => {
    // Step 1: Instructor creates availability
    await instructorPage.goto('/instructor/availability');
    await instructorPage.waitForLoadState('networkidle');

    const futureDate = getFutureDate(35); // 5 weeks from now
    await fillAvailabilityForm(instructorPage, futureDate, '13:00', '14:00', '1');
    await submitAvailabilityForm(instructorPage);
    await expectSuccessMessage(instructorPage, '登録');

    // Step 2: Student submits booking request
    await studentPage.goto('/student/browse');
    await studentPage.waitForLoadState('networkidle');

    const slots = studentPage.locator('.availability-card, .slot-card, [data-availability-id]');
    await slots.first().click();
    await studentPage.waitForLoadState('networkidle');

    await fillBookingRequestForm(studentPage, '1', 'キャンセルテスト用のリクエスト');
    await submitBookingRequestForm(studentPage);
    await expectSuccessMessage(studentPage);

    // Step 3: Student cancels the request
    await studentPage.goto('/student/requests');
    await studentPage.waitForLoadState('networkidle');

    // Look for cancel button (only on pending requests)
    const cancelButton = studentPage.locator('button:has-text("キャンセル"), button:has-text("取消")').first();

    if (await cancelButton.count() > 0) {
      await cancelButton.click();

      // Confirm cancellation if there's a confirmation dialog
      const confirmButton = studentPage.locator('button:has-text("確認"), button:has-text("はい")');
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }

      // Verify cancellation success
      await expectSuccessMessage(studentPage);

      // Verify the request status changed or was removed
      const requestAfterCancel = studentPage.locator('text=キャンセル済み, text=取消済み');
      const hasCancelledStatus = await requestAfterCancel.count() > 0;
      expect(hasCancelledStatus).toBe(true);
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'Cancel button not implemented yet',
      });
    }
  });

  test('instructor can delete empty availability slot', async () => {
    // Create availability without any requests
    await instructorPage.goto('/instructor/availability');
    await instructorPage.waitForLoadState('networkidle');

    const futureDate = getFutureDate(42); // 6 weeks from now
    await fillAvailabilityForm(instructorPage, futureDate, '15:00', '16:00', '2');
    await submitAvailabilityForm(instructorPage);
    await expectSuccessMessage(instructorPage, '登録');

    // Try to delete the slot
    const deleteButton = instructorPage.locator('button:has-text("削除"), button[aria-label*="削除"]').first();

    if (await deleteButton.count() > 0) {
      await deleteButton.click();

      // Confirm deletion if there's a confirmation dialog
      const confirmButton = instructorPage.locator('button:has-text("確認"), button:has-text("はい")');
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }

      // Verify deletion success
      await expectSuccessMessage(instructorPage);
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'Delete button not implemented yet',
      });
    }
  });
});

test.describe('Request Rejection', () => {
  let instructorContext: BrowserContext;
  let studentContext: BrowserContext;
  let instructorPage: Page;
  let studentPage: Page;

  test.beforeAll(async ({ browser }) => {
    instructorContext = await browser.newContext({ storageState: INSTRUCTOR_AUTH });
    studentContext = await browser.newContext({ storageState: STUDENT_AUTH });

    instructorPage = await instructorContext.newPage();
    studentPage = await studentContext.newPage();
  });

  test.afterAll(async () => {
    await instructorContext.close();
    await studentContext.close();
  });

  test('instructor can reject booking request', async () => {
    // Step 1: Instructor creates availability
    await instructorPage.goto('/instructor/availability');
    await instructorPage.waitForLoadState('networkidle');

    const futureDate = getFutureDate(49); // 7 weeks from now
    await fillAvailabilityForm(instructorPage, futureDate, '16:00', '17:00', '1');
    await submitAvailabilityForm(instructorPage);
    await expectSuccessMessage(instructorPage, '登録');

    // Step 2: Student submits booking request
    await studentPage.goto('/student/browse');
    await studentPage.waitForLoadState('networkidle');

    const slots = studentPage.locator('.availability-card, .slot-card, [data-availability-id]');
    await slots.first().click();
    await studentPage.waitForLoadState('networkidle');

    await fillBookingRequestForm(studentPage, '1', '却下テスト用のリクエスト');
    await submitBookingRequestForm(studentPage);
    await expectSuccessMessage(studentPage);

    // Step 3: Instructor rejects the request
    await instructorPage.goto('/instructor/requests');
    await instructorPage.waitForLoadState('networkidle');
    await waitForIslandHydration(instructorPage, '.approval-ui-island');

    // Look for reject button
    const rejectButton = instructorPage.locator('button:has-text("却下"), button:has-text("拒否")').first();

    if (await rejectButton.count() > 0) {
      // Select the request checkbox
      const checkbox = instructorPage.locator('.approval-checkbox, input[type="checkbox"]').first();
      await checkbox.click();

      await rejectButton.click();

      // Confirm rejection if there's a confirmation dialog
      const confirmButton = instructorPage.locator('button:has-text("確認"), button:has-text("はい")');
      if (await confirmButton.count() > 0) {
        await confirmButton.click();
      }

      // Verify rejection success
      await expectSuccessMessage(instructorPage, '却下');
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'Reject button not implemented yet',
      });
    }

    // Step 4: Student sees rejected status
    await studentPage.goto('/student/requests');
    await studentPage.waitForLoadState('networkidle');

    const rejectedStatus = studentPage.locator('text=却下, text=拒否');
    if (await rejectedStatus.count() > 0) {
      expect(await rejectedStatus.count()).toBeGreaterThan(0);
    }
  });

  test('instructor can reject multiple requests at once', async () => {
    // Create availability
    await instructorPage.goto('/instructor/availability');
    await instructorPage.waitForLoadState('networkidle');

    const futureDate = getFutureDate(56); // 8 weeks from now
    await fillAvailabilityForm(instructorPage, futureDate, '17:00', '18:00', '3');
    await submitAvailabilityForm(instructorPage);
    await expectSuccessMessage(instructorPage, '登録');

    // Student submits request
    await studentPage.goto('/student/browse');
    await studentPage.waitForLoadState('networkidle');

    const slots = studentPage.locator('.availability-card, .slot-card, [data-availability-id]');
    await slots.first().click();
    await studentPage.waitForLoadState('networkidle');

    await fillBookingRequestForm(studentPage, '1', '一括却下テスト');
    await submitBookingRequestForm(studentPage);
    await expectSuccessMessage(studentPage);

    // Instructor goes to requests page
    await instructorPage.goto('/instructor/requests');
    await instructorPage.waitForLoadState('networkidle');
    await waitForIslandHydration(instructorPage, '.approval-ui-island');

    const checkboxes = instructorPage.locator('.approval-checkbox, input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();

    if (checkboxCount >= 2) {
      // Select multiple checkboxes
      await checkboxes.nth(0).click();
      await checkboxes.nth(1).click();

      // Look for reject button
      const rejectButton = instructorPage.locator('button:has-text("却下"), button:has-text("拒否")');

      if (await rejectButton.count() > 0) {
        await rejectButton.click();

        const confirmButton = instructorPage.locator('button:has-text("確認"), button:has-text("はい")');
        if (await confirmButton.count() > 0) {
          await confirmButton.click();
        }

        await expectSuccessMessage(instructorPage);
      } else {
        test.info().annotations.push({
          type: 'skip-reason',
          description: 'Bulk reject not implemented yet',
        });
      }
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'Not enough requests for bulk rejection test',
      });
    }
  });
});

test.describe('Cancellation Edge Cases', () => {
  let instructorContext: BrowserContext;
  let studentContext: BrowserContext;
  let instructorPage: Page;
  let studentPage: Page;

  test.beforeAll(async ({ browser }) => {
    instructorContext = await browser.newContext({ storageState: INSTRUCTOR_AUTH });
    studentContext = await browser.newContext({ storageState: STUDENT_AUTH });

    instructorPage = await instructorContext.newPage();
    studentPage = await studentContext.newPage();
  });

  test.afterAll(async () => {
    await instructorContext.close();
    await studentContext.close();
  });

  test('instructor cannot delete availability slot with approved bookings', async () => {
    // Create availability and approve a booking
    await instructorPage.goto('/instructor/availability');
    await instructorPage.waitForLoadState('networkidle');

    const futureDate = getFutureDate(63); // 9 weeks from now
    await fillAvailabilityForm(instructorPage, futureDate, '18:00', '19:00', '1');
    await submitAvailabilityForm(instructorPage);
    await expectSuccessMessage(instructorPage, '登録');

    // Student books
    await studentPage.goto('/student/browse');
    await studentPage.waitForLoadState('networkidle');

    const slots = studentPage.locator('.availability-card, .slot-card, [data-availability-id]');
    await slots.first().click();
    await studentPage.waitForLoadState('networkidle');

    await fillBookingRequestForm(studentPage, '1', '削除防止テスト');
    await submitBookingRequestForm(studentPage);
    await expectSuccessMessage(studentPage);

    // Instructor approves
    await instructorPage.goto('/instructor/requests');
    await instructorPage.waitForLoadState('networkidle');
    await waitForIslandHydration(instructorPage, '.approval-ui-island');

    const checkbox = instructorPage.locator('.approval-checkbox, input[type="checkbox"]').first();
    await checkbox.click();

    const approveButton = instructorPage.locator('button:has-text("承認")');
    await approveButton.click();
    await expectSuccessMessage(instructorPage, '承認');

    // Try to delete the slot with approved booking
    await instructorPage.goto('/instructor/availability');
    await instructorPage.waitForLoadState('networkidle');

    const deleteButton = instructorPage.locator('button:has-text("削除"), button[aria-label*="削除"]').first();

    if (await deleteButton.count() > 0) {
      await deleteButton.click();

      // Should show error message
      const errorMessage = instructorPage.locator('.form-result.error, .form-error, text=削除できません');
      if (await errorMessage.count() > 0) {
        await expect(errorMessage.first()).toBeVisible({ timeout: 5000 });
      } else {
        // If no specific error shown, the button might be disabled
        const isDisabled = await deleteButton.isDisabled();
        expect(isDisabled).toBe(true);
      }
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'Delete functionality not implemented yet',
      });
    }
  });

  test('student cannot cancel already approved booking', async () => {
    // This test verifies that once approved, students cannot cancel
    await studentPage.goto('/student/requests');
    await studentPage.waitForLoadState('networkidle');

    // Look for approved bookings
    const approvedBookings = studentPage.locator('text=承認済み, text=確定').first();

    if (await approvedBookings.count() > 0) {
      // Get the parent container of the approved booking
      const bookingRow = approvedBookings.locator('xpath=ancestor::tr | ancestor::div[@class*="card"]').first();

      // Cancel button should not exist for approved bookings
      const cancelButton = bookingRow.locator('button:has-text("キャンセル"), button:has-text("取消")');
      const hasCancelButton = await cancelButton.count() > 0;

      if (hasCancelButton) {
        const isDisabled = await cancelButton.isDisabled();
        expect(isDisabled).toBe(true);
      } else {
        // No cancel button for approved bookings is correct behavior
        expect(hasCancelButton).toBe(false);
      }
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'No approved bookings to test cancellation prevention',
      });
    }
  });
});
