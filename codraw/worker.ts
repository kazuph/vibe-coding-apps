import { Hono } from 'hono';
import { GoogleGenAI, Modality } from '@google/genai';

interface Env {
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  GEMINI_API_TOKEN?: string;
  BASIC_AUTH_PASSWORD: string;
}

// Constant‑time string comparison
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let res = 0;
  for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return res === 0;
}

const app = new Hono<{ Bindings: Env }>();

// Basic Auth for all routes (including static assets)
app.use('*', async (c, next) => {
  const header = c.req.header('Authorization');
  const realm = 'Restricted';
  if (!header || !header.startsWith('Basic ')) {
    return c.text('Unauthorized', 401, { 'WWW-Authenticate': `Basic realm="${realm}"` });
  }
  try {
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(':');
    const username = sep >= 0 ? decoded.slice(0, sep) : decoded;
    const password = sep >= 0 ? decoded.slice(sep + 1) : '';
    if (username !== 'kazuph' || !safeEqual(password, c.env.BASIC_AUTH_PASSWORD)) {
      return c.text('Unauthorized', 401, { 'WWW-Authenticate': `Basic realm="${realm}"` });
    }
  } catch {
    return c.text('Unauthorized', 401, { 'WWW-Authenticate': `Basic realm="${realm}"` });
  }
  await next();
});

app.post('/api/generate', async (c) => {
  type ReqBody = { imageDataUrl?: string; prompt?: string };
  const body = (await c.req.json().catch(() => ({}))) as ReqBody;
  const imageDataUrl = body.imageDataUrl || '';
  const prompt = (body.prompt || '').trim();

  if (!imageDataUrl || !prompt) {
    return c.json({ error: 'imageDataUrl and prompt are required' }, 400);
  }

  const base64 = imageDataUrl.includes(',') ? imageDataUrl.split(',')[1] : imageDataUrl;
  if (!base64) return c.json({ error: 'Invalid image data' }, 400);

  const apiKey = c.env.GEMINI_API_KEY || c.env.GEMINI_API_TOKEN;
  if (!apiKey) {
    return c.json({ error: 'Server config error: GEMINI_API_KEY (or GEMINI_API_TOKEN) is not set.' }, 500);
  }
  const ai = new GoogleGenAI({ apiKey });

  const imagePart = { inlineData: { data: base64, mimeType: 'image/png' } } as const;
  const BG_SUFFIX_WHITE = ' Ensure the background is perfectly pure white (RGB 255,255,255) with no gradients or textures.';
  const finalPrompt = `${prompt}${BG_SUFFIX_WHITE}`;
  const textPart = { text: finalPrompt } as const;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: [{ parts: [imagePart, textPart] }],
      config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if ('inlineData' in part && part.inlineData?.data) {
        const out = `data:image/png;base64,${part.inlineData.data}`;
        return c.json({ imageDataUrl: out });
      }
    }
    return c.json({ error: 'No image returned by the model' }, 502);
  } catch (e: any) {
    return c.json({ error: e?.message || 'Generation failed' }, 500);
  }
});

// After auth, route API first, then fall back to static assets
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
};
