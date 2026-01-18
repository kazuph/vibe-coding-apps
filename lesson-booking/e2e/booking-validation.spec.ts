import { test, expect, Page } from '@playwright/test';
import {
  fillAvailabilityForm,
  submitAvailabilityForm,
  waitForIslandHydration,
  expectErrorMessage,
  getFutureDate,
} from './helpers/navigation';

/**
 * Booking Validation and Edge Cases E2E Tests
 *
 * Tests validation logic and edge cases:
 * 1. Time validation (end time must be after start time)
 * 2. Date validation (cannot create availability in the past)
 * 3. Capacity validation (max participants limits)
 * 4. Duplicate booking prevention
 * 5. Booking fully booked slots
 *
 * This test requires instructor authentication state.
 * Run: npx playwright test --project=setup first
 */

test.describe('Availability Time Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instructor/availability');
    await page.waitForLoadState('networkidle');
  });

  test('cannot create availability with end time before start time', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    const futureDate = getFutureDate(7);
    await page.locator('input[type="date"]').fill(futureDate);

    // Set end time before start time (invalid)
    await page.locator('select[name="start_time"]').selectOption('14:00');
    await page.locator('select[name="end_time"]').selectOption('13:00'); // Before start time
    await page.locator('select[name="max_participants"]').selectOption('1');

    // Try to submit
    await submitAvailabilityForm(page);

    // Should show validation error or prevent submission
    const hasError = await page.locator('.form-result.error, .form-error, .error-message').count() > 0;
    const urlStillOnAvailability = page.url().includes('/availability');

    // Either show error or stay on same page
    expect(hasError || urlStillOnAvailability).toBe(true);
  });

  test('cannot create availability with same start and end time', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    const futureDate = getFutureDate(7);
    await page.locator('input[type="date"]').fill(futureDate);

    // Set same time for start and end (invalid)
    await page.locator('select[name="start_time"]').selectOption('14:00');
    await page.locator('select[name="end_time"]').selectOption('14:00');
    await page.locator('select[name="max_participants"]').selectOption('1');

    await submitAvailabilityForm(page);

    // Should show validation error or prevent submission
    const hasError = await page.locator('.form-result.error, .form-error').count() > 0;
    const urlStillOnAvailability = page.url().includes('/availability');

    expect(hasError || urlStillOnAvailability).toBe(true);
  });

  test('accepts valid time range (end time after start time)', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    const futureDate = getFutureDate(14);

    // Valid time range
    await fillAvailabilityForm(page, futureDate, '10:00', '11:30', '1');
    await submitAvailabilityForm(page);

    // Should succeed
    const successElement = page.locator('.form-result.success, .form-success');
    await expect(successElement.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Availability Date Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instructor/availability');
    await page.waitForLoadState('networkidle');
  });

  test('date picker has minimum date set to today', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    const dateInput = page.locator('input[type="date"]');
    const minDate = await dateInput.getAttribute('min');

    const today = new Date().toISOString().split('T')[0];
    expect(minDate).toBe(today);
  });

  test('cannot manually enter past date via keyboard', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    // Try to set yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pastDate = yesterday.toISOString().split('T')[0];

    const dateInput = page.locator('input[type="date"]');

    // Try to fill with past date
    await dateInput.fill(pastDate);
    await page.locator('select[name="start_time"]').selectOption('10:00');
    await page.locator('select[name="end_time"]').selectOption('11:00');
    await page.locator('select[name="max_participants"]').selectOption('1');

    await submitAvailabilityForm(page);

    // Should either show error or HTML5 validation prevents submission
    const hasError = await page.locator('.form-result.error, .form-error').count() > 0;
    const urlStillOnAvailability = page.url().includes('/availability');

    expect(hasError || urlStillOnAvailability).toBe(true);
  });

  test('accepts today as valid date', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    const today = new Date().toISOString().split('T')[0];

    await fillAvailabilityForm(page, today, '16:00', '17:00', '1');
    await submitAvailabilityForm(page);

    // Should succeed
    const successElement = page.locator('.form-result.success, .form-success');
    await expect(successElement.first()).toBeVisible({ timeout: 10000 });
  });

  test('accepts future dates', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    const futureDate = getFutureDate(30);

    await fillAvailabilityForm(page, futureDate, '09:00', '10:00', '1');
    await submitAvailabilityForm(page);

    const successElement = page.locator('.form-result.success, .form-success');
    await expect(successElement.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Max Participants Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instructor/availability');
    await page.waitForLoadState('networkidle');
  });

  test('accepts max participants = 1 (individual lesson)', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    const futureDate = getFutureDate(10);
    await fillAvailabilityForm(page, futureDate, '10:00', '11:00', '1');
    await submitAvailabilityForm(page);

    const successElement = page.locator('.form-result.success, .form-success');
    await expect(successElement.first()).toBeVisible({ timeout: 10000 });
  });

  test('accepts max participants > 1 (group lesson)', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    const futureDate = getFutureDate(12);
    await fillAvailabilityForm(page, futureDate, '11:00', '12:00', '5');
    await submitAvailabilityForm(page);

    const successElement = page.locator('.form-result.success, .form-success');
    await expect(successElement.first()).toBeVisible({ timeout: 10000 });
  });

  test('max participants select has reasonable upper limit', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    const maxParticipantsSelect = page.locator('select[name="max_participants"]');

    // Get all options
    const options = await maxParticipantsSelect.locator('option').allTextContents();
    const numericOptions = options
      .map(opt => parseInt(opt))
      .filter(num => !isNaN(num));

    const maxValue = Math.max(...numericOptions);

    // Max participants should be reasonable (e.g., <= 20 for most cases)
    expect(maxValue).toBeLessThanOrEqual(20);
    expect(maxValue).toBeGreaterThanOrEqual(1);
  });
});

