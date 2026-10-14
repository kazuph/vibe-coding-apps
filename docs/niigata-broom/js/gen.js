// 場所を指定してマップを自動で作る
//  地図: OpenFreeMap のベクタータイル（OpenStreetMap を OpenMapTiles の形に切った物。z14）
//  標高: 国土地理院 標高タイル（dem_png）。日本の外は AWS Terrain Tiles（terrarium）
//  取った物はこのブラウザ（IndexedDB）に覚えて、同じ場所はサーバーへ取りに行かない
import { ll, toLatLon, setOrigin } from './world.js';
import { P } from './rings.js';

const B = 8, HALF = 2560, W = 640; // 5.12km 四方を 8m のブロックで
const M = { SEA: 0, RIVER: 1, SAND: 2, GRASS: 3, ROAD: 4, RAIL: 5, FOREST: 6, PARK: 7, FARM: 8, TOWN: 9, BRIDGE: 10, STONE: 11, CONCRETE: 12, PITCH: 13, BIGROAD: 14, LAKE: 15 };
export const inJapan = (lat, lon) => lat > 20 && lat < 46.2 && lon > 122.5 && lon < 154.5;

// ---------- このブラウザに覚える（IndexedDB）
export const cache = (() => {
  let dbp = null;
  const db = () => dbp || (dbp = new Promise(res => { try { const r = indexedDB.open('niigata-broom', 1); r.onupgradeneeded = () => r.result.createObjectStore('c'); r.onsuccess = () => res(r.result); r.onerror = () => res(null); } catch { res(null); } }));
  const tx = async (mode, fn) => { const d = await db(); if (!d) return null; return new Promise(res => { try { const t = d.transaction('c', mode); const rq = fn(t.objectStore('c')); t.oncomplete = () => res(rq?.result ?? null); t.onerror = () => res(null); } catch { res(null); } }); };
  return { get: (k) => tx('readonly', s => s.get(k)), put: (k, v) => tx('readwrite', s => s.put(v, k)), del: (k) => tx('readwrite', s => s.delete(k)) };
})();

