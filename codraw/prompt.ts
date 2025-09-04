/**
 * Centralized prompt builder for image generation.
 * Encodes mode (style), use case, tone, and background.
 *
 * Note: This file is used by the frontend to generate a single
 * string prompt that we pass to the backend as-is.
 */

export type Mode =
  | 'pencil_sketch'
  | 'autoshape'
  | 'figma_vectorize'
  | 'photoreal'
  | 'kawaii_illustration'
  | '3d_cg';

export type UseCase = '資料図' | 'Webサイト' | 'アプリUI' | 'プレゼン背景';
export type Tone = 'フォーマル' | 'スタイリッシュ' | 'サイバー' | 'ポップ';
export type Background = 'default' | 'white' | 'transparent';

export interface PromptOpts {
  mode?: Mode | null;
  useCase?: UseCase | null;
  tone?: Tone | null;
  background?: Background;
  content?: string; // user scene description
}

const modeBlock = (mode: Mode) => {
  switch (mode) {
    case 'pencil_sketch':
      return [
        'Redraw the provided sketch cleanly in a tidy, hand-drawn pencil style.',
        'Treat the input only as composition guidance; do not reuse original pixels.',
        'Remove paper texture, scanning artifacts, and jitter while preserving a sketched feel.',
        'Use smooth strokes with subtle variation and minimal shading for clarity.',
      ].join(' ');
    case 'autoshape':
      return [
        'Rebuild the sketch as a clean professional diagram using crisp auto-shapes.',
        'Reconstruct everything with precise vector primitives (rectangles, circles, arrows, connectors) with uniform stroke widths.',
        'Completely ignore and replace all hand-drawn lines. No hand-drawn effect, no pencil texture.',
      ].join(' ');
    case 'figma_vectorize':
      return [
        'Redraw in a Figma-style vector design suitable for modern web/UI.',
        'Reconstruct with geometric shapes, consistent spacing on an 8px base, and a 12-column layout grid where applicable.',
        'Use solid fills, minimal gradients, and sharp SVG-like edges. Replace all original strokes with crisp vector geometry and text.',
      ].join(' ');
    case 'photoreal':
      return [
        'Redraw as a photorealistic diagram with believable materials, lighting, and soft shadows.',
        'Avoid black illustrative outlines; depict objects without line art while keeping the composition readable.',
      ].join(' ');
    case 'kawaii_illustration':
      return [
        'Redraw as a cute, kawaii-style flat illustration suitable for stickers or friendly web visuals.',
        'Use rounded shapes, simplified forms, bold clean outlines, and simple cel-shading.',
        'Keep expressions friendly and approachable; avoid gritty textures or realism.',
      ].join(' ');
    case '3d_cg':
      return [
        'Recreate the sketch as a clean 3D CG render.',
        'Use simple materials, soft global illumination, and subtle shadows; avoid noisy textures.',
        'Maintain clear readability and composition from the input while using 3D form.',
      ].join(' ');
  }
};

const useCaseBlock = (useCase: UseCase) => {
  switch (useCase) {
    case '資料図':
      return 'Prioritize clarity for documents/slides: thin lines, clear labels/legends/arrows, print-safe contrast.';
    case 'Webサイト':
      return 'Layout for a website hero/section: headline, body, CTA, cards/icons; consistent spacing and alignment.';
    case 'アプリUI':
      return 'Compose as app UI components: app bar, lists/cards/forms, buttons; platform-agnostic, legible hierarchy.';
    case 'プレゼン背景':
      return 'Create a minimal background with ample negative space for overlaid text; avoid busy textures.';
  }
};

