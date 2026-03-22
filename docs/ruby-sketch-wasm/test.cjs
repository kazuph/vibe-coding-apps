/**
 * Playwright E2E tests for Ruby Sketch WASM.
 *
 * Starts a local proxy server (test-server.cjs) that serves the app
 * with CDN resources cached locally, then runs tests via headless Chromium.
 *
 * Usage:
 *   cd docs/ruby-sketch-wasm
 *   node test.cjs
 *
 * Requirements:
 *   - playwright (npm install playwright)
 *   - Chromium browser installed (npx playwright install chromium)
 */
const { chromium } = require('playwright');
const { ensureCached, startServer, PORT } = require('./test-server.cjs');

const TIMEOUT = 180000; // ruby.wasm compilation is slow
const URL = `http://127.0.0.1:${PORT}/`;

let failCount = 0;
function pass(msg) { console.log(`  PASS: ${msg}`); }
function fail(msg) { failCount++; console.log(`  FAIL: ${msg}`); }

async function findChromium() {
  // Try common locations for headless shell / chromium
  const fs = require('fs');
  const glob = require('path');
  const cacheDir = require('os').homedir() + '/.cache/ms-playwright';
  const rootCache = '/root/.cache/ms-playwright';

  for (const base of [cacheDir, rootCache]) {
    if (!fs.existsSync(base)) continue;
    const dirs = fs.readdirSync(base).sort().reverse();

    // Prefer headless_shell
    for (const d of dirs) {
      if (!d.startsWith('chromium_headless_shell-')) continue;
      const bin = `${base}/${d}/chrome-linux/headless_shell`;
      if (fs.existsSync(bin)) return bin;
    }

    // Fall back to full chromium
    for (const d of dirs) {
      if (!d.startsWith('chromium-')) continue;
      const bin = `${base}/${d}/chrome-linux/chrome`;
      if (fs.existsSync(bin)) return bin;
    }
  }

  return null; // Let playwright find it
}