// ---------- ベクタータイル（Mapbox Vector Tile = protobuf）の読み取り
class Pbf {
  constructor(buf) { this.b = buf; this.p = 0; }
  varint() { let v = 0, s = 1, b; do { b = this.b[this.p++]; v += (b & 0x7f) * s; s *= 128; } while (b & 0x80); return v; }
  bytes() { const n = this.varint(), o = this.p; this.p += n; return this.b.subarray(o, this.p); }
  skip(w) { if (w === 0) this.varint(); else if (w === 1) this.p += 8; else if (w === 2) this.p += this.varint(); else if (w === 5) this.p += 4; }
}
const td = new TextDecoder();
function decodeTile(buf, want) {
  const pb = new Pbf(buf), layers = {};
  while (pb.p < buf.length) {
    const tag = pb.varint();
    if (tag >> 3 !== 3) { pb.skip(tag & 7); continue; }
    const lb = pb.bytes(), l = new Pbf(lb);
    let name = '', extent = 4096; const keys = [], vals = [], feats = [];
    while (l.p < lb.length) {
      const t = l.varint(), f = t >> 3;
      if (f === 1) name = td.decode(l.bytes());
      else if (f === 2) feats.push(l.bytes());
      else if (f === 3) keys.push(td.decode(l.bytes()));
      else if (f === 4) {
        const vb = l.bytes(), v = new Pbf(vb); let val = null;
        while (v.p < vb.length) {
          const vt = v.varint(), vf = vt >> 3;
          if (vf === 1) val = td.decode(v.bytes());
          else if (vf === 2) { val = new DataView(vb.buffer, vb.byteOffset + v.p, 4).getFloat32(0, true); v.p += 4; }
          else if (vf === 3) { val = new DataView(vb.buffer, vb.byteOffset + v.p, 8).getFloat64(0, true); v.p += 8; }
          else if (vf === 4 || vf === 5) val = v.varint();
          else if (vf === 6) { const n = v.varint(); val = n % 2 ? -(n + 1) / 2 : n / 2; }
          else if (vf === 7) val = !!v.varint();
          else v.skip(vt & 7);
        }
        vals.push(val);
      } else if (f === 5) extent = l.varint();
      else l.skip(t & 7);
    }
    if (!want.includes(name)) continue;
    layers[name] = feats.map(fb => {
      const fp = new Pbf(fb); let type = 0, tags = [], geom = [];
      while (fp.p < fb.length) {
        const t = fp.varint(), f = t >> 3;
        if (f === 2 || f === 4) { const pk = fp.bytes(), q = new Pbf(pk), arr = []; while (q.p < pk.length) arr.push(q.varint()); if (f === 2) tags = arr; else geom = arr; }
        else if (f === 3) type = fp.varint();
        else fp.skip(t & 7);
      }
      const props = {}; for (let i = 0; i < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]];
      // ジオメトリ: MoveTo / LineTo / ClosePath
      const rings = []; let cur = null, x = 0, y = 0;
      for (let i = 0; i < geom.length;) {
        const c = geom[i++], cmd = c & 7, n = c >> 3;
        if (cmd === 7) { if (cur && cur.length) cur.push(cur[0]); continue; }
        for (let k = 0; k < n; k++) {
          const dx = geom[i++], dy = geom[i++]; x += (dx >>> 1) ^ -(dx & 1); y += (dy >>> 1) ^ -(dy & 1);
          if (cmd === 1) { cur = [[x, y]]; rings.push(cur); } else cur.push([x, y]);
        }
      }
      return { type, props, rings, extent };
    });
  }
  return layers;
}
const tileXY = (lat, lon, z) => { const n = 2 ** z; return [(lon + 180) / 360 * n, (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n]; };
const tile2ll = (x, y, z) => { const n = 2 ** z; return [Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI, x / n * 360 - 180]; };

let tplP = null;
async function tileTemplate() {
  if (!tplP) tplP = (async () => { const c = await cache.get('tilejson'); if (c && Date.now() - c.t < 864e5) return c.v; const j = await (await fetch('https://tiles.openfreemap.org/planet')).json(); cache.put('tilejson', { t: Date.now(), v: j.tiles[0] }); return j.tiles[0]; })();
  return tplP;
}
async function getVT(z, x, y) {
  const key = `vt/${z}/${x}/${y}`, c = await cache.get(key);
  if (c && Date.now() - c.t < 7 * 864e5) return c.v;
  const url = (await tileTemplate()).replace('{z}', z).replace('{x}', x).replace('{y}', y);
  const r = await fetch(url); if (r.status === 404) return new Uint8Array(0); if (!r.ok) throw new Error('地図タイル ' + r.status);
  const v = new Uint8Array(await r.arrayBuffer()); cache.put(key, { t: Date.now(), v }); return v;
}
// 標高タイル（PNG）→ Float32Array 256×256（無い所 = NaN）
async function getDEM(z, x, y, japan) {
  const key = `dem/${japan ? 'g' : 'a'}/${z}/${x}/${y}`, c = await cache.get(key);
  if (c) return c;
  const url = japan ? `https://cyberjapandata.gsi.go.jp/xyz/dem_png/${z}/${x}/${y}.png` : `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const r = await fetch(url);
  const out = new Float32Array(256 * 256).fill(NaN);
  if (r.ok) {
    const bmp = await createImageBitmap(await r.blob());
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
    const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, 256, 256).data;
    for (let i = 0; i < 65536; i++) {
      const R = d[i * 4], G = d[i * 4 + 1], Bb = d[i * 4 + 2];
      if (japan) { const v = R * 65536 + G * 256 + Bb; out[i] = v === 8388608 ? NaN : (v < 8388608 ? v : v - 16777216) * 0.01; }
      else out[i] = R * 256 + G + Bb / 256 - 32768;
    }
  } else if (r.status !== 404) throw new Error('標高タイル ' + r.status);
  cache.put(key, out); return out;
}
async function sampleDEM(points, z, japan, onTile) { // points: [[lat, lon], ...] → 標高[]
  const need = new Map(), loc = points.map(([la, lo]) => { const [fx, fy] = tileXY(la, lo, z); const tx = Math.floor(fx), ty = Math.floor(fy); const k = tx + ',' + ty; if (!need.has(k)) need.set(k, [tx, ty]); return [k, Math.min(255, Math.floor((fx - tx) * 256)), Math.min(255, Math.floor((fy - ty) * 256))]; });
  const tiles = new Map(); let n = 0;
  await pool([...need.entries()], 4, async ([k, [tx, ty]]) => { tiles.set(k, await getDEM(z, tx, ty, japan)); onTile?.(++n, need.size); });
  return loc.map(([k, px, py]) => tiles.get(k)[py * 256 + px]);
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } })); }

// ---------- グリッドへの塗りつぶし
function fillRings(rings, cb) { // rings: [[ [gx, gz], ... ], ...] 偶奇規則（穴あき対応）
  let z0 = Infinity, z1 = -Infinity;
  for (const r of rings) for (const p of r) { if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1]; }
  z0 = Math.max(0, Math.floor(z0)); z1 = Math.min(W - 1, Math.ceil(z1));
  const xs = [];
  for (let z = z0; z <= z1; z++) {
    const cz = z + 0.5; xs.length = 0;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, az] = r[i], [bx, bz] = r[j];
      if ((az > cz) !== (bz > cz)) xs.push(ax + (cz - az) * (bx - ax) / (bz - az));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = a; x <= b; x++) cb(z * W + x);
    }
  }
}
function stampLine(pts, widthCells, cb) {
  const r = Math.max(0.5, widthCells / 2);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx) + r));
    const z0 = Math.max(0, Math.floor(Math.min(az, bz) - r)), z1 = Math.min(W - 1, Math.ceil(Math.max(az, bz) + r));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - ax, pz = z + 0.5 - az, t = Math.max(0, Math.min(1, (px * dx + pz * dz) / L2));
      const ex = px - t * dx, ez = pz - t * dz; if (ex * ex + ez * ez <= r * r) cb(z * W + x);
    }
  }
}
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------- 本体
export async function generate({ lat, lon, name }, onStep = () => {}) {
  setOrigin(lat, lon);
  const japan = inJapan(lat, lon), N = W * W, X0 = -HALF, Z0 = -HALF;
  const toG = ([x, z]) => [(x - X0) / B, (z - Z0) / B];
  // 1) 地図タイル
  const [la0, lo0] = toLatLon(X0, Z0 + W * B), [la1, lo1] = toLatLon(X0 + W * B, Z0);
  const [tx0, ty0] = tileXY(la1, lo0, 14), [tx1, ty1] = tileXY(la0, lo1, 14);
  const jobs = []; for (let ty = Math.floor(ty0); ty <= Math.floor(ty1); ty++) for (let tx = Math.floor(tx0); tx <= Math.floor(tx1); tx++) jobs.push([tx, ty]);
  const feats = { water: [], waterway: [], landcover: [], landuse: [], transportation: [], building: [], poi: [], mountain_peak: [] };
  let n = 0;
  await pool(jobs, 4, async ([tx, ty]) => {
    const buf = await getVT(14, tx, ty);
    if (buf.length) {
      const L = decodeTile(buf, Object.keys(feats));
      for (const k in L) for (const f of L[k]) {
        f.g = f.rings.map(r => r.map(([x, y]) => toG(ll(...tile2ll(tx + x / f.extent, ty + y / f.extent, 14)))));
        feats[k].push(f);
      }
    }
    onStep(`地図データを読み込み中（OpenFreeMap）${++n}/${jobs.length}`, 0.05 + 0.35 * n / jobs.length);
  });
  // 2) 標高
  const cellLL = []; for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) cellLL.push(toLatLon(X0 + (x + 0.5) * B, Z0 + (z + 0.5) * B));
  const h = await sampleDEM(cellLL, japan ? 14 : 13, japan, (i, t) => onStep(`地形を読み込み中（${japan ? '国土地理院' : 'AWS Terrain Tiles'}）${i}/${t}`, 0.4 + 0.2 * i / t));
  // 3) 地面の材質
  onStep('ブロックに変換中…', 0.62);
  const mat = new Uint8Array(N).fill(M.GRASS), L = new Uint16Array(N), bh = new Uint8Array(N), style = new Uint8Array(N), bid = new Uint8Array(N), ward = new Uint8Array(N).fill(1);
  const sea = new Uint8Array(N), water = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (japan && Number.isNaN(h[i])) sea[i] = 1;
  const paint = (list, test, fn) => { for (const f of list) if (f.type === 3 && test(f.props)) fillRings(f.g, fn); };
  // 建物（先に高さだけ）
  const bHeight = new Float32Array(N);
  feats.building.sort((a, b) => (+a.props.render_height || 0) - (+b.props.render_height || 0));
  feats.building.forEach((f, k) => {
    if (f.props.hide_3d) return;
    let hh = +f.props.render_height || 0; const id = 1 + (k % 251);
    if (!hh || hh === 5) hh = 4 + hash(k, 3) * 6; // 高さの情報が無い建物は 1〜2 階建てとして揺らす
    fillRings(f.g, i => { bHeight[i] = Math.max(bHeight[i], hh); bid[i] = id; });
  });
  // 建物の多さで「街の地面」と「草地」を分ける
  const isB = (i) => bHeight[i] > 0;
  { const S = new Uint32Array((W + 1) * (W + 1)); for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) S[(z + 1) * (W + 1) + x + 1] = (isB(z * W + x) ? 1 : 0) + S[z * (W + 1) + x + 1] + S[(z + 1) * (W + 1) + x] - S[z * (W + 1) + x];
    const R = 4; for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) { const a = Math.max(0, x - R), b = Math.min(W, x + R + 1), c = Math.max(0, z - R), d = Math.min(W, z + R + 1); const s = S[d * (W + 1) + b] - S[c * (W + 1) + b] - S[d * (W + 1) + a] + S[c * (W + 1) + a]; if (s / ((b - a) * (d - c)) > 0.12) mat[z * W + x] = M.TOWN; } }
  paint(feats.landcover, p => p.class === 'farmland', i => mat[i] = M.FARM);
  paint(feats.landcover, p => p.class === 'grass' || p.class === 'wetland', i => mat[i] = M.GRASS);
  paint(feats.landcover, p => p.class === 'grass' && ['park', 'garden', 'golf_course', 'village_green', 'recreation_ground', 'playground'].includes(p.subclass), i => mat[i] = M.PARK);
  paint(feats.landuse, p => ['stadium', 'pitch', 'track', 'playground'].includes(p.class), i => mat[i] = M.PITCH);
  paint(feats.landuse, p => ['industrial', 'commercial', 'retail', 'railway', 'garages', 'bus_station'].includes(p.class), i => mat[i] = M.CONCRETE);
  paint(feats.landuse, p => p.class === 'cemetery', i => mat[i] = M.GRASS);
  paint(feats.landcover, p => p.class === 'wood', i => mat[i] = M.FOREST);
  paint(feats.landcover, p => p.class === 'sand' || p.subclass === 'beach', i => mat[i] = M.SAND);
  paint(feats.landcover, p => p.class === 'rock' || p.class === 'ice', i => mat[i] = M.STONE);
  paint(feats.water, p => p.class === 'ocean', i => sea[i] = 1);
  paint(feats.water, p => p.class !== 'ocean' && p.class !== 'swimming_pool' && p.brunnel !== 'tunnel', i => water[i] = 1);
  for (const f of feats.waterway) if ((f.props.class === 'river' || f.props.class === 'canal') && f.props.brunnel !== 'tunnel') for (const r of f.g) stampLine(r, f.props.class === 'river' ? 2 : 1, i => water[i] = 1);
  // 道路・線路・橋
  const RW = { motorway: 22, trunk: 20, primary: 16, secondary: 14, tertiary: 11, minor: 6, service: 4 };
  const roadM = new Uint8Array(N), bridge = new Uint8Array(N);
  for (const f of feats.transportation) {
    const c = f.props.class; if (f.type !== 2 || f.props.brunnel === 'tunnel') continue;
    const isRail = c === 'rail' || c === 'transit';
    const w = isRail ? 8 : RW[c]; if (!w) continue;
    const v = isRail ? M.RAIL : w >= 11 ? M.BIGROAD : M.ROAD;
    for (const r of f.g) stampLine(r, w / B, i => { if (roadM[i] !== M.BIGROAD) roadM[i] = v; if (f.props.brunnel === 'bridge') bridge[i] = 1; });
  }
  // 海沿いの砂浜
  { let ns = sea.slice(); for (let k = 0; k < 4; k++) { const m = ns.slice(); for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) { const i = z * W + x; if (ns[i]) continue; if ((x > 0 && ns[i - 1]) || (x < W - 1 && ns[i + 1]) || (z > 0 && ns[i - W]) || (z < W - 1 && ns[i + W])) m[i] = 1; } ns = m; }
    for (let i = 0; i < N; i++) if (ns[i] && !sea[i] && !water[i] && mat[i] !== M.TOWN) mat[i] = M.SAND; }
  // 合成
  for (let i = 0; i < N; i++) {
    const hv = Number.isNaN(h[i]) ? 0 : h[i];
    L[i] = Math.min(1000, 1 + Math.floor(Math.max(hv, 0) / B + 0.15));
    if (roadM[i]) mat[i] = roadM[i];
    if (sea[i] || water[i]) {
      if (sea[i] || hv < 6) { mat[i] = sea[i] ? M.SEA : M.RIVER; L[i] = 0; }
      else mat[i] = M.LAKE; // 高い所にある湖・川は地面と同じ高さの水ブロック
      if (bridge[i] && roadM[i]) { mat[i] = M.BRIDGE; L[i] = Math.max(L[i], 1); }
      continue;
    }
    if (bHeight[i] > 0 && !(roadM[i] === M.BIGROAD)) {
      bh[i] = Math.max(1, Math.round(bHeight[i] / B));
      const r = hash(bid[i], bh[i]);
      style[i] = bh[i] <= 1 ? 0 : bh[i] <= 4 ? (r < 0.6 ? 1 : 3) : (r < 0.5 ? 2 : 1);
    } else bid[i] = 0;
  }
  // 4) 遠景（中心から 9km より遠い所を縮めて、山の高さを強調する）
  const FN = 440, F = 200, R0 = 9000, K = 0.45, VF = 25, EX = 1.5;
  const farLL = [], inner = new Uint8Array(FN * FN);
  for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) {
    const X = (i - FN / 2 + 0.5) * F, Z = (j - FN / 2 + 0.5) * F, r = Math.hypot(X, Z), rr = r < R0 ? r : R0 + (r - R0) / K, s = r > 0 ? rr / r : 1;
    farLL.push(toLatLon(X * s, Z * s));
    if (X > X0 + F && X < X0 + W * B - F && Z > Z0 + F && Z < Z0 + W * B - F) inner[j * FN + i] = 1;
  }
  const fh = await sampleDEM(farLL, 9, japan, (i, t) => onStep(`遠くの山を読み込み中 ${i}/${t}`, 0.7 + 0.15 * i / t));
  const lv = new Uint8Array(FN * FN);
  for (let k = 0; k < FN * FN; k++) {
    if (inner[k]) { lv[k] = 255; continue; }
    const v = fh[k]; if (Number.isNaN(v) || (!japan && v <= 0)) { lv[k] = 0; continue; }
    lv[k] = Math.min(254, Math.max(1, Math.round(Math.max(v, 0) * EX / VF)));
  }
  onStep('リングを置いています…', 0.88);
  const grid = { W, H: W, X0, Z0, B, L, mat, bh, style, ward, bidRaw: bid, far: { N: FN, F, VF, lv } };
  const defs = placeRings(feats, grid, name);
  return { grid, defs };
}

// ---------- リングの自動配置
const POI_JA = { railway: '駅', attraction: '名所', museum: '博物館', castle: '城', place_of_worship: '寺社', park: '公園', stadium: 'スタジアム', monument: '記念碑', town_hall: '役所', college: '大学', zoo: '動物園', theme_park: 'テーマパーク', aquarium: '水族館', viewpoint: '展望所', harbor: '港', ferry_terminal: '港' };
function placeRings(feats, g, areaName) {
  const { W, B, X0, Z0 } = g;
  const toXZ = ([gx, gz]) => [X0 + gx * B, Z0 + gz * B];
  const toLL = (x, z) => toLatLon(x, z);
  const inside = ([gx, gz], m = 25) => gx > m && gz > m && gx < W - m && gz < W - m;
  const cand = [];
  for (const f of feats.poi) {
    const p = f.props, nm = p.name; if (!nm || f.type !== 1) continue;
    const ok = POI_JA[p.class] && (p.class !== 'railway' || ['station', 'halt'].includes(p.subclass)) && (p.class !== 'town_hall' || p.subclass === 'townhall'); // 公民館・集会所は除く
    if (!ok) continue;
    const q = f.g[0]?.[0]; if (!q || !inside(q)) continue;
    const w = { railway: 0, attraction: 1, castle: 0, museum: 2, aquarium: 1, zoo: 2, theme_park: 1, stadium: 2, place_of_worship: 3, park: 4, viewpoint: 2, town_hall: 3, monument: 4, college: 5, harbor: 3, ferry_terminal: 3 }[p.class] ?? 5;
    cand.push({ name: nm, q, score: (+p.rank || 30) + w * 6, kind: p.class });
  }
  for (const f of feats.mountain_peak) { const nm = f.props.name, q = f.g[0]?.[0]; if (nm && q && inside(q)) cand.push({ name: nm, q, score: 2, kind: 'peak', ele: +f.props.ele || 0 }); }
  cand.sort((a, b) => a.score - b.score);
  const chosen = [], seen = new Set();
  for (const c of cand) {
    if (seen.has(c.name) || chosen.length >= 24) continue;
    const [x, z] = toXZ(c.q);
    if (chosen.some(o => Math.hypot(o.x - x, o.z - z) < 240)) continue;
    seen.add(c.name); chosen.push({ ...c, x, z });
  }
  const points = chosen.map((c, k) => { const [lat, lon] = toLL(c.x, c.z); return P(`p${k}`, c.name, lat, lon, { agl: c.kind === 'peak' ? 30 : 25, hd: Math.round(hash(k, 9) * 360), pts: c.kind === 'peak' ? 150 : 100 }); });
  // 高いビル（上位 3 か所）
  const tall = [];
  for (let i = 0; i < W * W; i++) if (g.bh[i] >= 6) tall.push(i);
  tall.sort((a, b) => g.bh[b] - g.bh[a]);
  const picked = [];
  for (const i of tall) { const x = X0 + (i % W + 0.5) * B, z = Z0 + (Math.floor(i / W) + 0.5) * B; if (picked.length >= 3) break; if ([...picked, ...chosen].some(o => Math.hypot(o.x - x, o.z - z) < 400)) continue; picked.push({ x, z }); }
  picked.forEach((p, k) => { const [lat, lon] = toLL(p.x + 30, p.z); points.push(P(`tall${k}`, `高いビル ${k + 1}`, lat, lon, { agl: 20, hd: 90, pts: 120 })); });
  // 加速リング: いちばん長い川、無ければいちばん長い幹線道路に沿って
  const longest = (list, test) => { let best = null, bl = 0; for (const f of list) { if (!test(f.props) || f.type !== 2) continue; for (const r of f.g) { const pts = r.filter(q => inside(q, 8)); let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (l > bl) { bl = l; best = pts; } } } return best && bl * B > 900 ? best : null; };
  let path = longest(feats.waterway, p => p.class === 'river'), pathName = '川';
  if (!path) { path = longest(feats.transportation, p => ['motorway', 'trunk', 'primary'].includes(p.class) && p.brunnel !== 'tunnel'); pathName = '幹線道路'; }
  const chains = [];
  if (path) {
    const way = []; let acc = 0;
    for (let i = 1; i < path.length && way.length < 10; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]) * B; acc += d; if (acc >= 320) { acc = 0; const [x, z] = toXZ(path[i]); way.push(toLL(x, z)); } }
    if (way.length >= 3) chains.push({ id: 'chain', name: pathName, agl: 16, pts: 50, way });
  }
  // 宙返り: 中心に近く、周りが低い所
  let best = null;
  for (let r = 0; r < 260 && !best; r += 6) for (let a = 0; a < 16 && !best; a++) {
    const gx = Math.round(W / 2 + Math.cos(a / 16 * Math.PI * 2) * r), gz = Math.round(W / 2 + Math.sin(a / 16 * Math.PI * 2) * r);
    let mx = 0; for (let dz = -8; dz <= 8; dz += 2) for (let dx = -8; dx <= 8; dx += 2) { const i = (gz + dz) * W + gx + dx; if (i >= 0 && i < W * W) mx = Math.max(mx, g.L[i] + g.bh[i]); }
    if (mx <= 4) best = [gx, gz];
  }
  if (!best) best = [W / 2, W / 2];
  const loops = [];
  if (best) { const [x, z] = toXZ(best); const [lat, lon] = toLL(x, z); loops.push({ id: 'loop', name: `${areaName}の宙返り`, lat, lon, hd: chains.length ? 45 : 0, R: 44, base: 40 }); }
  return { points, chains, loops };
}