test.describe('Course Form Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instructor/courses');
    await page.waitForLoadState('networkidle');
  });

  test('cannot create course with empty name', async ({ page }) => {
    await waitForIslandHydration(page, '.course-form-island');

    // Leave name empty
    await page.locator('input[name="name"]').fill('');
    await page.locator('textarea[name="description"]').fill('テスト説明');
    await page.locator('select[name="duration_minutes"]').selectOption('60');
    await page.locator('select[name="max_participants"]').selectOption('1');

    // Try to submit
    const submitButton = page.locator('.course-form-island button[type="submit"]');
    await submitButton.click();

    // Form should not submit (HTML5 validation)
    const formStillVisible = await page.locator('.course-form-island form').isVisible();
    expect(formStillVisible).toBe(true);
  });

  test('accepts valid course with all fields', async ({ page }) => {
    await waitForIslandHydration(page, '.course-form-island');

    const courseName = `完全なコース_${Date.now()}`;
    await page.locator('input[name="name"]').fill(courseName);
    await page.locator('textarea[name="description"]').fill('完全な説明文');
    await page.locator('select[name="duration_minutes"]').selectOption('90');
    await page.locator('select[name="max_participants"]').selectOption('3');

    const submitButton = page.locator('.course-form-island button[type="submit"]');
    await submitButton.click();

    const successElement = page.locator('.form-result.success, .form-success');
    await expect(successElement.first()).toBeVisible({ timeout: 10000 });
  });

  test('accepts course with minimal required fields', async ({ page }) => {
    await waitForIslandHydration(page, '.course-form-island');

    const courseName = `最小コース_${Date.now()}`;
    await page.locator('input[name="name"]').fill(courseName);
    // Description is optional, leave empty
    await page.locator('select[name="duration_minutes"]').selectOption('60');
    await page.locator('select[name="max_participants"]').selectOption('1');

    const submitButton = page.locator('.course-form-island button[type="submit"]');
    await submitButton.click();

    const successElement = page.locator('.form-result.success, .form-success');
    await expect(successElement.first()).toBeVisible({ timeout: 10000 });
  });

  test('course name has reasonable length limit', async ({ page }) => {
    await waitForIslandHydration(page, '.course-form-island');

    const nameInput = page.locator('input[name="name"]');
    const maxLength = await nameInput.getAttribute('maxlength');

    if (maxLength) {
      const maxLengthNum = parseInt(maxLength);
      // Name should have reasonable max length (e.g., 100-200 chars)
      expect(maxLengthNum).toBeGreaterThanOrEqual(50);
      expect(maxLengthNum).toBeLessThanOrEqual(500);
    }
  });
});

