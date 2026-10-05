import http from 'node:http';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { VIDEO_ID, VIDEO_TITLE, VIDEO_DURATION, parseTranscript, fingerprint } from './core.mjs';

import { analyzeConcepts } from './concepts.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const transcript = await readFile(`${root}data/${VIDEO_ID}.en.txt`, 'utf8').catch(() => '');
const cues = transcript ? parseTranscript(transcript) : [];
const revision = fingerprint(transcript + await readFile(`${root}concepts.mjs`, 'utf8') + await readFile(`${root}core.mjs`, 'utf8'));
const cacheFile = `${root}.data/${revision}.json`;
await mkdir(`${root}.data`, { recursive: true });
const records = new Map(JSON.parse(await readFile(cacheFile, 'utf8').catch(() => '[]')).map(r => [r.id, r]));
const inflight = new Map();
let analyzing = Promise.resolve();
const translations = JSON.parse(await readFile(`${root}.data/${fingerprint(transcript)}.translations.json`, 'utf8').catch(() => '{}'));
let saving = Promise.resolve();
function save() {
  const content = JSON.stringify([...records.values()].sort((a, b) => a.id - b.id));
  saving = saving.then(async () => {
    await writeFile(`${cacheFile}.tmp`, content, { mode: 0o600 });
    await rename(`${cacheFile}.tmp`, cacheFile);
  });
  return saving;
}
async function diagram(id, japanese) {
  const previous = [...records.values()].filter(r => r.id < id).sort((a,b)=>a.id-b.id);
  const record = await analyzeConcepts(cues[id], japanese, previous);
  records.set(id, record);
  await save();
  return record;
}
const assets = new Map([
  ['/story', ['public/story.html', 'text/html']], ['/story.js', ['public/story.js', 'text/javascript']], ['/story.css', ['public/story.css', 'text/css']], ['/story-model.js', ['public/story-model.js', 'text/javascript']],
  ['/', ['public/index.html', 'text/html']], ['/app.js', ['public/app.js', 'text/javascript']],
  ['/model.js', ['public/model.js', 'text/javascript']], ['/style.css', ['public/style.css', 'text/css']], ['/timeline.js', ['public/timeline.js', 'text/javascript']],
  ['/layout-base.js', ['node_modules/layout-base/layout-base.js', 'text/javascript']],
  ['/cose-base.js', ['node_modules/cose-base/cose-base.js', 'text/javascript']],
  ['/fcose.js', ['node_modules/cytoscape-fcose/cytoscape-fcose.js', 'text/javascript']],
  ['/cytoscape.js', ['node_modules/cytoscape/dist/cytoscape.min.js', 'text/javascript']],
]);
const server = http.createServer(async (req, res) => {
  const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  try {
    const host = req.headers.host;
    const origin = `http://${host}`;
    if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host ?? '')) return send(403, { error: 'ローカル接続のみ受け付けます。' });
    if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: '別のサイトからの操作は受け付けません。' });
    if (req.method === 'GET' && req.url === '/api/story') {
      const story=JSON.parse(await readFile(`${root}public/story.json`,'utf8'));
      if(story.sourceFingerprint!==fingerprint(transcript))return send(409,{error:'図解と字幕の版が一致しません。'});
      const ids=new Set(story.events.flatMap(e=>e.refs));
      return send(200,{...story,sources:Object.fromEntries(cues.filter(c=>ids.has(c.id)).map(c=>[c.id,c]))});
    }
    if (req.method === 'GET' && req.url === '/api/video') return send(200, {
      videoId: VIDEO_ID, title: VIDEO_TITLE, duration: VIDEO_DURATION, revision, cues,
      records: [...records.values()], translations, configured: Boolean(process.env.JEV_API_KEY),
      error: cues.length ? null : '字幕データがありません。README の字幕取込手順を実行してサーバーを再起動してください。',
    });
    if (req.method === 'POST' && req.url === '/api/diagram') {
      if (req.headers.origin !== origin || req.headers['content-type'] !== 'application/json') return send(403, { error: '画面から操作してください。' });
      let body = '';
      for await (const chunk of req) body += chunk;
      const { id, japanese, revision: inputRevision } = JSON.parse(body);
      if (inputRevision !== revision || !Number.isInteger(id) || !cues[id] || typeof japanese !== 'string' || !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(japanese)) return send(400, { error: '対象の字幕と日本語訳を確認してください。' });
      if (records.has(id)) return send(200, records.get(id));
      if (!inflight.has(id)) {
        const pending = analyzing.then(() => records.get(id) ?? diagram(id, japanese));
        analyzing = pending.catch(() => {});
        inflight.set(id, pending.finally(() => inflight.delete(id)));
      }
      return send(200, await inflight.get(id));
    }
    const assetPath=new URL(req.url,'http://localhost').pathname;
    if (req.method === 'GET' && assets.has(assetPath)) {
      const [path, type] = assets.get(assetPath);
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Referrer-Policy': 'strict-origin-when-cross-origin' });
      return res.end(await readFile(root + path));
    }
    send(404, { error: 'ページがありません。' });
  } catch (error) { send(500, { error: error.message }); }
});
server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => console.log(`Jev Video: http://localhost:${server.address().port}`));
