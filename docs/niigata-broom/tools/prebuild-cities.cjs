// 主要都市の地図を前もって作り、data/cities/<市区町村コード>.bin.gz に書き出す
// 使い方: docs/ で `python3 -m http.server 8765` を起動してから
//   node tools/prebuild-cities.cjs [Playwright の playwright-core のパス] [Chromium の実行ファイル]
// OpenFreeMap の決まり（自動で取得するときは 3,000 タイル以内・同時 4 本まで・アプリが分かる User-Agent）に合わせ、
// 都市は 1 つずつ順番に作る（1 都市あたり地図タイル 9〜16 枚）。
const fs = require('fs'), path = require('path');
const PW = process.argv[2] || require.resolve('playwright-core');
const EXE = process.argv[3];
const { chromium } = require(PW);
const OUT = path.join(__dirname, '..', 'data', 'cities');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: EXE, args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ userAgent: 'houki-nippon-prebuild/1.0 (+https://github.com/kazuph/vibe-coding-apps)' });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('[pageerror]', e.message));
  await p.goto('http://127.0.0.1:8765/niigata-broom/'); await p.waitForFunction(() => window.__app, null, { timeout: 120000 });
  const codes = await p.evaluate(async () => (await import('/niigata-broom/js/cities.js')).CITIES.map(c => c.code));
  for (const code of codes.filter(c => !process.env.ONLY || process.env.ONLY.split(',').includes(c))) {
    const r = await p.evaluate(async (code) => {
      const { CITIES, packRegion } = await import('/niigata-broom/js/cities.js');
      const { generate } = await import('/niigata-broom/js/gen.js');
      const c = CITIES.find(x => x.code === code), t0 = performance.now();
      const found = window.__app.japan.find(c.lat, c.lon);
      const { grid, defs } = await generate({ lat: c.lat, lon: c.lon, name: c.name });
      const gz = await packRegion(grid, defs);
      let s = ''; for (let i = 0; i < gz.length; i += 0x8000) s += String.fromCharCode(...gz.subarray(i, i + 0x8000));
      return { b64: btoa(s), ms: Math.round(performance.now() - t0), muniOk: found?.code === c.code, foundName: found?.name, rings: defs.points.length + defs.chains.reduce((a, x) => a + x.way.length, 0) + defs.loops.length * 8, names: defs.points.slice(0, 6).map(x => x.name) };
    }, code);
    fs.writeFileSync(path.join(OUT, `${code}.bin.gz`), Buffer.from(r.b64, 'base64'));
    console.log(code, `${r.ms}ms`, `${Math.round(Buffer.from(r.b64, 'base64').length / 1024)}KB`, '市区町村の判定', r.muniOk ? 'OK' : `NG(${r.foundName})`, 'リング', r.rings, r.names.join('・'));
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