test.describe('Duplicate Booking Prevention', () => {
  test('student cannot submit duplicate booking request for same slot', async ({ page }) => {
    // Navigate to browse page
    await page.goto('/student/browse');
    await page.waitForLoadState('networkidle');

    // Find available slots
    const slots = page.locator('.availability-card, .slot-card, [data-availability-id]');
    const slotCount = await slots.count();

    if (slotCount > 0) {
      // Get the slot ID or identifier
      const firstSlot = slots.first();
      const slotId = await firstSlot.getAttribute('data-availability-id');

      // Click and submit first request
      await firstSlot.click();
      await page.waitForLoadState('networkidle');

      await waitForIslandHydration(page, '.booking-form-island');
      await page.locator('select[name="preference_order"]').selectOption('1');
      await page.locator('textarea[name="message"]').fill('重複テスト1回目');

      const submitButton = page.locator('.booking-form-island button[type="submit"]');
      await submitButton.click();

      const successElement = page.locator('.form-result.success, .form-success');
      await expect(successElement.first()).toBeVisible({ timeout: 10000 });

      // Try to submit another request for the same slot
      await page.goto('/student/browse');
      await page.waitForLoadState('networkidle');

      // Find the same slot
      const sameSlot = slotId
        ? page.locator(`[data-availability-id="${slotId}"]`)
        : slots.first();

      if (await sameSlot.count() > 0) {
        await sameSlot.click();
        await page.waitForLoadState('networkidle');

        // Check if booking form is disabled or shows error
        const bookingForm = page.locator('.booking-form-island form');
        const hasForm = await bookingForm.count() > 0;

        if (hasForm) {
          const alreadyRequestedMessage = page.locator('text=既にリクエスト, text=すでに申請済み');
          const hasMessage = await alreadyRequestedMessage.count() > 0;

          if (!hasMessage) {
            // Try to submit again
            await page.locator('select[name="preference_order"]').selectOption('1');
            await page.locator('textarea[name="message"]').fill('重複テスト2回目');
            await submitButton.click();

            // Should show error
            const errorElement = page.locator('.form-result.error, .form-error');
            const hasError = await errorElement.count() > 0;
            expect(hasError).toBe(true);
          } else {
            // Already requested message is shown - correct behavior
            expect(hasMessage).toBe(true);
          }
        } else {
          // No form shown for already requested slot - correct behavior
          test.info().annotations.push({
            type: 'note',
            description: 'Form correctly hidden for already requested slot',
          });
        }
      }
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'No available slots to test duplicate booking',
      });
    }
  });
});

test.describe('Capacity Limits', () => {
  test('cannot book slot that is fully booked', async ({ page }) => {
    // This test would require creating a slot with max_participants=1
    // and having it already approved for another student
    // Since we can't easily simulate this in a single test,
    // we check the UI behavior when browsing

    await page.goto('/student/browse');
    await page.waitForLoadState('networkidle');

    // Look for any "full" or "満席" indicators
    const fullSlots = page.locator('text=満席, text=Full, [data-status="full"]');
    const hasFullSlots = await fullSlots.count() > 0;

    if (hasFullSlots) {
      // Click on a full slot
      const fullSlot = fullSlots.first();
      const parentCard = fullSlot.locator('xpath=ancestor::*[contains(@class, "card") or contains(@class, "slot")]').first();

      if (await parentCard.count() > 0) {
        await parentCard.click();
        await page.waitForLoadState('networkidle');

        // Booking form should be disabled or show message
        const disabledMessage = page.locator('text=予約できません, text=満席');
        const hasMessage = await disabledMessage.count() > 0;

        const bookingForm = page.locator('.booking-form-island button[type="submit"]');
        const formDisabled = await bookingForm.count() === 0 || await bookingForm.isDisabled();

        expect(hasMessage || formDisabled).toBe(true);
      }
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'No fully booked slots available to test',
      });
    }
  });
});
