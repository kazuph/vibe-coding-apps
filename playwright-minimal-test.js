const { chromium } = require('@playwright/test');

(async () => {
  console.log('Starting minimal Playwright test...\n');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  console.log('✅ Browser launched');

  const page = await browser.newPage();
  console.log('✅ Page created');

  // Set a simple HTML content instead of navigating
  await page.setContent('<h1>Test</h1>', { timeout: 5000 });
  console.log('✅ Content set');

  // Try to evaluate JavaScript
  const result = await page.evaluate(() => {
    return document.querySelector('h1').textContent;
  });
  console.log('✅ JavaScript evaluation successful:', result);

  await browser.close();
  console.log('✅ Browser closed\n');

  console.log('🎉 Success! Playwright is working in headless mode.');
})().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
