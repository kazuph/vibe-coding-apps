const { chromium } = require('@playwright/test');

(async () => {
  console.log('Starting Playwright test...');

  // Launch browser in headless mode
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors']
  });

  // Create context with certificate error ignored
  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });

  console.log('Browser launched successfully!');

  // Create a new page from context
  const page = await context.newPage();
  console.log('New page created');

  // Navigate to a test page
  await page.goto('https://example.com');
  console.log('Navigated to example.com');

  // Get the page title
  const title = await page.title();
  console.log(`Page title: ${title}`);

  // Take a screenshot
  await page.screenshot({ path: 'test-screenshot.png' });
  console.log('Screenshot saved to test-screenshot.png');

  // Get page content
  const content = await page.content();
  console.log(`Page content length: ${content.length} characters`);

  // Close browser
  await browser.close();
  console.log('Browser closed successfully!');

  console.log('\n✅ Playwright is working correctly in this environment!');
})().catch((error) => {
  console.error('❌ Error running Playwright:', error.message);
  process.exit(1);
});
