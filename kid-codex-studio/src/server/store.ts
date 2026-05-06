import fs from 'node:fs/promises';
import path from 'node:path';
import { assetUrlFor, charactersDir, generatedDir, gamesDir, libraryRoot, thumbsDir, uploadsDir, videosDir } from './paths.js';

export type AssetKind = 'upload' | 'image' | 'character' | 'game' | 'video';

export type Asset = {
  id: string;
  kind: AssetKind;
  title: string;
  prompt: string;
  path: string;
  url: string;
  thumbnailUrl?: string;
  createdAt: string;
};

const dbPath = path.join(libraryRoot, 'library.json');

export async function ensureStore() {
  await Promise.all([
    fs.mkdir(uploadsDir, { recursive: true }),
    fs.mkdir(generatedDir, { recursive: true }),
    fs.mkdir(gamesDir, { recursive: true }),
    fs.mkdir(videosDir, { recursive: true }),
    fs.mkdir(charactersDir, { recursive: true }),
    fs.mkdir(thumbsDir, { recursive: true })
  ]);
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify({ assets: [] }, null, 2));
  }
}

export async function listAssets(): Promise<Asset[]> {
  await ensureStore();
  const raw = await fs.readFile(dbPath, 'utf8');
  const parsed = JSON.parse(raw) as { assets?: Asset[] };
  const assets = await Promise.all((parsed.assets ?? []).map(enrichAsset));
  return assets.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addAsset(asset: Asset): Promise<Asset> {
  await ensureStore();
  const assets = await listAssets();
  assets.unshift(asset);
  await fs.writeFile(dbPath, JSON.stringify({ assets }, null, 2));
  return asset;
}

async function enrichAsset(asset: Asset): Promise<Asset> {
  if (asset.kind !== 'game') return asset;

  const gameDir = path.dirname(asset.path);
  const enriched = { ...asset };
  const metaPath = path.join(gameDir, 'game-meta.json');

  try {
    const meta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as { title?: unknown; thumbnail?: unknown };
    if (typeof meta.title === 'string' && meta.title.trim() && enriched.title === 'ゲーム') {
      enriched.title = meta.title.trim();
    }
    if (typeof meta.thumbnail === 'string' && meta.thumbnail.trim()) {
      const thumbnailPath = path.join(gameDir, meta.thumbnail);
      await fs.access(thumbnailPath);
      enriched.thumbnailUrl = assetUrlFor(thumbnailPath);
      return enriched;
    }
  } catch {
    // Existing game bundles may predate metadata.
  }

  const thumbnailPath = path.join(gameDir, 'thumbnail.png');
  try {
    await fs.access(thumbnailPath);
    enriched.thumbnailUrl = assetUrlFor(thumbnailPath);
  } catch {
    // Older game bundles may not have thumbnails yet.
  }

  return enriched;
}
