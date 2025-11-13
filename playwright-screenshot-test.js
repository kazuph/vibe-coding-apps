const { chromium } = require('@playwright/test');

(async () => {
  console.log('Testing screenshot functionality...\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  console.log('✅ Browser launched');

  const page = await browser.newPage();
  console.log('✅ Page created');

  await page.setContent(`
    <html>
      <head><title>Screenshot Test</title></head>
      <body>
        <h1>Playwright Screenshot Test</h1>
        <p>This is a test page for verifying screenshot functionality.</p>
      </body>
    </html>
  `, { timeout: 5000 });
  console.log('✅ Content set');

  // Take screenshot
  await page.screenshot({
    path: 'playwright-test-result.png',
    fullPage: true,
    timeout: 10000
  });
  console.log('✅ Screenshot saved to playwright-test-result.png');

  await browser.close();
  console.log('✅ Browser closed\n');

  console.log('🎉 Screenshot test completed successfully!');
})().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
