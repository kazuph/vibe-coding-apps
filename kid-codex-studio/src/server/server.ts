import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CodexClient, type CodexJobInput } from './codexClient.js';
import { createCharacterBundle } from './characterBundle.js';
import { addAsset, ensureStore, listAssets, type AssetKind } from './store.js';
import { assetUrlFor, clientDist, libraryRoot, timestampId, uploadsDir } from './paths.js';

dotenv.config({ path: ['.env.local', '.env'] });

const app = express();
const port = Number(process.env.PORT || 4177);
const maxParallelJobs = Math.max(1, Math.min(6, Number(process.env.MAX_PARALLEL_JOBS || 3)));
const upload = multer({ dest: uploadsDir, limits: { fileSize: 16 * 1024 * 1024 } });

type Job = {
  id: string;
  mode: CodexJobInput['mode'];
  prompt: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  createdAt: string;
  updatedAt: string;
  message: string;
  result?: unknown;
};

const jobs = new Map<string, Job>();
const queuedJobs: Array<{ job: Job; input: CodexJobInput }> = [];
let activeJobCount = 0;

app.use(express.json({ limit: '2mb' }));
app.use('/assets', express.static(libraryRoot, { extensions: ['html'] }));

app.get('/api/health', async (_req, res) => {
  res.json({
    ok: true,
    codexBin: process.env.CODEX_BIN || 'codex',
    falConfigured: Boolean(process.env.FAL_KEY),
    libraryRoot,
    hostHint: localHostHints()
  });
});

app.get('/api/assets', async (_req, res) => {
  res.json(await listAssets());
});

app.get('/api/assets/:id/detail', async (req, res) => {
  const asset = (await listAssets()).find((item) => item.id === req.params.id);
  if (!asset) {
    res.status(404).json({ error: 'asset not found' });
    return;
  }
  const detail: Record<string, unknown> = { asset, files: [] };
  if (asset.kind === 'character') {
    const bundleDir = path.dirname(asset.path);
    const manifestPath = path.join(bundleDir, 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const rowStrips = Array.isArray(manifest.rows) ? manifest.rows.map((row: any) => row.strip).filter(Boolean) : [];
    const names = [
      manifest.thumbnail,
      manifest.spritesheet,
      manifest.atlas,
      manifest.strip,
      manifest.source,
      ...rowStrips,
      ...(manifest.sources ?? []),
      ...(manifest.frames ?? [])
    ].filter(Boolean) as string[];
    detail.manifest = manifest;
    detail.files = names.map((name) => {
      const filePath = path.join(bundleDir, name);
      return { name, path: filePath, url: assetUrlFor(filePath) };
    });
  } else if (asset.kind === 'game') {
    detail.files = [{ name: 'index.html', path: asset.path, url: asset.url }];
  } else {
    detail.files = [{ name: path.basename(asset.path), path: asset.path, url: asset.url }];
  }
  res.json(detail);
});

app.post('/api/uploads', upload.single('photo'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'photo is required' });
    return;
  }
  const ext = extensionFor(req.file.originalname, req.file.mimetype);
  const id = timestampId('upload');
  const finalPath = path.join(uploadsDir, `${id}${ext}`);
  await fs.rename(req.file.path, finalPath);
  const asset = await addAsset({
    id,
    kind: 'upload',
    title: req.body.title || req.file.originalname || 'アップロード画像',
    prompt: '',
    path: finalPath,
    url: assetUrlFor(finalPath),
    createdAt: new Date().toISOString()
  });
  res.json(asset);
});

app.post('/api/jobs', async (req, res) => {
  const mode = req.body.mode as CodexJobInput['mode'];
  const prompt = String(req.body.prompt ?? '').trim();
  if (!['image', 'character', 'game', 'video'].includes(mode)) {
    res.status(400).json({ error: 'mode must be image, character, game, or video' });
    return;
  }
  if (!prompt) {
    res.status(400).json({ error: 'prompt is required' });
    return;
  }
  const assetPaths = Array.isArray(req.body.assetPaths)
    ? req.body.assetPaths.filter((item: unknown): item is string => typeof item === 'string')
    : [];
  if (mode === 'game' && assetPaths.length === 0) {
    res.status(400).json({ error: 'ゲームはライブラリの画像を1つ以上えらんでください' });
    return;
  }
  const id = timestampId('job');
  const now = new Date().toISOString();
  const job: Job = { id, mode, prompt, status: 'queued', createdAt: now, updatedAt: now, message: 'まっててね' };
  jobs.set(id, job);
  enqueueJob(job, {
    mode,
    prompt,
    imagePath: typeof req.body.imagePath === 'string' ? req.body.imagePath : undefined,
    assetPaths
  });
  res.status(202).json(job);
});

app.get('/api/jobs', (_req, res) => {
  const recentJobs = Array.from(jobs.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
  res.json(recentJobs);
});

app.get('/api/jobs/:id', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'job not found' });
    return;
  }
  res.json(job);
});

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

await ensureStore();
app.listen(port, '0.0.0.0', () => {
  console.log(`Kid Codex Studio: http://localhost:${port}`);
  for (const hint of localHostHints()) console.log(`iPad URL hint: http://${hint}:${port}`);
});

function enqueueJob(job: Job, input: CodexJobInput) {
  queuedJobs.push({ job, input });
  refreshQueueMessages();
  scheduleJobs();
}

function scheduleJobs() {
  while (activeJobCount < maxParallelJobs && queuedJobs.length > 0) {
    const next = queuedJobs.shift();
    if (!next) return;
    activeJobCount += 1;
    void executeJob(next.job, next.input).finally(() => {
      activeJobCount -= 1;
      refreshQueueMessages();
      scheduleJobs();
    });
  }
}

function refreshQueueMessages() {
  queuedJobs.forEach(({ job }, index) => {
    updateJob(job, 'queued', index === 0 ? 'つぎに作ります' : `ならんでいます ${index + 1}ばんめ`);
  });
}

async function executeJob(job: Job, input: CodexJobInput) {
  updateJob(job, 'running', 'Codex が作っています');
  const codex = new CodexClient();
  codex.on('log', (line) => console.log(`[codex:${job.id}] ${line}`));
  try {
    const result = await codex.runJob(input);
    const assets = job.mode === 'character' ? [await createCharacterBundle(result.assets, job.prompt)] : result.assets;
    for (const asset of assets) {
      if (!asset.url) continue;
      await addAsset({
        id: timestampId(asset.kind),
        kind: asset.kind as AssetKind,
        title: asset.title,
        prompt: job.prompt,
        path: asset.path,
        url: asset.url,
        createdAt: new Date().toISOString()
      });
    }
    updateJob(job, 'done', 'できました', { ...result, assets });
  } catch (error) {
    updateJob(job, 'failed', error instanceof Error ? error.message : String(error));
  } finally {
    codex.close();
  }
}

function updateJob(job: Job, status: Job['status'], message: string, result?: unknown) {
  job.status = status;
  job.message = message;
  job.updatedAt = new Date().toISOString();
  if (result) job.result = result;
  jobs.set(job.id, job);
}

function extensionFor(name: string, mime: string) {
  const fromName = path.extname(name).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(fromName)) return fromName;
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.jpg';
}

function localHostHints() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry!.address);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  process.on('SIGTERM', () => process.exit(0));
}
