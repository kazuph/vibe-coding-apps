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
  GAS_ACCESS_TOKEN?: string; // token sent in body as 'token' for GAS auth
  // OpenRouter (primary) for free Gemini image model
  OPENROUTER_API_KEY?: string;
  OPENROUTER_SITE_URL?: string;   // optional HTTP-Referer for rankings
  OPENROUTER_SITE_NAME?: string;  // optional X-Title for rankings
  OPENROUTER_MODEL?: string;      // optional override (defaults to free preview model)
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

  // Extract base64 payload and mime type from data URL
  const urlParts = imageDataUrl.split(',', 2);
  const headerPart = urlParts[0] || '';
  const base64 = urlParts[1] || '';
  const mimeMatch = /data:([^;]+);base64/.exec(headerPart);
  const mimeType = (mimeMatch?.[1] || 'image/png') as 'image/png' | 'image/jpeg' | 'image/webp' | string;
  if (!base64) return c.json({ error: 'Invalid image data' }, 400);

  const apiKey = c.env.GEMINI_API_KEY || c.env.GEMINI_API_TOKEN;
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

  // Optional: translate non-English prompt to English for best image fidelity
  let effectivePrompt = prompt;
  try {
    const hasNonAscii = /[^\x00-\x7F]/.test(prompt);
    if (hasNonAscii && ai) {
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

  const imagePart = { inlineData: { data: base64, mimeType } } as const;
  const extraImageParts = historyDataUrls
    .map((u) => {
      const p = (u || '').split(',', 2);
      const h = p[0] || '';
      const b = p[1] || '';
      const m = /data:([^;]+);base64/.exec(h)?.[1] || mimeType;
      return { b, m };
    })
    .filter(({ b }) => !!b)
    .map(({ b, m }) => ({ inlineData: { data: b, mimeType: m } } as const));
  const textPart = { text: effectivePrompt } as const;

  // Helper to call OpenRouter (primary)
  const callOpenRouter = async () => {
    const key = c.env.OPENROUTER_API_KEY;
    if (!key) throw new Error('OpenRouter is not configured');
    const model = c.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-image-preview:free';
    const messages: any[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: effectivePrompt },
          { type: 'image_url', image_url: { url: imageDataUrl } },
          ...historyDataUrls
            .filter((u) => !!u)
            .map((u) => ({ type: 'image_url', image_url: { url: u } })),
        ],
      },
    ];
    const headers: Record<string, string> = {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    };
    if (c.env.OPENROUTER_SITE_URL) headers['HTTP-Referer'] = c.env.OPENROUTER_SITE_URL;
    if (c.env.OPENROUTER_SITE_NAME) headers['X-Title'] = c.env.OPENROUTER_SITE_NAME;

    const payload = {
      model,
      messages,
      // Request image output from models that support image generation via chat
      modalities: [Modality.IMAGE, Modality.TEXT].map((m) => (m === Modality.IMAGE ? 'image' : 'text')),
    };

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) {
      const msg = data?.error?.message || data?.error || `OpenRouter error: ${res.status}`;
      throw new Error(msg);
    }
    const choice = data?.choices?.[0];
    const message = choice?.message;
    const content = message?.content;
    let dataUrl: string | undefined;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (part?.type === 'image_url' && part?.image_url?.url?.startsWith('data:image/')) {
          dataUrl = part.image_url.url;
          break;
        }
        // Some providers may return base64 under different keys; accept plain string if it looks like data URL
        if (typeof part === 'string' && part.startsWith('data:image/')) {
          dataUrl = part;
          break;
        }
      }
    } else if (typeof content === 'string' && content.startsWith('data:image/')) {
      dataUrl = content;
    }
    if (!dataUrl) throw new Error('OpenRouter returned no image');
    return { ok: true as const, imageDataUrl: dataUrl };
  };

  // Helper to try direct Gemini call
  const callDirect = async () => {
    if (!ai) throw new Error('Google API key is not configured');
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
    const payload: Record<string, any> = {
      imageDataUrl,
      prompt: effectivePrompt,
      historyDataUrls,
    };
    // GAS Web Apps cannot read custom headers reliably; pass token in body
    if (c.env.GAS_ACCESS_TOKEN) payload.token = c.env.GAS_ACCESS_TOKEN;
    else if (c.env.GAS_SHARED_SECRET) payload.token = c.env.GAS_SHARED_SECRET;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    const text = await res.text();
    let data: any = {};
    try { data = JSON.parse(text); } catch {}
    // Apps Script Web Apps often always return 200; surface error field if present
    if (!res.ok || (data && data.error)) {
      const msg = (data && data.error) ? data.error : `GAS error: ${res.status}`;
      throw new Error(msg);
    }
    if (data?.imageDataUrl) return { ok: true as const, imageDataUrl: data.imageDataUrl };
    throw new Error('GAS returned no image');
  };

  const prevErrors: Array<{ from: 'openrouter' | 'workers'; message: string }> = [];
  try {
    // 1) Try OpenRouter (free)
    const viaOpenRouter = await callOpenRouter();
    console.info('[generate] succeeded via openrouter');
    return c.json({ imageDataUrl: viaOpenRouter.imageDataUrl, provider: 'openrouter' as const, prevErrors });
  } catch (err: any) {
    const pe = { from: 'openrouter' as const, message: String(err?.message || err) };
    prevErrors.push(pe);
    console.warn('[generate] openrouter failed:', pe.message);
    // 2) Fallback to direct Gemini via Google API
    try {
      const direct = await callDirect();
      console.info('[generate] fallback succeeded via workers after openrouter failure');
      return c.json({ imageDataUrl: direct.imageDataUrl, provider: 'workers' as const, prevErrors });
    } catch (err2: any) {
      const msg2 = String(err2?.message || err2);
      const pe2 = { from: 'workers' as const, message: msg2 };
      prevErrors.push(pe2);
      console.warn('[generate] workers failed:', msg2);
      const isRegionError = /location is not supported/i.test(msg2) || /FAILED_PRECONDITION/i.test(msg2);
      const hasFallback = !!c.env.GAS_FALLBACK_URL;
      if (hasFallback && (isRegionError || true)) {
        try {
          // 3) Fallback to GAS web app
          const viaGas = await callGAS();
          console.info('[generate] fallback succeeded via gas after workers failure');
          if (prevErrors.length) {
            console.info('[generate] previous errors:', prevErrors.map(e => `${e.from}: ${e.message}`).join(' | '));
          }
          return c.json({ imageDataUrl: viaGas.imageDataUrl, provider: 'gas' as const, prevErrors });
        } catch (e2: any) {
          const m3 = String(e2?.message || 'Fallback generation failed');
          console.error('[generate] gas failed:', m3);
          if (prevErrors.length) {
            console.info('[generate] previous errors:', prevErrors.map(e => `${e.from}: ${e.message}`).join(' | '));
          }
          return c.json({ error: m3, provider: 'gas' as const, prevErrors }, 502);
        }
      }
      console.error('[generate] generation failed without gas fallback:', msg2);
      return c.json({ error: msg2 || 'Generation failed', provider: 'workers' as const, prevErrors }, 500);
    }
  }
});

// After auth, route API first, then fall back to static assets
app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
};
