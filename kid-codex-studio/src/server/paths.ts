import path from 'node:path';

export const appRoot = process.cwd();
export const libraryRoot = path.join(appRoot, 'library');
export const workspaceRoot = path.join(appRoot, 'workspace');
export const uploadsDir = path.join(libraryRoot, 'uploads');
export const generatedDir = path.join(libraryRoot, 'generated');
export const gamesDir = path.join(libraryRoot, 'games');
export const videosDir = path.join(libraryRoot, 'videos');
export const charactersDir = path.join(libraryRoot, 'characters');
export const thumbsDir = path.join(libraryRoot, 'thumbs');
export const clientDist = path.join(appRoot, 'dist/client');

export function assetUrlFor(filePath: string) {
  const relative = path.relative(libraryRoot, filePath).split(path.sep).join('/');
  if (relative.startsWith('..')) {
    throw new Error(`Path is outside library: ${filePath}`);
  }
  return `/assets/${relative}`;
}

export function timestampId(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${random}`;
}
