// 作り置きの主要都市（tools/prebuild-cities.cjs で、自動生成と同じ仕組みで前もって作り、data/cities/ に置いた地図）
// ここに載っている都市は、遊ぶときに外部の地図サーバー・標高サーバーへ問い合わせない
export const CITIES = [
  { code: '01101', name: '札幌市中央区', pref: '北海道', lat: 43.0618, lon: 141.3545, label: '札幌（大通・札幌駅）' },
  { code: '04101', name: '仙台市青葉区', pref: '宮城県', lat: 38.2601, lon: 140.8780, label: '仙台（仙台駅・一番町）' },
  { code: '13101', name: '千代田区', pref: '東京都', lat: 35.6835, lon: 139.7610, label: '東京（皇居・東京駅）' },
  { code: '14104', name: '横浜市中区', pref: '神奈川県', lat: 35.4478, lon: 139.6380, label: '横浜（関内・みなとみらい）' },
  { code: '23106', name: '名古屋市中区', pref: '愛知県', lat: 35.1681, lon: 136.9020, label: '名古屋（栄・名古屋城）' },
  { code: '26104', name: '京都市中京区', pref: '京都府', lat: 35.0094, lon: 135.7600, label: '京都（四条・鴨川）' },
  { code: '27127', name: '大阪市北区', pref: '大阪府', lat: 34.7000, lon: 135.4960, label: '大阪（梅田・中之島）' },
  { code: '28110', name: '神戸市中央区', pref: '兵庫県', lat: 34.6900, lon: 135.1900, label: '神戸（三宮・メリケンパーク）' },
  { code: '34101', name: '広島市中区', pref: '広島県', lat: 34.3940, lon: 132.4560, label: '広島（平和記念公園・紙屋町）' },
  { code: '40133', name: '福岡市中央区', pref: '福岡県', lat: 33.5902, lon: 130.3960, label: '福岡（天神・大濠公園）' },
  { code: '46201', name: '鹿児島市', pref: '鹿児島県', lat: 31.5900, lon: 130.5560, label: '鹿児島（天文館・桜島フェリー）' },
  { code: '47201', name: '那覇市', pref: '沖縄県', lat: 26.2155, lon: 127.6810, label: '那覇（国際通り・那覇港）' },
].map(c => ({ ...c, id: `c:${c.code}`, muni: c.code, packed: `data/cities/${c.code}.bin.gz` }));
export const cityByMuni = new Map(CITIES.map(c => [c.muni, c]));

// 地図（グリッド＋リング）を 1 つのファイルにまとめる: [ヘッダー長 u32][ヘッダー JSON][配列…] を gzip
const KEYS = ['L', 'mat', 'bh', 'style', 'ward', 'bidRaw'];
export async function packRegion(grid, defs) {
  const arrays = KEYS.map(k => [k, grid[k]]).concat([['far.lv', grid.far.lv]]);
  const meta = []; let off = 0;
  for (const [k, a] of arrays) { off = Math.ceil(off / 4) * 4; meta.push([k, a.constructor.name, a.length, off]); off += a.byteLength; }
  const head = new TextEncoder().encode(JSON.stringify({ v: 1, W: grid.W, H: grid.H, X0: grid.X0, Z0: grid.Z0, B: grid.B, far: { N: grid.far.N, F: grid.far.F, VF: grid.far.VF }, defs, arrays: meta }));
  const base = Math.ceil((4 + head.length) / 4) * 4, buf = new Uint8Array(base + off);
  new DataView(buf.buffer).setUint32(0, head.length, true); buf.set(head, 4);
  arrays.forEach(([, a], i) => buf.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), base + meta[i][3]));
  return new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
export async function loadPacked(url) {
  const res = await fetch(url); if (!res.ok) throw new Error(url + ' ' + res.status);
  const buf = new Uint8Array(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const n = new DataView(buf.buffer).getUint32(0, true), h = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + n)));
  const base = Math.ceil((4 + n) / 4) * 4, T = { Uint8Array, Uint16Array, Float32Array };
  const grid = { W: h.W, H: h.H, X0: h.X0, Z0: h.Z0, B: h.B, far: { ...h.far } };
  for (const [k, type, len, off] of h.arrays) { const a = new T[type](buf.buffer, base + off, len); if (k === 'far.lv') grid.far.lv = a; else grid[k] = a; }
  return { grid, defs: h.defs };
}
