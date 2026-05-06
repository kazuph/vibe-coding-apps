import fs from 'node:fs/promises';
import path from 'node:path';
import { charactersDir, generatedDir, gamesDir, libraryRoot, thumbsDir, uploadsDir, videosDir } from './paths.js';

export type AssetKind = 'upload' | 'image' | 'character' | 'game' | 'video';

export type Asset = {
  id: string;
  kind: AssetKind;
  title: string;
  prompt: string;
  path: string;
  url: string;
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
  return (parsed.assets ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addAsset(asset: Asset): Promise<Asset> {
  await ensureStore();
  const assets = await listAssets();
  assets.unshift(asset);
  await fs.writeFile(dbPath, JSON.stringify({ assets }, null, 2));
  return asset;
}
