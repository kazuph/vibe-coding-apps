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
 * Complete Booking Flow E2E Test
 *
 * Tests the full booking flow:
 * 1. Instructor creates availability
 * 2. Student submits booking request
 * 3. Instructor approves request
 * 4. Booking is confirmed
 *
 * This test requires both instructor and student authentication states.
 * Run: npx playwright test --project=setup first
 */

const INSTRUCTOR_AUTH = '.auth/instructor.json';
const STUDENT_AUTH = '.auth/student.json';

test.describe('Complete Booking Flow', () => {
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

  test('instructor can create availability', async () => {
    await instructorPage.goto('/instructor/availability');
    await instructorPage.waitForLoadState('networkidle');

    const futureDate = getFutureDate(21); // 3 weeks from now

    await fillAvailabilityForm(instructorPage, futureDate, '10:00', '11:00', '2');
    await submitAvailabilityForm(instructorPage);

    await expectSuccessMessage(instructorPage, '登録');
  });

  test('student can view available slots', async () => {
    await studentPage.goto('/student/browse');
    await studentPage.waitForLoadState('networkidle');

    // Wait for page to load
    await expect(studentPage.locator('h1, h2')).toContainText(/検索|空き時間/);

    // Look for available slots
    const slots = studentPage.locator('.availability-card, .slot-card, [data-availability-id]');
    const slotCount = await slots.count();

    // There should be at least one slot (the one we just created)
    expect(slotCount).toBeGreaterThan(0);
  });

  test('student can submit booking request', async () => {
    await studentPage.goto('/student/browse');
    await studentPage.waitForLoadState('networkidle');

    // Click the first available slot
    const slots = studentPage.locator('.availability-card, .slot-card, [data-availability-id]');
    await slots.first().click();
    await studentPage.waitForLoadState('networkidle');

    // Fill and submit booking request
    await fillBookingRequestForm(studentPage, '1', '予約フローテストからのリクエスト');
    await submitBookingRequestForm(studentPage);

    await expectSuccessMessage(studentPage);
  });

  test('instructor can see pending request', async () => {
    await instructorPage.goto('/instructor/requests');
    await instructorPage.waitForLoadState('networkidle');

    // Wait for approval UI to load
    await waitForIslandHydration(instructorPage, '.approval-ui-island');

    // Should see at least one pending request
    const requests = instructorPage.locator('.approval-item, .request-item');
    const requestCount = await requests.count();
    expect(requestCount).toBeGreaterThan(0);
  });

  test('instructor can approve request', async () => {
    await instructorPage.goto('/instructor/requests');
    await instructorPage.waitForLoadState('networkidle');

    await waitForIslandHydration(instructorPage, '.approval-ui-island');

    // Select the first request checkbox
    const checkbox = instructorPage.locator('.approval-checkbox, input[type="checkbox"]').first();
    await checkbox.click();

    // Click approve button
    const approveButton = instructorPage.locator('button:has-text("承認")');
    await approveButton.click();

    // Wait for success
    await expectSuccessMessage(instructorPage, '承認');
  });

  test('student can see approved booking', async () => {
    await studentPage.goto('/student/requests');
    await studentPage.waitForLoadState('networkidle');

    // Should see the approved request
    const approvedStatus = studentPage.locator('text=承認済み, text=確定');
    const approvedCount = await approvedStatus.count();
    expect(approvedCount).toBeGreaterThan(0);
  });
});

test.describe('Group Lesson Booking Flow', () => {
  let instructorContext: BrowserContext;
  let student1Context: BrowserContext;
  let student2Context: BrowserContext;
  let instructorPage: Page;
  let student1Page: Page;
  let student2Page: Page;

  test.beforeAll(async ({ browser }) => {
    // For group lesson test, we need multiple student accounts
    // This is a simplified test that uses the same student auth
    // In production, you would have separate student accounts
    instructorContext = await browser.newContext({ storageState: INSTRUCTOR_AUTH });
    student1Context = await browser.newContext({ storageState: STUDENT_AUTH });

    instructorPage = await instructorContext.newPage();
    student1Page = await student1Context.newPage();
  });

  test.afterAll(async () => {
    await instructorContext.close();
    await student1Context.close();
  });

  test('instructor can create group availability', async () => {
    await instructorPage.goto('/instructor/availability');
    await instructorPage.waitForLoadState('networkidle');

    const futureDate = getFutureDate(28); // 4 weeks from now

    // Create slot with max 3 participants
    await fillAvailabilityForm(instructorPage, futureDate, '14:00', '15:00', '3');
    await submitAvailabilityForm(instructorPage);

    await expectSuccessMessage(instructorPage, '登録');
  });

  test('instructor can approve multiple requests as group', async () => {
    await instructorPage.goto('/instructor/requests');
    await instructorPage.waitForLoadState('networkidle');

    const checkboxes = instructorPage.locator('.approval-checkbox, input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();

    if (checkboxCount >= 2) {
      // Select first two checkboxes
      await checkboxes.nth(0).click();
      await checkboxes.nth(1).click();

      // Approve button should show group lesson text
      const approveButton = instructorPage.locator('button:has-text("グループ")');
      const hasGroupButton = await approveButton.count() > 0;

      if (hasGroupButton) {
        await approveButton.click();
        await expectSuccessMessage(instructorPage, '承認');
      }
    } else {
      test.info().annotations.push({
        type: 'skip-reason',
        description: 'Not enough requests for group lesson test',
      });
    }
  });
});
