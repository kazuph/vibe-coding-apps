// ボクセル地形・建物・木・水面の生成
import * as THREE from 'three';

// 座標系: 原点（地域の中心）からの平面直交 (m)。x=東, z=南。地域を切り替えると原点も変わる
let LAT0 = 37.9125, LON0 = 139.0615, KY = 111132.0, KX = 111320.0 * Math.cos(LAT0 * Math.PI / 180);
export function setOrigin(lat, lon) { LAT0 = lat; LON0 = lon; KX = 111320.0 * Math.cos(lat * Math.PI / 180); }
export const ll = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KY];
export const toLatLon = (x, z) => [LAT0 - z / KY, LON0 + x / KX];

// 地面の材質 (build.py と対応)
export const M = { SEA: 0, RIVER: 1, SAND: 2, GRASS: 3, ROAD: 4, RAIL: 5, FOREST: 6, PARK: 7, FARM: 8, TOWN: 9, BRIDGE: 10, STONE: 11, CONCRETE: 12, PITCH: 13, BIGROAD: 14, LAKE: 15 };
// シェーダーの模様の種類
const K = { PLAIN: 0, GRASS: 1, GRASS_SIDE: 2, DIRT: 3, WALL: 4, GLASS: 5, ROOF: 6, LEAVES: 7, WOOD: 8, FARM: 9, ROAD: 10, RAIL: 11, SAND: 12, PITCH: 13, STONE: 14, PINE: 15, ROCK: 16, SNOWCAP: 17 };

const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const TERRAIN_TOP = {
  [M.SAND]: [0xe6d59c, K.SAND], [M.GRASS]: [0x6fb64a, K.GRASS], [M.ROAD]: [0x8e8e92, K.ROAD], [M.RAIL]: [0x7b6a5c, K.RAIL],
  [M.FOREST]: [0x4f9a3a, K.GRASS], [M.PARK]: [0x7cc254, K.GRASS], [M.FARM]: [0xc9b65a, K.FARM], [M.TOWN]: [0xa8a18c, K.STONE],
  [M.BRIDGE]: [0x77777c, K.ROAD], [M.STONE]: [0x9c9ca2, K.STONE], [M.CONCRETE]: [0xb3b3b8, K.STONE], [M.PITCH]: [0x5fbf4f, K.PITCH], [M.BIGROAD]: [0x6c6d72, K.ROAD], [M.LAKE]: [0x3f86c4, K.PLAIN],
};
const GREEN_TOP = new Set([M.GRASS, M.FOREST, M.PARK, M.PITCH, M.FARM]);
const WALLS = [
  [[0xf0e7d6, 0xddcdb0, 0xbf9466, 0xe9e9e9, 0xd8c3a5], [0x55606e, 0x8c3b33, 0x48597d, 0x6e5a49, 0x3f4650], K.WALL],
  [[0xe8e4dc, 0xd8d3c8, 0xcdc4b4, 0xe0d6c8], [0x9a9a9e, 0x8c8f93], K.WALL],
  [[0x8fb6cc, 0xa6bccc, 0x7d97aa, 0xb5c4cc], [0x8a8d90, 0x7d8085], K.GLASS],
  [[0xeed9c3, 0xd9b9a0, 0xf2efe8, 0xe3c9b8], [0x8c8c90, 0x9b8f86], K.WALL],
  [[0xdad2c2, 0xcbc2ac, 0xe6dfd2], [0x6f8a66, 0x7a7d80], K.WALL],
  [[0xbac3ca, 0xa9b1b6, 0xc9ccc4], [0x6c8aa2, 0x8b9ba6, 0x9aa2a8], K.WALL],
  [[0xd0c9bd, 0xc4bcae], [0x8a8a8a], K.WALL],
];

// ---- パレット（色+模様）を 1 つの Uint32 キーにまとめる
const palette = []; const palIndex = new Map();
function pal(rgb, kind) {
  const key = (rgb[0] << 24 | rgb[1] << 16 | rgb[2] << 8 | kind) >>> 0;
  let i = palIndex.get(key); if (i === undefined) { i = palette.length; palette.push([rgb[0], rgb[1], rgb[2], kind]); palIndex.set(key, i); }
  return i;
}
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---- 頂点バッファ
class Buf {
  constructor() { this.p = []; this.n = []; this.c = []; }
  quad(a, b, c, d, nrm, pi) {
    const col = palette[pi];
    for (const v of [a, b, c, a, c, d]) { this.p.push(v[0], v[1], v[2]); this.n.push(nrm[0], nrm[1], nrm[2]); this.c.push(col[0], col[1], col[2], col[3]); }
  }
  box(x0, y0, z0, x1, y1, z1, pi, piTop = pi, bottom = false) {
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 127, 0], piTop);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -127, 0], pi);
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [127, 0, 0], pi);
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-127, 0, 0], pi);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 127], pi);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -127], pi);
  }
  geometry() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(this.n), 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(this.c), 4, true));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

