import { test, expect } from '@playwright/test';

test.describe('Ruby Sketch WASM - Sidebar & Examples', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for Ruby VM to load
    await page.waitForFunction(
      () => document.getElementById('status')?.textContent?.includes('Ready'),
      { timeout: 120000 }
    );
  });

  test('sidebar is visible with all 6 categories', async ({ page }) => {
    const sidebar = page.locator('#sidebar');
    await expect(sidebar).toBeVisible();

    const categories = page.locator('.category-header');
    await expect(categories).toHaveCount(6);

    const categoryNames = await categories.allTextContents();
    expect(categoryNames.join(' ')).toContain('Basics');
    expect(categoryNames.join(' ')).toContain('Animation');
    expect(categoryNames.join(' ')).toContain('Interactive');
    expect(categoryNames.join(' ')).toContain('Media');
    expect(categoryNames.join(' ')).toContain('Simulation');
    expect(categoryNames.join(' ')).toContain('Games');
  });

  test('clicking an example loads code into editor', async ({ page }) => {
    // Click on Flappy Bird
    await page.click('.example-item[data-id="flappy"]');
    const editorValue = await page.locator('#editor').inputValue();
    expect(editorValue).toContain('Flappy Bird');
    expect(editorValue).toContain('GRAVITY');

    // Check active state
    const activeItem = page.locator('.example-item.active');
    await expect(activeItem).toHaveCount(1);
    await expect(activeItem).toHaveAttribute('data-id', 'flappy');

    // Check header shows name
    const name = page.locator('#currentExampleName');
    await expect(name).toHaveText('Flappy Bird');
  });

  test('category toggle expands and collapses', async ({ page }) => {
    // Interactive starts collapsed
    const interactiveItems = page.locator('.category:nth-child(3) .category-items');
    await expect(interactiveItems).not.toBeVisible();

    // Click to expand
    await page.click('.category:nth-child(3) .category-header');
    await expect(interactiveItems).toBeVisible();

    // Click to collapse
    await page.click('.category:nth-child(3) .category-header');
    await expect(interactiveItems).not.toBeVisible();
  });

  test('all 30 examples exist in sidebar', async ({ page }) => {
    // Expand all categories first
    const categories = page.locator('.category');
    for (let i = 0; i < await categories.count(); i++) {
      const cat = categories.nth(i);
      if (!(await cat.evaluate(el => el.classList.contains('open')))) {
        await cat.locator('.category-header').click();
      }
    }

    const items = page.locator('.example-item');
    await expect(items).toHaveCount(30);
  });

  test('Flappy Bird runs without errors', async ({ page }) => {
    await page.click('.example-item[data-id="flappy"]');
    await page.click('#runBtn');
    await page.waitForTimeout(2000);

    // Check no error in console
    const consoleText = await page.locator('#consolePanel').textContent();
    expect(consoleText).not.toContain('error');
    expect(consoleText).not.toContain('Error');

    // Check status is Running
    const status = page.locator('#status');
    await expect(status).toHaveText('Running');
  });

  test('Danmaku Shooter runs without errors', async ({ page }) => {
    await page.click('.example-item[data-id="danmaku"]');
    await page.click('#runBtn');
    await page.waitForTimeout(2000);

    const consoleText = await page.locator('#consolePanel').textContent();
    expect(consoleText).not.toContain('error');
    expect(consoleText).not.toContain('Error');
  });

  test('Snake runs without errors', async ({ page }) => {
    await page.click('.example-item[data-id="snake"]');
    await page.click('#runBtn');
    await page.waitForTimeout(2000);

    const consoleText = await page.locator('#consolePanel').textContent();
    expect(consoleText).not.toContain('error');
    expect(consoleText).not.toContain('Error');
  });

  test('Breakout runs without errors', async ({ page }) => {
    await page.click('.example-item[data-id="breakout"]');
    await page.click('#runBtn');
    await page.waitForTimeout(2000);

    const consoleText = await page.locator('#consolePanel').textContent();
    expect(consoleText).not.toContain('error');
    expect(consoleText).not.toContain('Error');
  });

  test('Mine Sweeper runs without errors', async ({ page }) => {
    await page.click('.example-item[data-id="minesweeper"]');
    await page.click('#runBtn');
    await page.waitForTimeout(2000);

    const consoleText = await page.locator('#consolePanel').textContent();
    expect(consoleText).not.toContain('error');
    expect(consoleText).not.toContain('Error');
  });
});
