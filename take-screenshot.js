const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Navigate to the simulator
  await page.goto('http://localhost:8888/inverted-pendulum-control/', {
    waitUntil: 'networkidle0'
  });

  // Wait for the canvas to be rendered
  await page.waitForSelector('#pendulumCanvas');
  await page.waitForTimeout(2000); // Let the animation run for 2 seconds

  // Take screenshot of the whole page
  await page.screenshot({
    path: 'screenshots/inverted-pendulum-full.png',
    fullPage: true
  });
  console.log('Screenshot 1: Full page saved');

  // Wait a bit more to capture different states
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: 'screenshots/inverted-pendulum-running.png',
    fullPage: true
  });
  console.log('Screenshot 2: Running state saved');

  // Click on P control mode
  await page.click('button[data-mode="P"]');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: 'screenshots/inverted-pendulum-p-control.png',
    fullPage: true
  });
  console.log('Screenshot 3: P control mode saved');

  // Click on PID control mode
  await page.click('button[data-mode="PID"]');
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: 'screenshots/inverted-pendulum-pid-control.png',
    fullPage: true
  });
  console.log('Screenshot 4: PID control mode saved');

  // Click disturbance button
  await page.click('#disturbance-btn');
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: 'screenshots/inverted-pendulum-disturbance.png',
    fullPage: true
  });
  console.log('Screenshot 5: Disturbance applied saved');

  await browser.close();
  console.log('All screenshots saved!');
})();
