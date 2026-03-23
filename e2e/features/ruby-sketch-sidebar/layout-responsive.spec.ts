import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '@playwright/test';

const ARTIFACT_DIR = path.join(__dirname, '../../../.artifacts/ruby-sketch-layout');

async function waitRubyReady(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => document.getElementById('status')?.textContent?.includes('Ready'),
    { timeout: 120_000 }
  );
}

test.describe('Ruby Sketch WASM — レスポンシブ（スタック: 上=エディタ / 下=プレビュー）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitRubyReady(page);
  });

  test.describe('iPhone 相当（狭幅）', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('エディタパネルがキャンバスパネルより上にある', async ({ page }) => {
      const editorPanel = page.locator('.editor-panel');
      const canvasPanel = page.locator('.canvas-panel');
      const eb = await editorPanel.boundingBox();
      const cb = await canvasPanel.boundingBox();
      expect(eb).toBeTruthy();
      expect(cb).toBeTruthy();
      if (!eb || !cb) return;
      expect(eb.y).toBeLessThan(cb.y);
      expect(eb.y + eb.height).toBeLessThanOrEqual(cb.y + 2);
    });

    test('Circles 実行後のスクリーンショット（モバイル縦・描画を検証）', async ({ page }) => {
      // Hello World は黒地＋白文字で縮小時に「動いてない」ように見えるため、
      // 常にカラフルな円が描かれる Circles 例で証跡を取る
      await page.locator('#sidebarToggle').click();
      await page.locator('.example-item[data-id="circles"]').click();
      await page.locator('#runBtn').click();
      await expect(page.locator('#status')).toHaveText('Running', { timeout: 60_000 });
      await expect(page.locator('#fpsCounter')).toHaveText(/\d+\s*fps/i, { timeout: 30_000 });

      await page.waitForFunction(
        () => {
          const el = document.getElementById('sketchCanvas');
          if (!el || !(el instanceof HTMLCanvasElement) || el.width < 16 || el.height < 16) return false;
          const ctx = el.getContext('2d');
          if (!ctx) return false;
          const { width: w, height: h } = el;
          const d = ctx.getImageData(Math.floor(w * 0.2), Math.floor(h * 0.2), 160, 160).data;
          let vivid = 0;
          for (let i = 0; i < d.length; i += 4) {
            const r = d[i];
            const g = d[i + 1];
            const b = d[i + 2];
            const a = d[i + 3];
            if (a < 20) continue;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if (max - min > 25 || max > 80) vivid++;
            if (vivid > 200) return true;
          }
          return false;
        },
        { timeout: 45_000 }
      );

      await page.waitForTimeout(400);

      fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, 'mobile-stack-running.png'),
        fullPage: true,
      });
    });

    test('main-container が縦並び（flex-direction: column）', async ({ page }) => {
      const dir = await page
        .locator('.main-container')
        .evaluate((el) => getComputedStyle(el).flexDirection);
      expect(dir).toBe('column');
    });

    test('サイドバー開閉ボタンが表示される', async ({ page }) => {
      await expect(page.locator('#sidebarToggle')).toBeVisible();
    });

    test('Hello World が実行できる', async ({ page }) => {
      await page.locator('#runBtn').click();
      await page.waitForTimeout(2000);
      await expect(page.locator('#status')).toHaveText('Running');
    });
  });

  test.describe('縦長ウィンドウ（幅は広いがアスペクトが縦）', () => {
    test.use({ viewport: { width: 700, height: 1000 } });

    test('エディタが上・プレビューが下（アスペクト比ブレークポイント）', async ({ page }) => {
      const editorPanel = page.locator('.editor-panel');
      const canvasPanel = page.locator('.canvas-panel');
      const eb = await editorPanel.boundingBox();
      const cb = await canvasPanel.boundingBox();
      expect(eb).toBeTruthy();
      expect(cb).toBeTruthy();
      if (!eb || !cb) return;
      expect(eb.y).toBeLessThan(cb.y);
    });

    test('main-container が column', async ({ page }) => {
      const dir = await page
        .locator('.main-container')
        .evaluate((el) => getComputedStyle(el).flexDirection);
      expect(dir).toBe('column');
    });
  });

  test.describe('ワイドデスクトップ', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('main-container が横並び（row）', async ({ page }) => {
      const dir = await page
        .locator('.main-container')
        .evaluate((el) => getComputedStyle(el).flexDirection);
      expect(dir).toBe('row');
    });

    test('エディタがキャンバスの左側', async ({ page }) => {
      const editorPanel = page.locator('.editor-panel');
      const canvasPanel = page.locator('.canvas-panel');
      const eb = await editorPanel.boundingBox();
      const cb = await canvasPanel.boundingBox();
      expect(eb).toBeTruthy();
      expect(cb).toBeTruthy();
      if (!eb || !cb) return;
      expect(eb.x).toBeLessThan(cb.x);
    });
  });
});