// ---- 共通シェーダー
export const U = {
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() }, uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  uSkyAmb: { value: new THREE.Color(0.55, 0.62, 0.75) }, uGroundAmb: { value: new THREE.Color(0.35, 0.33, 0.3) },
  uFogCol: { value: new THREE.Color(0.7, 0.8, 0.9) }, uFogDen: { value: 0.00012 }, uNight: { value: 0 }, uSnow: { value: 0 }, uWet: { value: 0 },
  uTime: { value: 0 }, uFlash: { value: 0 }, uSkyTop: { value: new THREE.Color(0.3, 0.5, 0.9) },
};
const COMMON = /* glsl */`
uniform vec3 uSunDir, uSunCol, uSkyAmb, uGroundAmb, uFogCol, uSkyTop; uniform float uFogDen, uNight, uSnow, uWet, uTime, uFlash;
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 applyFog(vec3 c, float d){ float f = 1.0 - exp(-pow(d * uFogDen, 1.6)); return mix(c, uFogCol, clamp(f, 0.0, 1.0)); }
`;
function voxelMaterial(blockH, blockV, fogMul = 1) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uBlock: { value: new THREE.Vector2(blockH, blockV) }, uFogMul: { value: fogMul } },
    vertexShader: /* glsl */`
      attribute vec4 color; varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vKind; varying float vDist;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normal; vCol = color.rgb; vKind = floor(color.a * 255.0 + 0.5);
        vec4 mv = viewMatrix * w; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: COMMON + /* glsl */`
      uniform vec2 uBlock; uniform float uFogMul; varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vKind; varying float vDist;
      void main(){
        vec3 n = normalize(vN); vec2 uv;
        if (abs(n.y) > 0.5) uv = vW.xz / uBlock.x; else if (abs(n.x) > 0.5) uv = vec2(vW.z / uBlock.x, vW.y / uBlock.y); else uv = vec2(vW.x / uBlock.x, vW.y / uBlock.y);
        vec2 cell = floor(uv + 1e-4), f = fract(uv + 1e-4), px = floor(f * 8.0);
        float nz = h21(cell * 13.17 + px), nz2 = h21(cell * 3.1 + floor(f * 4.0) + 7.0);
        int k = int(vKind); vec3 col = vCol; vec3 emit = vec3(0.0); float edgeK = 1.0;
        bool top = n.y > 0.5;
        if (k == 2) { // 草ブロックの側面: 上 3/16 が緑
          if (f.y > 0.8 - 0.06 * h21(vec2(cell.x * 8.0 + px.x, cell.y))) col = vec3(0.42, 0.68, 0.28); else col = vec3(0.52, 0.38, 0.25);
        } else if (k == 3) { col = vec3(0.52, 0.38, 0.25);
        } else if (k == 4 || k == 5) { // 窓
          bool glass = k == 5; vec2 wf = fract(uv * (glass ? 3.0 : 2.0)); vec2 wc = floor(uv * (glass ? 3.0 : 2.0));
          bool win = glass ? (wf.x > 0.12 && wf.x < 0.88 && wf.y > 0.2 && wf.y < 0.85) : (wf.x > 0.25 && wf.x < 0.75 && wf.y > 0.3 && wf.y < 0.75);
          if (win && f.y > 0.02) {
            float lit = step(0.42, h21(wc * 1.73 + floor(uTime * 0.02 + h21(wc) * 3.0)));
            col = mix(vec3(0.25, 0.33, 0.42), vec3(0.55, 0.68, 0.8), glass ? 0.55 : 0.2);
            emit = vec3(1.0, 0.78, 0.42) * lit * uNight * 1.25;
          }
        } else if (k == 7 || k == 15) { col *= 0.8 + 0.35 * nz2; edgeK = 0.6;
        } else if (k == 8) { col *= 0.85 + 0.2 * step(0.5, fract(px.x * 0.5));
        } else if (k == 9) { // 田んぼ: 稲穂と畦
          col = mix(col, vec3(0.45, 0.62, 0.3), step(0.6, nz2)); if (px.x == 0.0 || px.y == 0.0) col = vec3(0.5, 0.42, 0.28);
        } else if (k == 10 && top) { // 道路: 破線
          if ((px.x == 3.0 || px.x == 4.0) && mod(px.y, 4.0) < 2.0 && h21(cell) > 0.5) col = vec3(0.9, 0.9, 0.85);
          emit = vec3(1.0, 0.7, 0.35) * uNight * 0.12;
        } else if (k == 11 && top) { if (px.x == 2.0 || px.x == 5.0) col = vec3(0.55, 0.55, 0.58); else if (mod(px.y, 2.0) == 0.0) col = vec3(0.4, 0.3, 0.22);
        } else if (k == 13 && top) { col *= 0.9 + 0.15 * step(0.5, fract(cell.x * 0.5));
        } else if (k == 16) { col *= 0.75 + 0.4 * nz2;
        }
        col *= 0.88 + 0.2 * nz;
        float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
        col *= mix(mix(0.78, 1.0, edgeK * 0.0 + (1.0 - edgeK)), 1.0, smoothstep(0.0, 0.05, e));
        // 積雪
        if (top) { float s = uSnow * (k == 10 ? 0.55 : 0.95) * (0.85 + 0.15 * nz); col = mix(col, vec3(0.95, 0.97, 1.0), s); }
        if (k == 17) col = mix(col, vec3(0.95), 0.9);
        col *= 1.0 - 0.18 * uWet * (top ? 1.0 : 0.6);
        // マイクラ風の面ごとの陰影 + 太陽
        float face = top ? 1.0 : (n.y < -0.5 ? 0.5 : (abs(n.x) > 0.5 ? 0.82 : 0.68));
        float ndl = max(dot(n, uSunDir), 0.0);
        vec3 amb = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
        vec3 lit = col * (amb * face + uSunCol * ndl * 0.85) + emit + col * uFlash;
        gl_FragColor = vec4(applyFog(lit, vDist * uFogMul), 1.0);
      }`,
  });
}
export { voxelMaterial };

// ---- データ読み込み
async function gunzip(url) {
  const res = await fetch(url); if (!res.ok) throw new Error(url + ' ' + res.status);
  const ds = res.body.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(ds).arrayBuffer());
}

export class World {
  // 新潟市中央区（PLATEAU から作った作り置きのデータ）
  static async loadFiles() {
    const [near, far] = await Promise.all([gunzip('data/near.bin.gz'), gunzip('data/far.bin.gz')]);
    const dv = new DataView(near.buffer);
    const W = dv.getUint32(4, true), H = dv.getUint32(8, true), N = W * H;
    const g = { W, H, X0: dv.getFloat32(12, true), Z0: dv.getFloat32(16, true), B: dv.getFloat32(20, true) };
    let o = 28;
    g.L = near.subarray(o, o += N); g.mat = near.subarray(o, o += N); g.bh = near.subarray(o, o += N); g.style = near.subarray(o, o += N); g.ward = near.subarray(o, o += N); g.bidRaw = near.subarray(o, o += N);
    const fdv = new DataView(far.buffer);
    g.far = { N: fdv.getUint32(4, true), F: fdv.getFloat32(8, true), VF: fdv.getFloat32(12, true), lv: far.subarray(24) };
    return g;
  }
  // g: { W, H, X0, Z0, B, L, mat, bh, style, ward, bidRaw, far: { N, F, VF, lv } }
  async build(g, onProgress) {
    const { W, H } = g, N = W * H;
    Object.assign(this, { W, H, X0: g.X0, Z0: g.Z0, B: g.B, L: g.L, mat: g.mat, bh: g.bh, style: g.style, ward: g.ward, bidRaw: g.bidRaw, far: g.far });
    // PLATEAU の用途が「不明」の建物は、高さから住宅・マンション・ビルを推定して色を付ける
    for (let i = 0; i < N; i++) if (this.bh[i] && this.style[i] === 6) { const h = this.bh[i], r = hash(this.bidRaw[i], h * 7 + 1); this.style[i] = h <= 1 ? 0 : h <= 4 ? (r < 0.6 ? 1 : 3) : (r < 0.5 ? 2 : 1); }
    this.top = new Uint16Array(N);
    let mt = 0; for (let i = 0; i < N; i++) { this.top[i] = this.L[i] + this.bh[i]; if (this.top[i] > mt) mt = this.top[i]; }
    this.maxTop = mt * this.B;
    this.computeDistances();
    this.labelBuildings();
    this.group = new THREE.Group();
    this.nearMat = voxelMaterial(this.B, this.B);
    this.farMat = voxelMaterial(this.far.F, this.far.VF, 0.42); // 遠くの山（佐渡・弥彦）は霞みすぎないように
    const CH = 128, cx = Math.ceil(W / CH), cz = Math.ceil(H / CH);
    this.chunks = [];
    let done = 0; const total = cx * cz + 1;
    for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) {
      const g = this.buildChunk(i * CH, j * CH, Math.min(W, (i + 1) * CH), Math.min(H, (j + 1) * CH));
      if (g) { const m = new THREE.Mesh(g, this.nearMat); m.matrixAutoUpdate = false; this.group.add(m); this.chunks.push(m); }
      done++; if (done % 6 === 0) { onProgress?.(done / total); await new Promise(r => setTimeout(r)); }
    }
    const fg = this.buildFar();
    this.farMesh = new THREE.Mesh(fg, this.farMat); this.farMesh.matrixAutoUpdate = false; this.group.add(this.farMesh);
    this.water = this.buildWater();
    this.group.add(this.water);
    onProgress?.(1);
    let tris = 0; this.group.traverse(m => { if (m.geometry) tris += m.geometry.attributes.position.count / 3; });
    this.tris = tris;
    return this;
  }
  dispose() {
    this.group?.traverse(m => { m.geometry?.dispose(); });
    this.nearMat?.dispose(); this.farMat?.dispose(); this.waterMat?.uniforms.uDist.value.dispose(); this.waterMat?.dispose();
    this.group?.removeFromParent();
  }
  // 陸からの距離（水面の色・波打ち際）と海からの距離（松林）
  computeDistances() {
    const { W, H } = this, N = W * H;
    const bfs = (isSrc, passable, cap) => {
      const d = new Uint8Array(N).fill(255); const q = new Int32Array(N); let h = 0, t = 0;
      for (let i = 0; i < N; i++) if (isSrc(i)) { d[i] = 0; q[t++] = i; }
      while (h < t) {
        const i = q[h++], x = i % W, z = (i / W) | 0, nd = d[i] + 1; if (nd >= cap) continue;
        if (x > 0 && d[i - 1] > nd && passable(i - 1)) { d[i - 1] = nd; q[t++] = i - 1; }
        if (x < W - 1 && d[i + 1] > nd && passable(i + 1)) { d[i + 1] = nd; q[t++] = i + 1; }
        if (z > 0 && d[i - W] > nd && passable(i - W)) { d[i - W] = nd; q[t++] = i - W; }
        if (z < H - 1 && d[i + W] > nd && passable(i + W)) { d[i + W] = nd; q[t++] = i + W; }
      }
      return d;
    };
    const isWater = (i) => this.L[i] === 0;
    this.shoreDist = bfs(i => !isWater(i), isWater, 250);
    this.seaDist = bfs(i => this.mat[i] === M.SEA, i => !isWater(i), 120);
  }
  // 同じ高さ・同じ用途の連続セルを 1 棟とみなして色を決める
  // 建物ごとの色: PLATEAU の建物番号（build.py で 1..251 に丸めたもの）と高さで決める
  labelBuildings() {
    const N = this.W * this.H; this.bid = new Int32Array(N);
    for (let i = 0; i < N; i++) this.bid[i] = this.bh[i] ? this.bidRaw[i] * 31 + this.bh[i] : -1;
  }
  topPal(i) {
    if (this.bh[i]) { const s = WALLS[this.style[i]] || WALLS[6]; const r = s[1]; return pal(hex(r[(hash(this.bid[i], 7) * r.length) | 0]), K.ROOF); }
    const t = TERRAIN_TOP[this.mat[i]] || TERRAIN_TOP[M.GRASS];
    return pal(hex(t[0]), t[1]);
  }
  wallPal(i) { const s = WALLS[this.style[i]] || WALLS[6]; const w = s[0]; return pal(hex(w[(hash(this.bid[i], 3) * w.length) | 0]), s[2]); }
  heightAt(x, z) { // ワールド座標 → その地点の地面/建物の上面の高さ (m)
    const gx = Math.floor((x - this.X0) / this.B), gz = Math.floor((z - this.Z0) / this.B);
    if (gx < 0 || gz < 0 || gx >= this.W || gz >= this.H) {
      const f = this.far, fi = Math.floor(x / f.F + f.N / 2), fj = Math.floor(z / f.F + f.N / 2);
      if (fi < 0 || fj < 0 || fi >= f.N || fj >= f.N) return 0;
      const lv = f.lv[fj * f.N + fi]; return lv === 255 || lv === 0 ? 0 : this.B + (lv - 1) * f.VF;
    }
    const i = gz * this.W + gx; return this.top[i] * this.B;
  }
  cellAt(x, z) { const gx = Math.floor((x - this.X0) / this.B), gz = Math.floor((z - this.Z0) / this.B); return (gx < 0 || gz < 0 || gx >= this.W || gz >= this.H) ? -1 : gz * this.W + gx; }

  buildChunk(x0, z0, x1, z1) {
    const { W, H, B, L, mat, bh, top, X0, Z0 } = this;
    const buf = new Buf();
    const cw = x1 - x0, chh = z1 - z0;
    const isBridge = (i) => mat[i] === M.BRIDGE;
    const BR_BOT = 0.55 * B;
    // 上面: 貪欲法でまとめる
    const key = new Int32Array(cw * chh).fill(-1);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const i = z * W + x; if (top[i] === 0) continue;
      key[(z - z0) * cw + (x - x0)] = top[i] * 65536 + this.topPal(i);
    }
    const greedy = (key, emit) => {
      const used = new Uint8Array(key.length);
      for (let j = 0; j < chh; j++) for (let i = 0; i < cw; i++) {
        const k0 = key[j * cw + i]; if (k0 < 0 || used[j * cw + i]) continue;
        let w = 1; while (i + w < cw && key[j * cw + i + w] === k0 && !used[j * cw + i + w]) w++;
        let h = 1; outer: while (j + h < chh) { for (let t = 0; t < w; t++) if (key[(j + h) * cw + i + t] !== k0 || used[(j + h) * cw + i + t]) break outer; h++; }
        for (let a = 0; a < h; a++) for (let t = 0; t < w; t++) used[(j + a) * cw + i + t] = 1;
        emit(i, j, w, h, k0);
      }
    };
    greedy(key, (i, j, w, h, k0) => {
      const y = Math.floor(k0 / 65536) * B, pi = k0 % 65536;
      const ax = X0 + (x0 + i) * B, az = Z0 + (z0 + j) * B, bx = ax + w * B, bz = az + h * B;
      buf.quad([ax, y, az], [ax, y, bz], [bx, y, bz], [bx, y, az], [0, 127, 0], pi);
    });
    // 橋の裏面
    const bkey = new Int32Array(cw * chh).fill(-1);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) if (isBridge(z * W + x)) bkey[(z - z0) * cw + (x - x0)] = 1;
    const piBridge = pal(hex(0x9a9a9e), K.STONE);
    greedy(bkey, (i, j, w, h) => {
      const ax = X0 + (x0 + i) * B, az = Z0 + (z0 + j) * B, bx = ax + w * B, bz = az + h * B;
      buf.quad([ax, BR_BOT, az], [bx, BR_BOT, az], [bx, BR_BOT, bz], [ax, BR_BOT, bz], [0, -127, 0], piBridge);
    });
    // 側面: 隣より高い部分を、土・草の側面・壁の 3 区間に分けて連続区間をまとめる
    const dirt = pal([133, 97, 64], K.DIRT), gside = pal([133, 97, 64], K.GRASS_SIDE), sandSide = pal(hex(0xd8c68a), K.SAND), stoneSide = pal(hex(0x8f8f95), K.STONE);
    const segs = (i, n) => { // [lo, hi, pal][]
      const out = [];
      const tc = top[i] * B; if (!tc) return out;
      const nIn = n >= 0;
      const tn = nIn ? top[n] * B : 0;
      const bc = isBridge(i) ? BR_BOT : 0;
      let lo = Math.max(bc, tn), hi = tc;
      if (nIn && isBridge(n) && !isBridge(i)) { lo = 0; hi = Math.min(tc, BR_BOT); if (tc > B) out.push(...segsRange(i, B, tc)); }
      if (nIn && isBridge(n) && isBridge(i)) return out;
      if (hi > lo) out.push(...segsRange(i, lo, hi));
      return out;
    };
    const segsRange = (i, lo, hi) => {
      const out = []; const g = L[i] * B;
      if (isBridge(i)) { out.push([lo, hi, stoneSide]); return out; }
      const m = mat[i];
      const side = m === M.SAND ? sandSide : (m === M.STONE || m === M.CONCRETE || m === M.TOWN || m === M.ROAD || m === M.BIGROAD || m === M.RAIL) ? stoneSide : null;
      if (lo < g - B) out.push([lo, Math.min(hi, g - B), side || dirt]);
      if (hi > g - B && lo < g) out.push([Math.max(lo, g - B), Math.min(hi, g), side || (bh[i] || !GREEN_TOP.has(m) ? dirt : gside)]);
      if (hi > g) out.push([Math.max(lo, g), hi, this.wallPal(i)]);
      return out;
    };
    const DIRS = [[1, 0, [127, 0, 0]], [-1, 0, [-127, 0, 0]], [0, 1, [0, 0, 127]], [0, -1, [0, 0, -127]]];
    for (const [dx, dz, nrm] of DIRS) {
      const alongX = dx === 0; // 面が x 方向に並ぶ
      const outerN = alongX ? chh : cw, innerN = alongX ? cw : chh;
      for (let a = 0; a < outerN; a++) {
        let runs = []; // 開いている区間
        const flush = (keep) => { for (const r of runs) if (!keep.includes(r)) emitRun(r); runs = runs.filter(r => keep.includes(r)); };
        const emitRun = (r) => {
          const [lo, hi, pi, s, e] = r; // s..e = along index range
          let ax, az, bx, bz;
          if (alongX) { const z = z0 + a; const zf = Z0 + (z + (dz > 0 ? 1 : 0)) * B; ax = X0 + (x0 + s) * B; bx = X0 + (x0 + e + 1) * B; az = bz = zf;
            if (dz > 0) buf.quad([ax, lo, zf], [bx, lo, zf], [bx, hi, zf], [ax, hi, zf], nrm, pi); else buf.quad([bx, lo, zf], [ax, lo, zf], [ax, hi, zf], [bx, hi, zf], nrm, pi);
          } else { const x = x0 + a; const xf = X0 + (x + (dx > 0 ? 1 : 0)) * B; az = Z0 + (z0 + s) * B; bz = Z0 + (z0 + e + 1) * B;
            if (dx > 0) buf.quad([xf, lo, bz], [xf, lo, az], [xf, hi, az], [xf, hi, bz], nrm, pi); else buf.quad([xf, lo, az], [xf, lo, bz], [xf, hi, bz], [xf, hi, az], nrm, pi);
          }
        };
        for (let b = 0; b < innerN; b++) {
          const x = alongX ? x0 + b : x0 + a, z = alongX ? z0 + a : z0 + b;
          const i = z * W + x, nx = x + dx, nz = z + dz;
          const n = (nx < 0 || nz < 0 || nx >= W || nz >= H) ? -1 : nz * W + nx;
          const ss = segs(i, n); const keep = [];
          for (const sg of ss) {
            const r = runs.find(r => r[0] === sg[0] && r[1] === sg[1] && r[2] === sg[2] && r[4] === b - 1);
            if (r) { r[4] = b; keep.push(r); } else { const nr = [sg[0], sg[1], sg[2], b, b]; keep.push(nr); runs.push(nr); }
          }
          flush(keep);
        }
        flush([]);
      }
    }
    // 橋脚
    const pier = pal(hex(0x8c8c90), K.STONE);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const i = z * W + x;
      if (isBridge(i) && (x * 7 + z * 3) % 9 === 0) { const cx = X0 + (x + 0.5) * B, cz = Z0 + (z + 0.5) * B; buf.box(cx - 1.5, -2, cz - 1.5, cx + 1.5, BR_BOT, cz + 1.5, pier); }
    }
    // 木
    const leaf = [pal(hex(0x3f8f34), K.LEAVES), pal(hex(0x4c9e3c), K.LEAVES), pal(hex(0x5a9a2e), K.LEAVES), pal(hex(0xc8782f), K.LEAVES), pal(hex(0xd6a63a), K.LEAVES)];
    const pine = pal(hex(0x2f6b3a), K.PINE), wood = pal(hex(0x6b4a2b), K.WOOD);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const i = z * W + x; if (bh[i] || L[i] === 0) continue;
      const m = mat[i], r = hash(x, z);
      const p = m === M.FOREST ? 0.7 : m === M.PARK ? 0.28 : m === M.GRASS ? 0.06 : m === M.TOWN ? 0.025 : m === M.SAND ? (this.seaDist[i] > 3 ? 0.08 : 0) : 0;
      if (r >= p) continue;
      const g = L[i] * B, cx = X0 + (x + 0.5) * B + (hash(z, x) - 0.5) * 2, cz = Z0 + (z + 0.5) * B + (hash(x + 9, z) - 0.5) * 2;
      const big = hash(x * 3, z * 5);
      if (this.seaDist[i] < 40 && (m === M.FOREST || m === M.SAND || m === M.PARK)) { // 海岸の松林
        const th = B * (1.1 + big * 0.6);
        buf.box(cx - 0.8, g, cz - 0.8, cx + 0.8, g + th, cz + 0.8, wood);
        buf.box(cx - B * 0.55, g + th * 0.55, cz - B * 0.55, cx + B * 0.55, g + th * 0.85, cz + B * 0.55, pine, pine, true);
        buf.box(cx - B * 0.35, g + th * 0.85, cz - B * 0.35, cx + B * 0.35, g + th * 1.1, cz + B * 0.35, pine, pine, true);
      } else {
        const th = B * (0.5 + big * 0.4), s = B * (0.45 + big * 0.15);
        const lp = leaf[(hash(x + 1, z + 2) * (m === M.PARK || m === M.FOREST ? 5 : 3)) | 0];
        buf.box(cx - 0.7, g, cz - 0.7, cx + 0.7, g + th, cz + 0.7, wood);
        buf.box(cx - s, g + th, cz - s, cx + s, g + th + s * 1.6, cz + s, lp, lp, true);
      }
    }
    return buf.geometry();
  }

  // 遠景（佐渡・弥彦山・角田山・五頭連峰など。距離を圧縮してある）
  buildFar() {
    const { N, F, VF, lv } = this.far; const B = this.B;
    const buf = new Buf(); const half = N / 2;
    const yOf = (l) => l === 0 || l === 255 ? 0 : B - 1 + (l - 1) * VF;
    const colOf = (l, i, j) => {
      const realH = (l - 1) * VF / 1.5, r = hash(i, j);
      if (realH > 1350) return pal(hex(0xf2f4f6), K.SNOWCAP);
      if (realH > 900) return pal(hex(r < 0.5 ? 0x8b8378 : 0x7a7368), K.ROCK);
      if (realH > 250) return pal(hex([0x3d7a33, 0x467f37, 0xb8642c, 0xc99a34, 0x356b2e][(r * 5) | 0]), K.LEAVES);
      if (realH > 40) return pal(hex(r < 0.6 ? 0x4f8f3a : 0x5c9a3e), K.GRASS);
      return pal(hex(r < 0.55 ? 0xb9ae58 : (r < 0.8 ? 0x7fae4e : 0xb5ab95)), r < 0.55 ? K.FARM : K.GRASS);
    };
    const get = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? 0 : lv[j * N + i];
    // 上面: 同じ高さ・同じ色が横に続く所は 1 枚にまとめる
    for (let j = 0; j < N; j++) for (let i = 0; i < N;) {
      const l = lv[j * N + i]; if (l === 0 || l === 255) { i++; continue; }
      const ct = colOf(l, i >> 1, j >> 1); let w = 1;
      while (i + w < N && lv[j * N + i + w] === l && colOf(l, (i + w) >> 1, j >> 1) === ct) w++;
      const y = yOf(l), x0 = (i - half) * F, z0 = (j - half) * F, x1 = x0 + F * w, z1 = z0 + F;
      buf.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 127, 0], ct);
      i += w;
    }
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const l = lv[j * N + i]; if (l === 0 || l === 255) continue;
      const y = yOf(l), x0 = (i - half) * F, z0 = (j - half) * F, x1 = x0 + F, z1 = z0 + F;
      const side = pal(hex((l - 1) * VF / 1.5 > 900 ? 0x7d766c : 0x6e5a42), K.ROCK);
      for (const [di, dj, nrm] of [[1, 0, [127, 0, 0]], [-1, 0, [-127, 0, 0]], [0, 1, [0, 0, 127]], [0, -1, [0, 0, -127]]]) {
        const nl = get(i + di, j + dj); if (nl === 255) continue;
        const ny = yOf(nl); if (ny >= y) continue;
        if (di === 1) buf.quad([x1, ny, z1], [x1, ny, z0], [x1, y, z0], [x1, y, z1], nrm, side);
        if (di === -1) buf.quad([x0, ny, z0], [x0, ny, z1], [x0, y, z1], [x0, y, z0], nrm, side);
        if (dj === 1) buf.quad([x0, ny, z1], [x1, ny, z1], [x1, y, z1], [x0, y, z1], nrm, side);
        if (dj === -1) buf.quad([x1, ny, z0], [x0, ny, z0], [x0, y, z0], [x1, y, z0], nrm, side);
      }
    }
    return buf.geometry();
  }

  // 海・川・潟の水面（1 枚の大きな板。陸の柱がその上に立つ）
  buildWater() {
    const { W, H, X0, Z0, B } = this;
    const data = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) { data[i * 4] = this.shoreDist[i]; data[i * 4 + 1] = this.mat[i] === M.RIVER || this.mat[i] === M.BRIDGE ? 255 : 0; data[i * 4 + 3] = 255; }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat); tex.needsUpdate = true; tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uDist: { value: tex }, uGrid: { value: new THREE.Vector4(X0, Z0, W * B, H * B) }, uB: { value: B } },
      vertexShader: /* glsl */`varying vec3 vW; varying float vDist; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: COMMON + /* glsl */`
        uniform sampler2D uDist; uniform vec4 uGrid; uniform float uB; varying vec3 vW; varying float vDist;
        void main(){
          vec2 g = (vW.xz - uGrid.xy) / uGrid.zw; float d = 60.0; float river = 0.0;
          if (g.x > 0.0 && g.y > 0.0 && g.x < 1.0 && g.y < 1.0) { vec4 t = texture2D(uDist, g); d = t.r * 255.0; river = t.g; }
          vec2 q = floor(vW.xz / (uB / 8.0)) * (uB / 8.0); // ドット絵風に量子化
          float t = uTime;
          float w1 = sin(q.x * 0.045 + t * 1.1) + sin(q.y * 0.06 - t * 0.9) + 0.5 * sin((q.x + q.y) * 0.13 + t * 2.1);
          float w2 = cos(q.x * 0.07 - t * 1.3) + cos(q.y * 0.05 + t * 0.7);
          vec3 n = normalize(vec3(w1 * 0.06, 1.0, w2 * 0.06));
          vec3 shallow = mix(vec3(0.24, 0.66, 0.72), vec3(0.28, 0.5, 0.5), river);
          vec3 deep = mix(vec3(0.05, 0.2, 0.42), vec3(0.16, 0.36, 0.42), river);
          vec3 col = mix(shallow, deep, smoothstep(0.0, river > 0.5 ? 6.0 : 45.0, d));
          col *= 0.92 + 0.12 * h21(floor(q / 2.0));
          vec3 V = normalize(cameraPosition - vW);
          float fr = pow(1.0 - max(dot(n, V), 0.0), 4.0);
          col = mix(col, uSkyTop * 0.6 + uFogCol * 0.4, fr * 0.6);
          vec3 R = reflect(-uSunDir, n); float sp = pow(max(dot(R, V), 0.0), 120.0);
          col *= (uSkyAmb * 0.9 + uSunCol * 0.45);
          col += uSunCol * sp * 0.8 * (1.0 - uWet * 0.7);
          // 波打ち際の白波（海だけ）
          float foam = (1.0 - river) * step(d, 1.5 + 0.8 * sin(t * 1.4 + q.x * 0.02 + q.y * 0.03)) * step(0.35, h21(floor(q / 1.5) + floor(t * 3.0)));
          col = mix(col, vec3(0.95) * (uSkyAmb + uSunCol * 0.4), foam * 0.85);
          col += col * uFlash;
          gl_FragColor = vec4(applyFog(col, vDist), 1.0);
        }`,
    });
    const g = new THREE.PlaneGeometry(320000, 320000); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat); m.position.y = B * 0.78; this.waterMat = mat;
    return m;
  }

  // 2D マップ用の画像
  mapImage() {
    const { W, H } = this; const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(W, H);
    const C = { 0: 0x2f6fb0, 1: 0x4a9ad0, 2: 0xe8d9a2, 3: 0x86c35a, 4: 0xb8b8bc, 5: 0x8a7a6a, 6: 0x3f8a3a, 7: 0x8fd067, 8: 0xd8c86a, 9: 0xd8d0bc, 10: 0x9a9aa0, 11: 0x9a9aa0, 12: 0xc6c6cc, 13: 0x7ccc6a, 14: 0xa0a0a6, 15: 0x4a9ad0 };
    for (let i = 0; i < W * H; i++) {
      let c0 = C[this.mat[i]] ?? 0x86c35a;
      if (this.bh[i]) { const h = this.bh[i]; c0 = h > 6 ? 0x8c7e90 : h > 2 ? 0xb39a8c : 0xcbb3a0; }
      img.data[i * 4] = c0 >> 16; img.data[i * 4 + 1] = (c0 >> 8) & 255; img.data[i * 4 + 2] = c0 & 255; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); return c;
  }
}
