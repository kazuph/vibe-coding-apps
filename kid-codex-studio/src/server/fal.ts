import fs from 'node:fs/promises';
import path from 'node:path';
import { timestampId, videosDir } from './paths.js';

type FalResult = {
  video?: { url?: string };
  videos?: Array<{ url?: string }>;
  url?: string;
};

const seedanceTextEndpoint = 'https://fal.run/bytedance/seedance-2.0/fast/text-to-video';
const seedanceReferenceEndpoint = 'https://fal.run/bytedance/seedance-2.0/fast/reference-to-video';
const supportedReferenceExts = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function resultUrl(data: FalResult) {
  return data.video?.url ?? data.videos?.[0]?.url ?? data.url ?? null;
}

export async function generateSeedanceVideo(prompt: string, referencePaths: string[] = []) {
  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error('FAL_KEY is not configured on the local server.');
  }
  const imageUrls = await Promise.all(referencePaths.slice(0, 9).map((filePath) => localImageToDataUri(filePath)));
  const usableImageUrls = imageUrls.filter(Boolean) as string[];
  const referencePrompt =
    usableImageUrls.length > 0
      ? `${prompt}\n\nCreate a complete 15-second child-safe story with kishotenketsu: 0-3s introduction, 3-7s development, 7-12s twist or change, 12-15s satisfying ending. Include synchronized audio in Japanese by default: Japanese child-friendly narration, Japanese character voice lines or cheering, ambient sound, action sounds, and gentle expressive sound. Do not use English speech unless the user explicitly asks for it.\n\nUse the selected reference images for the main subject, style, colors, and identity. Refer to them explicitly as ${usableImageUrls
          .map((_, index) => `@Image${index + 1}`)
          .join(', ')}. Do not replace the subject with unrelated copyrighted movie or theme-park characters.`
      : `${prompt}\n\nCreate a complete 15-second child-safe story with kishotenketsu: 0-3s introduction, 3-7s development, 7-12s twist or change, 12-15s satisfying ending. Include synchronized audio in Japanese by default: Japanese child-friendly narration, Japanese character voice lines or cheering, ambient sound, action sounds, and gentle expressive sound. Do not use English speech unless the user explicitly asks for it.`;

  const body: Record<string, unknown> = {
    prompt: referencePrompt,
    resolution: '480p',
    duration: '15',
    aspect_ratio: 'auto',
    generate_audio: true
  };
  if (usableImageUrls.length > 0) body.image_urls = usableImageUrls;

  const endpoint = usableImageUrls.length > 0 ? seedanceReferenceEndpoint : seedanceTextEndpoint;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`fal.ai Seedance failed: ${res.status} ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as FalResult;
  const remoteUrl = resultUrl(data);
  if (!remoteUrl) {
    throw new Error('fal.ai did not return a video URL.');
  }

  const video = await fetch(remoteUrl);
  if (!video.ok) {
    throw new Error(`Could not download fal.ai video: ${video.status}`);
  }

  const id = timestampId('video');
  const filePath = path.join(videosDir, `${id}.mp4`);
  const buffer = Buffer.from(await video.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return { id, filePath, remoteUrl };
}

async function localImageToDataUri(filePath: string) {
  const resolvedPath = await resolveReferenceImagePath(filePath);
  if (!resolvedPath) return null;
  const ext = path.extname(resolvedPath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
  const buffer = await fs.readFile(resolvedPath);
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function resolveReferenceImagePath(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (supportedReferenceExts.has(ext) && (await exists(filePath))) return filePath;

  const dir = path.dirname(filePath);
  const candidates = [
    path.join(dir, 'frames', 'idle-0.png'),
    path.join(dir, 'spritesheet.webp'),
    path.join(dir, 'spritesheet.png'),
    path.join(dir, 'row-00-idle.png')
  ];
  for (const candidate of candidates) {
    if (supportedReferenceExts.has(path.extname(candidate).toLowerCase()) && (await exists(candidate))) return candidate;
  }
  return null;
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