async function test() {
  console.log('Preparing CDN cache...');
  await ensureCached();

  console.log('Starting test server...');
  const server = startServer();

  // Wait for server to be ready
  await new Promise(r => setTimeout(r, 500));

  const executablePath = await findChromium();
  console.log(`Using browser: ${executablePath || '(playwright default)'}`);

  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  };
  if (executablePath) launchOptions.executablePath = executablePath;

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage();

  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  try {
    // ============================
    console.log('\n=== Test 1: Page load & Ruby VM init ===');
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    pass('Page loaded');

    try {
      await page.waitForFunction(
        () => document.getElementById('status').textContent === 'Ready',
        { timeout: TIMEOUT }
      );
      pass('Ruby VM initialized');
    } catch (e) {
      const status = await page.$eval('#status', el => el.textContent);
      const consoleText = await page.$eval('#consolePanel', el => el.textContent);
      fail(`Ruby VM init timeout. Status: "${status}", Console: ${consoleText.slice(0, 500)}`);
      throw new Error('Ruby VM failed to initialize - cannot continue');
    }

    const runDisabled = await page.$eval('#runBtn', el => el.disabled);
    runDisabled ? fail('Run button disabled') : pass('Run button enabled');

    // ============================
    console.log('\n=== Test 2: Run all sample sketches ===');
    const examples = [
      'circles', 'rainbow', 'particles', 'fractal_tree',
      'game_of_life', 'starfield', 'paint', 'hsb_clock', 'vectors',
    ];

    for (const ex of examples) {
      await page.selectOption('#exampleSelect', ex);
      await page.waitForTimeout(300);
      await page.click('#runBtn');
      await page.waitForTimeout(3000);

      const st = await page.$eval('#status', el => el.textContent);
      const consoleText = await page.$eval('#consolePanel', el => el.textContent);
      const hasError = consoleText.includes('Runtime error') || consoleText.includes('Error:');

      if ((st === 'Running' || st === 'Ready') && !hasError) {
        pass(ex);
      } else {
        const errorLines = consoleText.split('\n').filter(l => l.includes('rror'));
        fail(`${ex} - Status: "${st}", Errors: ${errorLines.join(' | ')}`);
      }

      const stopVisible = await page.$eval('#stopBtn', el => el.style.display !== 'none');
      if (stopVisible) await page.click('#stopBtn');
      await page.waitForTimeout(300);
    }

    // ============================
    console.log('\n=== Test 3: Mouse events (Interactive Paint) ===');
    await page.selectOption('#exampleSelect', 'paint');
    await page.waitForTimeout(300);
    await page.click('#runBtn');
    await page.waitForTimeout(1500);

    const canvasBox = await page.locator('#sketchCanvas').boundingBox();
    if (canvasBox) {
      // Click to start loop
      await page.mouse.click(canvasBox.x + 100, canvasBox.y + 100);
      await page.waitForTimeout(300);

      // Drag across canvas
      await page.mouse.move(canvasBox.x + 100, canvasBox.y + 100);
      await page.mouse.down();
      for (let i = 0; i < 5; i++) {
        await page.mouse.move(canvasBox.x + 100 + i * 20, canvasBox.y + 100 + i * 10);
        await page.waitForTimeout(50);
      }
      await page.mouse.up();
      await page.waitForTimeout(500);

      const consoleText = await page.$eval('#consolePanel', el => el.textContent);
      const hasError = consoleText.includes('Event error') || consoleText.includes('Runtime error');
      hasError ? fail(`Mouse events: ${consoleText.slice(-300)}`) : pass('Mouse drag events');
    } else {
      fail('Canvas not found for mouse test');
    }

    let stopVis = await page.$eval('#stopBtn', el => el.style.display !== 'none');
    if (stopVis) await page.click('#stopBtn');
    await page.waitForTimeout(300);

    // ============================
    console.log('\n=== Test 4: Key events ===');
    await page.selectOption('#exampleSelect', 'paint');
    await page.waitForTimeout(300);
    await page.click('#runBtn');
    await page.waitForTimeout(1500);

    // Click on canvas so key events don't go to the editor textarea
    if (canvasBox) {
      await page.mouse.click(canvasBox.x + 50, canvasBox.y + 50);
      await page.waitForTimeout(300);
    }
    await page.keyboard.press('c');
    await page.waitForTimeout(500);

    const consoleText4 = await page.$eval('#consolePanel', el => el.textContent);
    const hasError4 = consoleText4.includes('Event error') || consoleText4.includes('Runtime error');
    hasError4 ? fail(`Key events: ${consoleText4.slice(-300)}`) : pass('Key events');

    stopVis = await page.$eval('#stopBtn', el => el.style.display !== 'none');
    if (stopVis) await page.click('#stopBtn');
    await page.waitForTimeout(300);

    // ============================
    console.log('\n=== Test 5: Custom code with new APIs ===');
    const testCode = `setup do
  size 400, 400
  colorMode HSB, 360, 100, 100
end

draw do
  background 0, 0, 10

  v = createVector(100, 200)
  v.add(createVector(50, 50))

  pushMatrix do
    translate v.x, v.y
    fill 120, 80, 80
    noStroke
    circle 0, 0, 40
  end

  val = map(mouseX, 0, width, 0, 360)
  cval = constrain(val, 0, 360)
  d = dist(0, 0, 100, 100)
  n = noise(frameCount * 0.01)

  fill 0, 0, 100
  textSize 14
  text "v=\#{v}, d=\#{d.to_i}, n=\#{n.round(2)}", 10, 30

  beginShape
  vertex 200, 100
  vertex 250, 180
  vertex 150, 180
  endShape CLOSE

  arc 300, 300, 60, 60, 0, PI

  strokeCap :round
  strokeJoin :round
  stroke 60, 80, 90
  strokeWeight 3
  bezier 10, 350, 100, 300, 200, 380, 300, 350

  rectMode CENTER
  fill 200, 80, 80
  rect 300, 50, 40, 40

  noLoop if frameCount > 30
end`;

    await page.$eval('#editor', (el, code) => { el.value = code; }, testCode);
    await page.waitForTimeout(300);
    await page.click('#runBtn');
    await page.waitForTimeout(3500);

    const consoleText5 = await page.$eval('#consolePanel', el => el.textContent);
    const hasError5 = consoleText5.includes('Runtime error') || consoleText5.includes('Error:');
    if (hasError5) {
      const errorLines = consoleText5.split('\n').filter(l => l.includes('rror'));
      fail(`Custom code: ${errorLines.join(' | ')}`);
    } else {
      pass('Custom code (colorMode, PVector, pushMatrix block, beginShape, arc, bezier, rectMode)');
    }

  } finally {
    await browser.close();
    server.close();
  }

  // ============================
  console.log('\n=== Summary ===');
  const realErrors = pageErrors.filter(e => !e.includes('favicon'));
  if (realErrors.length > 0) {
    console.log('  Browser page errors:');
    realErrors.forEach(e => console.log(`    ${e.slice(0, 200)}`));
  }
  console.log(`\n  Total failures: ${failCount}`);
  console.log(`  Result: ${failCount === 0 ? 'ALL PASSED' : 'SOME FAILED'}`);

  process.exit(failCount > 0 ? 1 : 0);
}

test().catch(e => {
  console.error('Test crashed:', e.message);
  process.exit(1);
});
