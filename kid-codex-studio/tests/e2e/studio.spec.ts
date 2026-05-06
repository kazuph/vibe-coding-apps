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

test('reload restores server-side running jobs', async ({ page }) => {
  const jobs = [
    {
      id: 'job-visible-after-reload',
      mode: 'image',
      prompt: 'リロードしても見えるジョブ',
      status: 'running',
      message: 'まだ作っています'
    }
  ];
  await page.route('**/api/jobs', async (route) => {
    await route.fulfill({ json: jobs });
  });
  await page.route('**/api/jobs/job-visible-after-reload', async (route) => {
    await route.fulfill({ json: jobs[0] });
  });

  await page.goto('/');
  await expect(page.getByText('まだ作っています')).toBeVisible();
  await page.reload();
  await expect(page.getByText('まだ作っています')).toBeVisible();
});

test('game assets can be selected as upgrade references', async ({ page }) => {
  await page.route(/\/api\/assets$/, async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'game-v1',
          kind: 'game',
          title: 'ゲーム',
          prompt: '前のゲーム',
          path: '/tmp/game-v1/index.html',
          url: '/assets/games/game-v1/index.html',
          createdAt: new Date().toISOString()
        }
      ]
    });
  });
  await page.route(/\/api\/jobs$/, async (route) => route.fulfill({ json: [] }));

  await page.goto('/');
  await page.getByRole('button', { name: 'ゲームをつくる' }).click();
  await page.getByRole('button', { name: 'さんこう画像にする' }).click();
  await expect(page.getByText('1こ えらんでいます')).toBeVisible();
});

test('game cards show title and thumbnail when available', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/assets')) {
      await route.fulfill({
        json: [
        {
          id: 'game-with-thumb',
          kind: 'game',
          title: '星あつめレース',
          prompt: '星を集める',
          path: '/tmp/game/index.html',
          url: '/assets/games/game/index.html',
          thumbnailUrl: '/assets/games/game/thumbnail.png',
          createdAt: new Date().toISOString()
        }
        ]
      });
      return;
    }
    if (url.includes('/api/jobs')) {
      await route.fulfill({ json: [] });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await expect(page.getByText('星あつめレース')).toBeVisible();
  await expect(page.locator('.asset-main img[src="/assets/games/game/thumbnail.png"]')).toBeVisible();
});

test('server health is reachable through Vite proxy', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(json.codexBin).toBeTruthy();
});
