import { test, expect } from '@playwright/test';
import {
  navigateToInstructorCourses,
  navigateToInstructorAvailability,
  navigateToInstructorRequests,
  fillCourseForm,
  submitCourseForm,
  fillAvailabilityForm,
  submitAvailabilityForm,
  waitForIslandHydration,
  expectSuccessMessage,
  getFutureDate,
} from './helpers/navigation';

/**
 * Instructor Dashboard E2E Tests
 *
 * These tests require authentication state saved by auth.setup.ts
 * Run: npx playwright test --project=setup first, then --project=instructor
 */

test.describe('Instructor Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instructor');
    await page.waitForLoadState('networkidle');
  });

  test('displays instructor dashboard', async ({ page }) => {
    // Verify dashboard heading
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toContainText('講師');

    // Verify navigation links are present
    await expect(page.locator('a[href="/instructor/courses"]')).toBeVisible();
    await expect(page.locator('a[href="/instructor/availability"]')).toBeVisible();
    await expect(page.locator('a[href="/instructor/requests"]')).toBeVisible();
  });

  test('can navigate to courses page', async ({ page }) => {
    await navigateToInstructorCourses(page);

    // Verify we're on courses page
    expect(page.url()).toContain('/instructor/courses');
    await expect(page.locator('h1, h2')).toContainText(/コース/);
  });

  test('can navigate to availability page', async ({ page }) => {
    await navigateToInstructorAvailability(page);

    // Verify we're on availability page
    expect(page.url()).toContain('/instructor/availability');
    await expect(page.locator('h1, h2, h3')).toContainText(/空き時間/);
  });

  test('can navigate to requests page', async ({ page }) => {
    await navigateToInstructorRequests(page);

    // Verify we're on requests page
    expect(page.url()).toContain('/instructor/requests');
    await expect(page.locator('h1, h2')).toContainText(/リクエスト|予約/);
  });
});

test.describe('Course Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instructor/courses');
    await page.waitForLoadState('networkidle');
  });

  test('displays course form', async ({ page }) => {
    await waitForIslandHydration(page, '.course-form-island');

    // Verify form elements are present
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('textarea[name="description"]')).toBeVisible();
    await expect(page.locator('select[name="duration_minutes"]')).toBeVisible();
    await expect(page.locator('select[name="max_participants"]')).toBeVisible();
    await expect(page.locator('.course-form-island button[type="submit"]')).toBeVisible();
  });

  test('can fill course form', async ({ page }) => {
    const courseName = `テストコース_${Date.now()}`;
    const description = 'E2Eテスト用のコース説明';

    await fillCourseForm(page, courseName, description, '60', '2');

    // Verify values are filled
    await expect(page.locator('input[name="name"]')).toHaveValue(courseName);
    await expect(page.locator('textarea[name="description"]')).toHaveValue(description);
  });

  test('can create a new course', async ({ page }) => {
    const courseName = `E2Eテストコース_${Date.now()}`;
    const description = 'E2Eテストで作成されたコース';

    await fillCourseForm(page, courseName, description, '60', '2');
    await submitCourseForm(page);

    // Wait for response and verify success
    await expectSuccessMessage(page, '作成');
  });

  test('shows validation error for empty course name', async ({ page }) => {
    await waitForIslandHydration(page, '.course-form-island');

    // Try to submit without filling required fields
    await submitCourseForm(page);

    // Form should not submit (HTML5 validation)
    // The form should still be visible
    await expect(page.locator('.course-form-island form')).toBeVisible();
  });
});

test.describe('Availability Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instructor/availability');
    await page.waitForLoadState('networkidle');
  });

  test('displays availability form', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    // Verify form elements are present
    await expect(page.locator('input[type="date"]')).toBeVisible();
    await expect(page.locator('select[name="start_time"]')).toBeVisible();
    await expect(page.locator('select[name="end_time"]')).toBeVisible();
    await expect(page.locator('select[name="max_participants"]')).toBeVisible();
  });

  test('can fill availability form', async ({ page }) => {
    const futureDate = getFutureDate(7);

    await fillAvailabilityForm(page, futureDate, '10:00', '11:00', '2');

    // Verify date is filled
    await expect(page.locator('input[type="date"]')).toHaveValue(futureDate);
  });

  test('can register availability', async ({ page }) => {
    const futureDate = getFutureDate(14);

    await fillAvailabilityForm(page, futureDate, '14:00', '15:00', '1');
    await submitAvailabilityForm(page);

    // Wait for response and verify success
    await expectSuccessMessage(page, '登録');
  });

  test('date picker has minimum date set to today', async ({ page }) => {
    await waitForIslandHydration(page, '.availability-calendar-island');

    // Verify min attribute on date input
    const dateInput = page.locator('input[type="date"]');
    const minDate = await dateInput.getAttribute('min');

    // Min date should be today or later
    const today = new Date().toISOString().split('T')[0];
    expect(minDate).toBe(today);
  });
});

test.describe('Request Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/instructor/requests');
    await page.waitForLoadState('networkidle');
  });

  test('displays requests page', async ({ page }) => {
    // Verify page heading
    await expect(page.locator('h1, h2')).toContainText(/リクエスト|予約/);
  });

  test('shows message when no pending requests', async ({ page }) => {
    // Look for either approval UI or empty state message
    const hasApprovalUI = await page.locator('.approval-ui-island').count() > 0;
    const hasEmptyMessage = await page.locator('text=リクエストはありません').count() > 0;

    // Either there are requests to approve, or there's an empty state message
    expect(hasApprovalUI || hasEmptyMessage).toBe(true);
  });
});
