/**
 * Centralized prompt builder for image generation.
 * Encodes mode (sketch vs vector), use case, tone, and background.
 */

export type Mode = 'sketch_restyle' | 'autoshape' | 'figma_vectorize' | 'photoreal' | 'kawaii_illustration';
export type UseCase = '資料図' | 'Webサイト' | 'アプリUI' | 'プレゼン背景';
export type Tone = 'フォーマル' | 'スタイリッシュ' | 'サイバー' | 'ポップ';

export interface PromptOpts {
  mode: Mode;
  useCase: UseCase;
  tone: Tone;
  content?: string; // user scene description
}

const modeBlock = (mode: Mode) => {
  switch (mode) {
    case 'sketch_restyle':
      return [
        'Redraw the provided sketch from scratch in a clean, hand-drawn style.',
        'Treat the input image as a wireframe only: do not reuse or stylize any original pixels.',
        'Remove paper texture, pencil grain, scanning artifacts, jitter, and wobble.',
        'Use smooth, pleasant stroke variation and minimal shading. Keep readability first.',
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

export function buildPrompt(o: PromptOpts) {
  const bg = 'Background must be perfectly pure white (RGB 255,255,255), flat, without gradients or textures.';

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
    }
  })();

  const content = o.content?.trim()
    ? `Content: ${o.content.trim()}`
    : defaultContent;

  return [
    modeBlock(o.mode),
    useCaseBlock(o.useCase),
    toneBlock(o.tone),
    bg,
    content,
    negative,
  ].filter(Boolean).join('\n');
}
