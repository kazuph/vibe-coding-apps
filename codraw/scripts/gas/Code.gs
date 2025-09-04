/**
 * Google Apps Script Web App: Gemini image generation proxy
 *
 * Mirrors the Cloudflare Worker /api/generate contract:
 *  - Request (JSON): { imageDataUrl: string, prompt: string, historyDataUrls?: string[] }
 *  - Response (JSON): { imageDataUrl: string } on success; { error: string } on failure
 *
 * Configuration:
 *  - Set Script Property GEMINI_API_KEY (or GEMINI_API_TOKEN) with your Gemini API key.
 *  - Optional: Set Script Property SHARED_SECRET to a random value and send header 'X-Secret' from caller.
 */

/**
 * Handle POST / (Web App)
 * @param {GoogleAppsScript.Events.DoPost} e
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function doPost(e) {
  try {
    const apiKey = getApiKey_();
    // Allow bootstrap to set properties before key exists
    // Admin bootstrap: when no ACCESS_TOKEN/GAS_ACCESS_TOKEN is set yet, allow setting properties via body.__adminSetProps
    var bodyForBootstrap = safeParseBody_(e);
    var hasAuthProp = !!(getProp_('ACCESS_TOKEN') || getProp_('GAS_ACCESS_TOKEN'));
    if (!hasAuthProp && bodyForBootstrap && bodyForBootstrap.__adminSetProps && bodyForBootstrap.props && typeof bodyForBootstrap.props === 'object') {
      try {
        PropertiesService.getScriptProperties().setProperties(bodyForBootstrap.props, true);
        return json_(200, { ok: true, set: Object.keys(bodyForBootstrap.props) });
      } catch (se) {
        return json_(500, { error: String(se && se.message || se) });
      }
    }
    if (!apiKey) return json_(400, { error: 'Server config error: GEMINI_API_KEY is not set.' });

    // Token-based auth (recommended)
    // Caller should pass ?x_token=... (or body.token). Compare with Script Property ACCESS_TOKEN (or GAS_ACCESS_TOKEN)
    var requiredToken = getProp_('ACCESS_TOKEN') || getProp_('GAS_ACCESS_TOKEN');
    if (requiredToken) {
      var token = (e && e.parameter && e.parameter.x_token) ? e.parameter.x_token : '';
      if (!token) {
        try { var bodyTry = parseBody_(e); token = bodyTry && bodyTry.token ? String(bodyTry.token) : ''; } catch (_) {}
      }
      if (!token || token !== requiredToken) {
        return json_(401, { error: 'Unauthorized' });
      }
    }

    if (!e || !e.postData || !e.postData.contents) {
      return json_(400, { error: 'Missing request body' });
    }

    const body = bodyForBootstrap || parseBody_(e);
    const imageDataUrl = (body.imageDataUrl || '').toString();
    const prompt = (body.prompt || '').toString().trim();
    const historyDataUrls = Array.isArray(body.historyDataUrls) ? body.historyDataUrls : [];

    if (!imageDataUrl || !prompt) {
      return json_(400, { error: 'imageDataUrl and prompt are required' });
    }

    const main = parseDataUrl_(imageDataUrl);
    if (!main.base64) return json_(400, { error: 'Invalid image data' });

    const extraParts = historyDataUrls
      .map((u) => parseDataUrl_(u))
      .filter((p) => p.base64)
      .map((p) => ({ inline_data: { data: p.base64, mime_type: p.mimeType || 'image/png' } }));

    const parts = [
      { inline_data: { data: main.base64, mime_type: main.mimeType || 'image/png' } },
      ...extraParts,
      { text: prompt },
    ];

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent';
    const payload = { contents: [{ parts }] };

    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const status = res.getResponseCode();
    const text = res.getContentText();
    if (status < 200 || status >= 300) {
      // Try to surface backend error message
      try {
        const err = JSON.parse(text);
        const msg = err?.error?.message || err?.message || text;
        return json_(status, { error: msg });
      } catch (_) {
        return json_(status, { error: text || 'Generation failed' });
      }
    }

    const data = JSON.parse(text);
    const partsOut = (((data || {}).candidates || [])[0] || {}).content?.parts || [];
    for (var i = 0; i < partsOut.length; i++) {
      var part = partsOut[i];
      if (part && part.inlineData && part.inlineData.data) {
        var mime = part.inlineData.mimeType || 'image/png';
        var outUrl = 'data:' + mime + ';base64,' + part.inlineData.data;
        return json_(200, { imageDataUrl: outUrl });
      }
    }
    return json_(502, { error: 'No image returned by the model' });
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    return json_(500, { error: msg });
  }
}

// ---- Helpers ----

function parseBody_(e) {
  if (e?.postData?.type && e.postData.type.indexOf('application/json') !== -1) {
    return JSON.parse(e.postData.contents);
  }
  // Fallback: attempt to parse as querystring form
  try {
    return JSON.parse(e.postData.contents);
  } catch (_) {
    const obj = {};
    const qs = String(e.postData.contents || '');
    qs.split('&').forEach((kv) => {
      const [k, v] = kv.split('=');
      if (k) obj[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return obj;
  }
}

function safeParseBody_(e) {
  try { return parseBody_(e); } catch (_) { return null; }
}

function parseDataUrl_(input) {
  if (!input) return { base64: '', mimeType: '' };
  const s = String(input);
  if (s.startsWith('data:')) {
    const comma = s.indexOf(',');
    const meta = s.slice(5, comma >= 0 ? comma : undefined);
    const base64 = comma >= 0 ? s.slice(comma + 1) : '';
    const semi = meta.indexOf(';');
    const mimeType = semi >= 0 ? meta.slice(0, semi) : meta || 'image/png';
    return { base64, mimeType };
  }
  // raw base64, assume PNG
  return { base64: s, mimeType: 'image/png' };
}

function getApiKey_() {
  return getProp_('GEMINI_API_KEY') || getProp_('GEMINI_API_TOKEN');
}

function getProp_(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key) || '';
  } catch (_) {
    return '';
  }
}

function tryParseHeader_(e, name) {
  try {
    // Apps Script does not provide raw headers; allow passing via query param fallback (x_secret)
    return '';
  } catch (_) {
    return '';
  }
}

function json_(status, obj) {
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  // Note: Apps Script Web Apps do not support setting arbitrary headers such as CORS.
  // This endpoint is intended for server-to-server use from Cloudflare Workers.
  return out;
}

/**
 * Utilities for CLI automation via `clasp run`
 */
