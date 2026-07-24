import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();
  
  page.on('console', msg => {
    console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[BROWSER ERROR] ${err.toString()}`);
  });

  await page.setViewportSize({ width: 1280, height: 720 });

  const timestamp = Date.now();
  console.log(`Opening assets preview: t=${timestamp}...`);
  await page.goto(`http://localhost:3000/assets-preview.html?headless=true&t=${timestamp}`);
  
  console.log('Waiting for Vite initialization (8s)...');
  await page.waitForTimeout(8000); 

  const outputDir = '/Users/kazuph/src/github.com/kazuph/vibe-coding-apps/.artifacts/webcam-vr-fps/images';
  fs.mkdirSync(outputDir, { recursive: true });

  // 1. City Preview
  console.log('Switching to City...');
  await page.selectOption('#asset-select', 'city');
  console.log('Waiting for City rendering (6s)...');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(outputDir, 'assets-city.png') });
  const cityStats = await page.evaluate(() => {
    return {
      fps: document.getElementById('stat-fps').textContent,
      drawcalls: document.getElementById('stat-drawcalls').textContent,
      triangles: document.getElementById('stat-triangles').textContent,
      geometries: document.getElementById('stat-geometries').textContent,
      textures: document.getElementById('stat-textures').textContent,
    };
  });
  console.log('City Stats:', cityStats);

  // 2. Enemy Preview
  console.log('Switching to Enemy...');
  await page.selectOption('#asset-select', 'enemy');
  console.log('Waiting for Enemy rendering (4s)...');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(outputDir, 'assets-enemy.png') });
  const enemyStats = await page.evaluate(() => {
    return {
      fps: document.getElementById('stat-fps').textContent,
      drawcalls: document.getElementById('stat-drawcalls').textContent,
      triangles: document.getElementById('stat-triangles').textContent,
      geometries: document.getElementById('stat-geometries').textContent,
      textures: document.getElementById('stat-textures').textContent,
    };
  });
  console.log('Enemy Stats:', enemyStats);

  // 3. Weapon Preview
  console.log('Switching to Weapon...');
  await page.selectOption('#asset-select', 'weapon');
  console.log('Waiting for Weapon rendering (4s)...');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(outputDir, 'assets-weapon.png') });
  const weaponStats = await page.evaluate(() => {
    return {
      fps: document.getElementById('stat-fps').textContent,
      drawcalls: document.getElementById('stat-drawcalls').textContent,
      triangles: document.getElementById('stat-triangles').textContent,
      geometries: document.getElementById('stat-geometries').textContent,
      textures: document.getElementById('stat-textures').textContent,
    };
  });
  console.log('Weapon Stats:', weaponStats);

  await browser.close();
  console.log('Screenshots taken successfully.');
}

run().catch(err => {
  console.error('Error running playwright:', err);
  process.exit(1);
});