// Mode-aware variants to prevent style conflicts, especially for hand-drawn mode.
const useCaseBlockForMode = (mode: Mode | null | undefined, useCase?: UseCase | null) => {
  if (!useCase) return undefined;
  if (mode === 'pencil_sketch') {
    switch (useCase) {
      case '資料図':
        return 'Keep a clean hand-drawn look (no vectorization). Use readable handwritten-style labels, simple arrows, and thin strokes. Emphasize clarity without snapping to perfect geometry.';
      case 'Webサイト':
        return 'Hand-drawn hero/sections: headings and simple icons in a neat sketched style. Maintain alignment loosely, but do NOT convert to crisp vector UI blocks.';
      case 'アプリUI':
        return 'Represent UI as sketched wireframes with hand-drawn components. Avoid precise pixel-perfect vector shapes; preserve the sketch aesthetic.';
      case 'プレゼン背景':
        return 'Light hand-drawn elements with generous negative space for overlay text. Keep textures minimal, preserve sketched strokes.';
    }
  }
  return useCaseBlock(useCase);
};

const toneBlock = (tone: Tone) => {
  switch (tone) {
    case 'フォーマル':
      return 'Formal tone: high contrast, restrained saturation, thin strokes, generous margins, minimal decoration.';
    case 'スタイリッシュ':
      return 'Stylish tone: bold headings, confident whitespace, few accent colors, modern minimal aesthetic.';
    case 'サイバー':
      return 'Cyber tone: dark base, neon accents, geometric patterns, strong contrast, small corner radii.';
    case 'ポップ':
      return 'Pop tone: vivid colors, thicker lines, rounded shapes, friendly approachable look.';
  }
};

const toneBlockForMode = (mode: Mode | null | undefined, tone?: Tone | null) => {
  if (!tone) return undefined;
  if (mode === 'pencil_sketch') {
    switch (tone) {
      case 'フォーマル':
        return 'Formal but hand-drawn: keep tidy handwritten strokes, reduced wobble, minimal texture; absolutely no vector auto-shapes.';
      case 'スタイリッシュ':
        return 'Stylish but hand-drawn: confident sketched lines, sparse accents; do NOT convert to sharp geometric vector graphics.';
      case 'サイバー':
        return 'Cyber mood as sketched motifs (simple neon-like accents), yet preserve the hand-drawn style and avoid precise vector geometry.';
      case 'ポップ':
        return 'Pop and friendly in a sketched style: rounded hand-drawn strokes and simple fills; avoid vector-clean outlines.';
    }
  }
  return toneBlock(tone);
};

function backgroundBlock(bg?: Background) {
  switch (bg) {
    case 'white':
      return 'Background: perfectly pure white (RGB 255,255,255), flat, no gradients or textures.';
    case 'transparent':
      return 'Background: fully transparent with no texture or drop shadow; ensure clean alpha where empty.';
    default:
      return undefined; // leave unspecified
  }
}

export function buildPrompt(o: PromptOpts) {
  const negative = 'Negative: do not leave any original scan artifacts, paper creases, pencil noise, photo depth-of-field effects, or heavy textures.';

  const defaultContent = (() => {
    switch (o.useCase) {
      case '資料図':
        return 'Content: Convert the sketch into a clear document/slide diagram. Preserve topology and relationships; standardize arrows and connectors; align and distribute nodes; convert all handwriting into clean labels (Noto Sans JP).';
      case 'Webサイト':
        return 'Content: Convert the sketch into a website section layout (hero with headline, supporting body text, CTA button, and 2–3 feature cards). Maintain consistent spacing and hierarchy.';
      case 'アプリUI':
        return 'Content: Convert the sketch into modern app UI components (app bar, list/cards/forms, primary/secondary buttons). Ensure legible typographic hierarchy and hit targets.';
      case 'プレゼン背景':
        return 'Content: Produce a minimal presentation background from the sketch structure, with generous negative space for overlaid text and unobtrusive decorative geometry only.';
      default:
        return 'Content: Use the input sketch composition and redraw under the above constraints, prioritizing readability and simplicity.';
    }
  })();

  const content = o.content?.trim()
    ? `Content: ${o.content.trim()}`
    : defaultContent;

  return [
    o.mode ? modeBlock(o.mode) : undefined,
    useCaseBlockForMode(o.mode, o.useCase),
    toneBlockForMode(o.mode, o.tone),
    backgroundBlock(o.background),
    content,
    o.mode === 'pencil_sketch'
      ? `${negative} Do not vectorize or replace strokes with perfectly crisp geometric shapes.`
      : negative,
  ].filter(Boolean).join('\n');
}