function setPropsFromJson(json) {
  try {
    var obj = JSON.parse(String(json || '{}'));
    if (obj && typeof obj === 'object') {
      PropertiesService.getScriptProperties().setProperties(obj, true);
      return { ok: true, keys: Object.keys(obj) };
    }
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
  return { ok: false, error: 'Invalid JSON' };
}

function getWebAppUrl() {
  // Returns the URL of the latest deployment accessible by the caller, if any
  return { url: ScriptApp.getService().getUrl() };
}
/**
 * Minimal GET handler for bootstrap only (no token set yet).
 * Allows setting props via query when no ACCESS_TOKEN is defined.
 */
function doGet(e) {
  try {
    var hasAuthProp = !!(getProp_('ACCESS_TOKEN') || getProp_('GAS_ACCESS_TOKEN'));
    if (!hasAuthProp && e && e.parameter && e.parameter.__adminSetProps) {
      var props = {};
      if (e.parameter.t) props.ACCESS_TOKEN = String(e.parameter.t);
      if (e.parameter.g) props.GEMINI_API_KEY = String(e.parameter.g);
      PropertiesService.getScriptProperties().setProperties(props, true);
      return json_(200, { ok: true, set: Object.keys(props) });
    }
    return json_(405, { error: 'Method not allowed' });
  } catch (err) {
    return json_(500, { error: String(err && err.message || err) });
  }
}
