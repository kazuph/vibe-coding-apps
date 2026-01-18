import { Page, expect } from '@playwright/test';

/**
 * Navigation Helper Functions for Lesson Booking System
 *
 * All navigation must go through UI elements (links, buttons).
 * Only `goto('/')` is allowed - all other pages must be reached via UI navigation.
 *
 * Note: No test-only auth bypasses. All tests use production code paths.
 */

/**
 * Navigate to homepage (the only allowed direct goto)
 */
export async function goToHome(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
}

/**
 * Click login button and verify redirect to Google OAuth
 */
export async function clickLoginButton(page: Page): Promise<void> {
  const loginButton = page.locator('a[href="/auth/google"], a:has-text("Googleでログイン"), button:has-text("ログイン")');
  await expect(loginButton.first()).toBeVisible({ timeout: 10000 });
  await loginButton.first().click();
}

/**
 * Navigate to instructor courses page via UI
 */
export async function navigateToInstructorCourses(page: Page): Promise<void> {
  const coursesLink = page.locator('a[href="/instructor/courses"], a:has-text("コース管理")');
  await expect(coursesLink.first()).toBeVisible({ timeout: 10000 });
  await coursesLink.first().click();
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to instructor availability page via UI
 */
export async function navigateToInstructorAvailability(page: Page): Promise<void> {
  const availabilityLink = page.locator('a[href="/instructor/availability"], a:has-text("空き時間管理")');
  await expect(availabilityLink.first()).toBeVisible({ timeout: 10000 });
  await availabilityLink.first().click();
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to instructor requests page via UI
 */
export async function navigateToInstructorRequests(page: Page): Promise<void> {
  const requestsLink = page.locator('a[href="/instructor/requests"], a:has-text("予約リクエスト")');
  await expect(requestsLink.first()).toBeVisible({ timeout: 10000 });
  await requestsLink.first().click();
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to student browse page via UI
 */
export async function navigateToStudentBrowse(page: Page): Promise<void> {
  const browseLink = page.locator('a[href="/student/browse"], a:has-text("空き時間を検索")');
  await expect(browseLink.first()).toBeVisible({ timeout: 10000 });
  await browseLink.first().click();
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to student requests page via UI
 */
export async function navigateToStudentRequests(page: Page): Promise<void> {
  const requestsLink = page.locator('a[href="/student/requests"], a:has-text("リクエスト状況")');
  await expect(requestsLink.first()).toBeVisible({ timeout: 10000 });
  await requestsLink.first().click();
  await page.waitForLoadState('networkidle');
}

/**
 * Wait for Island Component to hydrate
 */
export async function waitForIslandHydration(page: Page, selector: string): Promise<void> {
  await expect(page.locator(selector)).toBeVisible({ timeout: 15000 });
  // Wait a bit more for hydration to complete
  await page.waitForTimeout(500);
}

/**
 * Fill course form via UI
 */
export async function fillCourseForm(
  page: Page,
  courseName: string,
  description: string = '',
  duration: string = '60',
  maxParticipants: string = '1'
): Promise<void> {
  await waitForIslandHydration(page, '.course-form-island');

  await page.locator('input[name="name"]').fill(courseName);
  if (description) {
    await page.locator('textarea[name="description"]').fill(description);
  }
  await page.locator('select[name="duration_minutes"]').selectOption(duration);
  await page.locator('select[name="max_participants"]').selectOption(maxParticipants);
}

/**
 * Submit course form
 */
export async function submitCourseForm(page: Page): Promise<void> {
  await page.locator('.course-form-island button[type="submit"]').click();
}

/**
 * Fill availability form via UI
 */
export async function fillAvailabilityForm(
  page: Page,
  date: string,
  startTime: string = '09:00',
  endTime: string = '10:00',
  maxParticipants: string = '1'
): Promise<void> {
  await waitForIslandHydration(page, '.availability-calendar-island');

  await page.locator('input[type="date"]').fill(date);
  await page.locator('select[name="start_time"]').selectOption(startTime);
  await page.locator('select[name="end_time"]').selectOption(endTime);
  await page.locator('select[name="max_participants"]').selectOption(maxParticipants);
}

/**
 * Submit availability form
 */
export async function submitAvailabilityForm(page: Page): Promise<void> {
  await page.locator('.availability-calendar-island button[type="submit"]').click();
}

/**
 * Fill booking request form via UI
 */
export async function fillBookingRequestForm(
  page: Page,
  preferenceOrder: string = '1',
  message: string = ''
): Promise<void> {
  await waitForIslandHydration(page, '.booking-form-island');

  await page.locator('select[name="preference_order"]').selectOption(preferenceOrder);
  if (message) {
    await page.locator('textarea[name="message"]').fill(message);
  }
}

/**
 * Submit booking request form
 */
export async function submitBookingRequestForm(page: Page): Promise<void> {
  await page.locator('.booking-form-island button[type="submit"]').click();
}

/**
 * Get future date string in YYYY-MM-DD format
 */
export function getFutureDate(daysFromNow: number = 7): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date.toISOString().split('T')[0];
}

/**
 * Check if success message is displayed
 */
export async function expectSuccessMessage(page: Page, text?: string): Promise<void> {
  const successElement = page.locator('.form-result.success, .form-success, .success-text');
  await expect(successElement.first()).toBeVisible({ timeout: 10000 });
  if (text) {
    await expect(successElement.first()).toContainText(text);
  }
}

/**
 * Check if error message is displayed
 */
export async function expectErrorMessage(page: Page, text?: string): Promise<void> {
  const errorElement = page.locator('.form-result.error, .form-error');
  await expect(errorElement.first()).toBeVisible({ timeout: 10000 });
  if (text) {
    await expect(errorElement.first()).toContainText(text);
  }
}
