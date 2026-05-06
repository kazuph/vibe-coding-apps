import { expect, test } from '@playwright/test';

test('child-facing studio loads and validates empty prompt', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'つくりたいものをえらぼう' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'えをつくる' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'キャラづくり' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ゲームをつくる' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'どうがをつくる' })).toBeVisible();
  await expect(page.getByText('さんこう画像')).toBeVisible();
  await expect(page.getByText('いくつつくる？')).toHaveCount(0);

  await page.getByRole('button', { name: 'Codex におねがいする' }).click();
  await expect(page.getByText('なにをつくりたいか書いてね')).toBeVisible();
});

test('game creation requires a selected image asset', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'ゲームをつくる' }).click();
  await expect(page.getByText('ゲームは画像をえらんでね')).toBeVisible();
  await page.getByLabel('おねがい').fill('横スクロールゲーム');
  await page.getByRole('button', { name: 'Codex におねがいする' }).click();
  await expect(page.getByText('ゲームはライブラリの画像を1つ以上えらんでね')).toBeVisible();

  const res = await request.post('/api/jobs', {
    data: { mode: 'game', prompt: '横スクロールゲーム', assetPaths: [] }
  });
  expect(res.status()).toBe(400);
  await expect(await res.json()).toMatchObject({ error: 'ゲームはライブラリの画像を1つ以上えらんでください' });
});

test('server health is reachable through Vite proxy', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(json.codexBin).toBeTruthy();
});
