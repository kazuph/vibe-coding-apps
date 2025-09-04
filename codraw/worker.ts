import { Hono } from 'hono';
import { GoogleGenAI, Modality } from '@google/genai';

interface Env {
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
  GEMINI_API_TOKEN?: string;
  BASIC_AUTH_PASSWORD: string;
  // Optional: GAS fallback endpoint when Google API rejects by region
  GAS_FALLBACK_URL?: string; // e.g. deployed Apps Script Web App URL
  GAS_SHARED_SECRET?: string; // deprecated; prefer GAS_ACCESS_TOKEN
  GAS_ACCESS_TOKEN?: string; // token sent as x_token for GAS auth
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
  // In local dev without BASIC_AUTH_PASSWORD, skip auth
  if (!c.env.BASIC_AUTH_PASSWORD) {
    await next();
    return;
  }
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
  type ReqBody = { imageDataUrl?: string; prompt?: string; historyDataUrls?: string[] };
  const body = (await c.req.json().catch(() => ({}))) as ReqBody;
  const imageDataUrl = body.imageDataUrl || '';
  const prompt = (body.prompt || '').trim();
  const historyDataUrls = Array.isArray(body.historyDataUrls) ? body.historyDataUrls : [];

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

  // Optional: translate non-English prompt to English for best image fidelity
  let effectivePrompt = prompt;
  try {
    const hasNonAscii = /[^\x00-\x7F]/.test(prompt);
    if (hasNonAscii) {
      const translate = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [{ parts: [{
          text: 'Translate the following user instruction into natural, professional English suitable for an image generation prompt. Preserve technical terms and formatting. Return only the translated text without any explanations.'
        }, { text: prompt }]}],
      });
      const t = translate.candidates?.[0]?.content?.parts?.map(p => ('text' in p ? (p as any).text : '')).join('')?.trim();
      if (t) effectivePrompt = t;
    }
  } catch (e) {
    // Fall back to original prompt on any translation error
  }

  const imagePart = { inlineData: { data: base64, mimeType: 'image/png' } } as const;
  const extraImageParts = historyDataUrls
    .map((u) => (u && u.includes(',') ? u.split(',')[1] : ''))
    .filter((b64) => !!b64)
    .map((b64) => ({ inlineData: { data: b64, mimeType: 'image/png' } } as const));
  const textPart = { text: effectivePrompt } as const;

  // Helper to try direct Gemini call
  const callDirect = async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image-preview',
      contents: [{ parts: [imagePart, ...extraImageParts, textPart] }],
      config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if ('inlineData' in part && (part as any).inlineData?.data) {
        const out = `data:image/png;base64,${(part as any).inlineData.data}`;
        return { ok: true as const, imageDataUrl: out };
      }
    }
    throw new Error('No image returned by the model');
  };

  // Helper to call GAS fallback
  const callGAS = async () => {
    const url = c.env.GAS_FALLBACK_URL;
    if (!url) throw new Error('GAS_FALLBACK_URL is not configured');
    const payload = {
      imageDataUrl,
      prompt: effectivePrompt,
      historyDataUrls,
    };
    const params: string[] = [];
    if (c.env.GAS_ACCESS_TOKEN) params.push(`x_token=${encodeURIComponent(c.env.GAS_ACCESS_TOKEN)}`);
    else if (c.env.GAS_SHARED_SECRET) params.push(`x_secret=${encodeURIComponent(c.env.GAS_SHARED_SECRET)}`);
    const qs = params.length ? `?${params.join('&')}` : '';
    const res = await fetch(url + qs, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      const msg = (data && data.error) ? data.error : `GAS error: ${res.status}`;
      throw new Error(msg);
    }
    if (data?.imageDataUrl) return { ok: true as const, imageDataUrl: data.imageDataUrl };
    throw new Error('GAS returned no image');
  };

  try {
    const direct = await callDirect();
    return c.json({ imageDataUrl: direct.imageDataUrl });
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isRegionError = /location is not supported/i.test(msg) || /FAILED_PRECONDITION/i.test(msg);
    const hasFallback = !!c.env.GAS_FALLBACK_URL;
    if (isRegionError && hasFallback) {
      try {
        const viaGas = await callGAS();
        return c.json({ imageDataUrl: viaGas.imageDataUrl });
      } catch (e2: any) {
        return c.json({ error: e2?.message || 'Fallback generation failed' }, 502);
      }
    }
    return c.json({ error: msg || 'Generation failed' }, 500);
  }
});

// After auth, route API first, then fall back to static assets
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
};
