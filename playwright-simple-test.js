const { chromium } = require('@playwright/test');

(async () => {
  console.log('🚀 Starting Playwright test...\n');

  try {
    // Launch browser in headless mode
    const browser = await chromium.launch({
      headless: true,
      args: ['--ignore-certificate-errors', '--no-sandbox', '--disable-setuid-sandbox']
    });

    console.log('✅ Browser launched successfully!');

    // Create context with certificate error ignored
    const context = await browser.newContext({
      ignoreHTTPSErrors: true
    });

    console.log('✅ Browser context created');

    // Create a new page from context
    const page = await context.newPage();
    console.log('✅ New page created\n');

    // Navigate to a simple local HTML
    await page.setContent('<html><head><title>Test Page</title></head><body><h1>Hello Playwright!</h1></body></html>');
    console.log('✅ Content set');

    // Get the page title
    const title = await page.title();
    console.log(`📄 Page title: "${title}"`);

    // Get text content
    const h1Text = await page.locator('h1').textContent();
    console.log(`📝 H1 text: "${h1Text}"`);

    // Take a screenshot
    await page.screenshot({ path: 'playwright-test-screenshot.png' });
    console.log('📸 Screenshot saved to playwright-test-screenshot.png');

    // Close browser
    await browser.close();
    console.log('✅ Browser closed successfully!\n');

    console.log('🎉 Playwright is working correctly in this environment!\n');
    console.log('Features tested:');
    console.log('  - Browser launch (Chromium, headless)');
    console.log('  - Page creation and content manipulation');
    console.log('  - DOM querying');
    console.log('  - Screenshot capture');

  } catch (error) {
    console.error('❌ Error running Playwright:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
})();
