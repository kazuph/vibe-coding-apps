import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { assetUrlFor, charactersDir, timestampId } from './paths.js';
import type { CodexJobResult } from './codexClient.js';

const execFileAsync = promisify(execFile);
const cellWidth = 192;
const cellHeight = 208;
const atlasColumns = 8;

const petRows = [
  { state: 'idle', row: 0, frames: 6 },
  { state: 'running-right', row: 1, frames: 8 },
  { state: 'running-left', row: 2, frames: 8 },
  { state: 'waving', row: 3, frames: 4 },
  { state: 'jumping', row: 4, frames: 5 },
  { state: 'failed', row: 5, frames: 8 },
  { state: 'waiting', row: 6, frames: 6 },
  { state: 'running', row: 7, frames: 6 },
  { state: 'review', row: 8, frames: 6 }
];

export type CharacterBundleAsset = {
  kind: 'character';
  path: string;
  url: string;
  title: string;
};

export async function createCharacterBundle(
  sources: CodexJobResult['assets'],
  prompt: string
): Promise<CharacterBundleAsset> {
  const id = timestampId('character');
  const bundleDir = path.join(charactersDir, id);
  await fs.mkdir(bundleDir, { recursive: true });

  const characterSources = sources.filter((source) => source.kind === 'character');
  if (characterSources.length < petRows.length) {
    throw new Error(`キャラづくりは /pet と同じ9行のスプライトストリップが必要です。現在 ${characterSources.length} 行しかありません。`);
  }

  const strips: Array<{ state: string; frames: number; path: string }> = [];
  const framePaths: string[] = [];
  const framesDir = path.join(bundleDir, 'frames');
  await fs.mkdir(framesDir, { recursive: true });

  for (const [rowIndex, spec] of petRows.entries()) {
    const source = characterSources[rowIndex];
    const ext = path.extname(source.path) || '.png';
    const stripPath = path.join(bundleDir, `row-${String(spec.row).padStart(2, '0')}-${spec.state}${ext}`);
    await fs.copyFile(source.path, stripPath);
    strips.push({ state: spec.state, frames: spec.frames, path: stripPath });
    for (let index = 0; index < spec.frames; index += 1) {
      const rawFrame = path.join(framesDir, `${spec.state}-${index}-raw.png`);
      const framePath = path.join(framesDir, `${spec.state}-${index}.png`);
      await cropStripFrame(stripPath, rawFrame, index, spec.frames);
      await normalizeFrame(rawFrame, framePath);
      await fs.rm(rawFrame, { force: true });
      framePaths.push(framePath);
    }
  }

  const atlasPath = path.join(bundleDir, 'spritesheet.png');
  const webpPath = path.join(bundleDir, 'spritesheet.webp');
  await composeAtlas(bundleDir, atlasPath);
  await execFileAsync('magick', [atlasPath, webpPath]);

  const thumbPath = path.join(bundleDir, 'thumb.gif');
  await createAnimatedThumbnail(framePaths, thumbPath);

  await fs.writeFile(
    path.join(bundleDir, 'manifest.json'),
    JSON.stringify(
      {
        id,
        title: 'キャラ',
        prompt,
        rows: strips.map((strip) => ({
          state: strip.state,
          frames: strip.frames,
          strip: path.basename(strip.path)
        })),
        spritesheet: path.basename(webpPath),
        atlas: path.basename(atlasPath),
        thumbnail: path.basename(thumbPath),
        frames: framePaths.map((frame) => path.relative(bundleDir, frame).split(path.sep).join('/')),
        createdAt: new Date().toISOString()
      },
      null,
      2
    )
  );

  return { kind: 'character', path: thumbPath, url: assetUrlFor(thumbPath), title: 'キャラ' };
}

async function createAnimatedThumbnail(framePaths: string[], output: string) {
  await execFileAsync('magick', [
    '-background',
    'none',
    '-dispose',
    'Background',
    '-delay',
    '10',
    '-loop',
    '0',
    ...framePaths.slice(0, 24),
    output
  ]);
}

async function cropStripFrame(stripPath: string, output: string, index: number, frames: number) {
  const geometry = `%[fx:floor(w/${frames})]x%h+%[fx:floor(w/${frames})*${index}]+0`;
  await execFileAsync('magick', [stripPath, '-crop', geometry, '+repage', output]);
}

async function normalizeFrame(source: string, output: string) {
  await execFileAsync('magick', [
    source,
    '-alpha',
    'set',
    '-fuzz',
    '18%',
    '-transparent',
    '#00FF00',
    '-transparent',
    '#00E600',
    '-transparent',
    '#00CC00',
    '-background',
    'none',
    '-resize',
    `${cellWidth - 10}x${cellHeight - 10}`,
    '-gravity',
    'center',
    '-extent',
    `${cellWidth}x${cellHeight}`,
    output
  ]);
}

async function composeAtlas(bundleDir: string, output: string) {
  const width = atlasColumns * cellWidth;
  const height = petRows.length * cellHeight;
  const args = ['-size', `${width}x${height}`, 'xc:none'];
  for (const spec of petRows) {
    for (let index = 0; index < spec.frames; index += 1) {
      const frame = path.join(bundleDir, 'frames', `${spec.state}-${index}.png`);
      args.push(frame, '-geometry', `+${index * cellWidth}+${spec.row * cellHeight}`, '-composite');
    }
  }
  args.push(output);
  await execFileAsync('magick', args);
}
