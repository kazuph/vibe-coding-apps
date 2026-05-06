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

test('job queue shows prompt, plan, references, and result thumbnails', async ({ page }) => {
  const job = {
    id: 'job-detailed',
    mode: 'game',
    prompt: 'ジャンプするレースゲーム',
    status: 'done',
    message: 'ゲームができました',
    plan: '2この参考を見て Phaserゲームを作り、動作確認とサムネを作ります',
    references: [
      {
        id: 'ref-car',
        kind: 'upload',
        title: '車の写真',
        prompt: '',
        path: '/tmp/car.png',
        url: '/assets/uploads/car.png',
        createdAt: new Date().toISOString()
      }
    ],
    result: {
      text: '',
      assets: [
        {
          id: 'made-game',
          kind: 'game',
          title: 'ジャンプレース',
          prompt: 'ジャンプするレースゲーム',
          path: '/tmp/game/index.html',
          url: '/assets/games/game/index.html',
          thumbnailUrl: '/assets/games/game/thumbnail.png',
          createdAt: new Date().toISOString()
        }
      ]
    }
  };
  await page.route(/\/api\/assets$/, async (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/jobs$/, async (route) => route.fulfill({ json: [job] }));
  await page.route(/\/api\/jobs\/job-detailed$/, async (route) => route.fulfill({ json: job }));

  await page.goto('/');
  await expect(page.getByText('ゲームができました')).toBeVisible();
  await expect(page.getByText('ジャンプするレースゲーム')).toBeVisible();
  await expect(page.getByText('2この参考を見て Phaserゲームを作り')).toBeVisible();
  await expect(page.getByText('さんこう', { exact: true })).toBeVisible();
  await expect(page.locator('.job-thumbs img[src="/assets/uploads/car.png"]')).toBeVisible();
  await expect(page.getByText('できたもの')).toBeVisible();
  await expect(page.locator('.job-thumbs img[src="/assets/games/game/thumbnail.png"]')).toBeVisible();
});

test('interrupted jobs stay visible and can be retried', async ({ page }) => {
  const interrupted = {
    id: 'job-interrupted',
    mode: 'video',
    prompt: 'レース動画を作る',
    status: 'interrupted',
    message: '再起動で止まりました',
    plan: '1この参考を見て Seedance 2.0 Fastで15秒の音声付き動画を作ります',
    references: [],
    input: { mode: 'video', prompt: 'レース動画を作る', assetPaths: [] }
  };
  let retried = false;
  await page.route(/\/api\/assets$/, async (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/jobs$/, async (route) => route.fulfill({ json: [interrupted] }));
  await page.route(/\/api\/jobs\/job-interrupted$/, async (route) => route.fulfill({ json: interrupted }));
  await page.route(/\/api\/jobs\/job-interrupted\/retry$/, async (route) => {
    retried = true;
    await route.fulfill({ json: { ...interrupted, status: 'queued', message: '再開します' } });
  });

  await page.goto('/');
  await expect(page.getByText('1. 再起動で止まりました')).toBeVisible();
  await expect(page.getByText('サーバー再起動で止まりました')).toBeVisible();
  await page.getByRole('button', { name: '再開' }).click();
  await expect(page.getByText('再開します')).toBeVisible();
  expect(retried).toBe(true);
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

test('selected references show thumbnails in the reference panel', async ({ page }) => {
  await page.route(/\/api\/assets$/, async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'upload-ref',
          kind: 'upload',
          title: 'car.png',
          prompt: '',
          path: '/tmp/car.png',
          url: '/assets/uploads/car.png',
          createdAt: new Date().toISOString()
        },
        {
          id: 'game-ref',
          kind: 'game',
          title: '前のゲーム',
          prompt: '前のゲーム',
          path: '/tmp/game/index.html',
          url: '/assets/games/game/index.html',
          thumbnailUrl: '/assets/games/game/thumbnail.png',
          createdAt: new Date().toISOString()
        }
      ]
    });
  });
  await page.route(/\/api\/jobs$/, async (route) => route.fulfill({ json: [] }));

  await page.goto('/');
  await page.getByRole('button', { name: 'さんこう画像にする' }).first().click();
  await page.getByRole('button', { name: 'さんこう画像にする' }).nth(1).click();

  const panel = page.getByLabel('えらんださんこう画像');
  await expect(panel.locator('img[src="/assets/uploads/car.png"]')).toBeVisible();
  await expect(panel.locator('img[src="/assets/games/game/thumbnail.png"]')).toBeVisible();
  await expect(page.getByText('2こ えらんでいます')).toBeVisible();
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
          version: 'ゲーム v3',
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
  await expect(page.getByLabel('ゲーム')).toBeVisible();
  await expect(page.getByText('v3')).toBeVisible();
});

test('asset cards can be deleted', async ({ page }) => {
  let deletedId = '';
  await page.route(/\/api\/assets$/, async (route) => {
    await route.fulfill({
      json: [
        {
          id: 'delete-me',
          kind: 'image',
          title: '消す画像',
          prompt: '消す',
          path: '/tmp/delete-me.png',
          url: '/assets/generated/delete-me.png',
          createdAt: new Date().toISOString()
        }
      ]
    });
  });
  await page.route(/\/api\/jobs$/, async (route) => route.fulfill({ json: [] }));
  await page.route(/\/api\/assets\/delete-me$/, async (route) => {
    if (route.request().method() === 'DELETE') {
      deletedId = 'delete-me';
      await route.fulfill({ json: { ok: true, id: deletedId } });
      return;
    }
    await route.continue();
  });
  page.on('dialog', (dialog) => void dialog.accept());

  await page.goto('/');
  await expect(page.getByText('消す画像')).toBeVisible();
  await page.getByRole('button', { name: '消す画像を削除' }).click();
  await expect(page.getByText('消す画像')).toHaveCount(0);
  expect(deletedId).toBe('delete-me');
});

test('server health is reachable through Vite proxy', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(json.codexBin).toBeTruthy();
});
