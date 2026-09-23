// 新潟駅 万代広場（2027年春 全面供用予定）の計画モデル
//
// 配置の出典:
//  (1) 竣工済みの上屋・デッキ・トイレ・交番: OpenStreetMap に 2026年時点で描かれた外形（building=roof ほか）
//  (2) 工事中の中央エリアなど: 新潟市「万代広場の整備」のエリア区分図 (ekishu_bandai.images/areaimage.png, 800x640px)
//      と「(仮称)新潟駅万代広場整備計画」(令和2年10月) p.18 イメージスケッチ
// (2) はエリア区分図の画素座標で書き、toWorld() で実座標（原点 = 新潟駅付近, x=東, z=南, 単位 m）に変換する。
// 変換は、(1) の竣工済み要素 5 点と図上の同じ要素を最小二乗で合わせた相似変換
// （縮尺 0.312 m/px、回転 -16.1°、残差 5〜12m）。

import * as THREE from 'three';

const TA = 0.3000, TB = -0.0869, TX = -182.33, TZ = -112.66;
export function toWorld(ix, iy) { return [TA * ix - TB * iy + TX, TB * ix + TA * iy + TZ]; }
const W = (p) => toWorld(p[0], p[1]);
const S = Math.hypot(TA, TB);
const RX = [TA / S, TB / S];  // 図の右方向（東北東 = 線路方向）

// 整備で撤去済み・工事中だった PLATEAU（2023年度）の建物 ID。
// 2026年の OSM に対応する建物がなく、上屋・デッキ・車路に置き換わっているもの。
export const HIDE_IDS = new Set([12076, 12411, 12427, 12462, 12496, 12707, 12744, 12878, 13017, 13625, 13656, 13883, 13948, 15362, 15580, 16072,
  12147, 12184, 12643, 13235, 13333, 13388, 13534]);

// 広場の舗装範囲（エリア区分図の外周）
export const PLAZA_IMG = [[98, 162], [690, 158], [692, 380], [738, 392], [742, 452], [98, 470]];
export const PLAZA_WORLD = PLAZA_IMG.map(W);

// OSM から取った竣工済み要素（実座標）
const OSM_DECK = [[-102.8, 33.2], [-104.5, 28.1], [-34.9, 6.0], [-41.0, -11.9], [20.5, -42.7], [30.5, -15.0], [73.7, -26.2], [75.0, -21.8]]; // way 1462083867 (layer=2)
const OSM_BIGROOF = [[-41.0, -11.9], [20.5, -42.7], [30.5, -15.0], [-34.9, 6.0]];
const OSM_TOILET = [[-98.6, -64.8], [-91.3, -59.8], [-69.6, -68.1], [-69.4, -76.2]];   // way 1495973120
const OSM_KOBAN = [[-118.8, -52.3], [-104.2, -58.2], [-101.7, -52.0], [-116.3, -46.1]]; // way 1495973121 新潟駅前交番
// 上屋の中心線（OSM building=roof の細長い外形の中心線）
const OSM_SHELTERS = [
  [[68, -20], [58, -55], [42, -66], [27, -76], [13, -103], [-3, -111]],   // 東エリア（way 1462083865）
  [[8, -113], [22, -122]],
  [[-14, -93], [20, -24]],                                              // 中央エリア東縁（way 1462083868）
  [[-120, -55], [-104, -61], [-92, -55], [-66, -68]],                   // 西エリア（way 1495973119）
  [[-63, -72], [-38, -11]],
  [[-134, -59], [-116, -15], [-105, 33]],                               // 西縁（way 1462083866）
];

// 高さなど公表されていない値（推定）
export const EST = {
  shelterH: 5.2,      // 上屋の高さ: 設計条件「歩行空間 3.2m以上 / バス車道 4.7m以上」(中間報告) を満たす値として推定
  shelterR: 5.5,      // 上屋ユニットの半径: 竣工写真から推定
  deckH: 7.0,         // ペデストリアンデッキ床高（2階レベル, 推定）
  roofH: 15.5,        // デッキ中央大屋根の高さ（推定）
  moundH: 0.9,        // 築山ステージの高さ（推定）
};

// ---- 図から読み取った要素（エリア区分図の画素座標） ----
const ROUNDABOUT = { c: [618, 446], r: 30 };
// 透明感のある水色の上屋（信濃川・阿賀野川・潟を表現）: 未竣工の中央エリア部分のみ図から
const SHELTER_CHAINS = [
  // 北側（東大通側）の歩行者動線
  { pts: [[150, 222], [190, 214], [232, 212], [268, 226], [300, 236], [330, 214], [352, 190], [372, 176]], r: 1 },
  // 中央エリア北側
  { pts: [[372, 176], [410, 170], [450, 172], [500, 170]], r: 0.9 },
];
// 8つのステージ（築山・里山）
const MOUNDS = [
  { c: [446, 214], r: 21 }, { c: [474, 238], r: 16 }, { c: [381, 280], r: 22 }, { c: [437, 302], r: 27, lawn: true },
  { c: [490, 307], r: 15 }, { c: [380, 345], r: 20 }, { c: [490, 364], r: 20 }, { c: [395, 391], r: 22 },
];
// 西エリア: 一般車整理場 / タクシープール / スロープ
const CAR_ROWS = [{ x0: 176, x1: 300, y: 282 }, { x0: 176, x1: 300, y: 300 }, { x0: 230, x1: 300, y: 338 }];
const TAXI_POOL = { x0: 226, x1: 306, y0: 405, y1: 452 };
const RAMP = [[140, 238], [141, 300], [146, 350], [164, 372], [210, 376], [258, 372], [296, 362], [318, 338], [306, 318], [286, 326]];
const LAWNS = [
  [[160, 456], [318, 446], [320, 468], [162, 470]],
  [[118, 250], [128, 250], [128, 360], [118, 360]],
];
const LIFT = { c: [352, 440], w: 22, d: 18 };               // 中央昇降棟（階段・EV・エスカレーター）

// ------------------------------------------------------------
function flatPoly(ptsW, y, color, opts = {}) {
  const shape = new THREE.Shape(ptsW.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, ...opts }));
  m.receiveShadow = true;
  return m;
}
function ribbon(ptsW, width, y, color) {
  const pos = [];
  for (let i = 0; i < ptsW.length - 1; i++) {
    const [x0, z0] = ptsW[i], [x1, z1] = ptsW[i + 1];
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
    const nx = -dz / L * width / 2, nz = dx / L * width / 2;
    pos.push(x0 + nx, y, z0 + nz, x1 + nx, y, z1 + nz, x1 - nx, y, z1 - nz, x0 + nx, y, z0 + nz, x1 - nx, y, z1 - nz, x0 - nx, y, z0 - nz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}
function resample(ptsW, step) {
  const out = [];
  for (let i = 0; i < ptsW.length - 1; i++) {
    const [x0, z0] = ptsW[i], [x1, z1] = ptsW[i + 1];
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step));
    for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n]);
  }
  out.push(ptsW[ptsW.length - 1]);
  return out;
}

function extrudeW(ptsW, y0, h, color) {
  const shape = new THREE.Shape(ptsW.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); geo.translate(0, y0, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildStationPlan() {
  const g = new THREE.Group();
  g.name = 'stationPlan';
  const labels = [];
  const add = (o) => { g.add(o); return o; };

  // 地面（舗装）
  add(flatPoly(PLAZA_WORLD, 0.38, 0xe8dcc6));
  // 西エリア 車路（アスファルト）
  add(flatPoly([[98, 196], [334, 196], [334, 470], [98, 470]].map(W), 0.41, 0x8d9296));
  // 東エリアのバス車路は OSM（bus=designated, 2024-03-31 供用）の道路として描画
  {
    const c = W(ROUNDABOUT.c), r = ROUNDABOUT.r * S;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.5, r, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(c[0], 0.62, c[1]); add(ring);
  }
  // スロープ（赤色舗装）
  add(ribbon(RAMP.map(W), 6, 0.6, 0xa65a5a));
  for (const l of LAWNS) add(flatPoly(l.map(W), 0.6, 0x7fae5a));

  // 駐車車両
  const carGeo = new THREE.BoxGeometry(4.4, 1.5, 1.8);
  const carMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  const taxiMat = new THREE.MeshLambertMaterial({ color: 0xf1c232 });
  const rot = Math.atan2(-RX[1], RX[0]);
  const cars = [];
  for (const row of CAR_ROWS) for (let x = row.x0; x <= row.x1; x += 8.5) cars.push([W([x, row.y]), carMat, rot + Math.PI / 2]);
  for (let y = TAXI_POOL.y0; y <= TAXI_POOL.y1; y += 11) for (let x = TAXI_POOL.x0; x <= TAXI_POOL.x1; x += 20) cars.push([W([x, y]), taxiMat, rot]);
  for (const [p, m, r] of cars) { const c = new THREE.Mesh(carGeo, m); c.position.set(p[0], 0.95, p[1]); c.rotation.y = r; c.castShadow = true; add(c); }

  // 8つのステージ（築山）+ 植栽
  const treeTrunk = new THREE.CylinderGeometry(0.18, 0.25, 2.2, 6);
  const treeTop = new THREE.IcosahedronGeometry(1.7, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const leafMats = [0x5f9442, 0x6d9f4c, 0x8a5a78, 0x4f8a3e].map(c => new THREE.MeshLambertMaterial({ color: c, flatShading: true }));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const m of MOUNDS) {
    const c = W(m.c), r = m.r * S;
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.8, r + 1.0, 0.35, 40), new THREE.MeshLambertMaterial({ color: 0xd8c9ae }));
    edge.position.set(c[0], 0.3, c[1]); edge.receiveShadow = true; add(edge);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: m.lawn ? 0x8fbf5f : 0x78a856 }));
    hill.scale.y = EST.moundH / r; hill.position.set(c[0], 0.45, c[1]); hill.receiveShadow = true; add(hill);
    if (!m.lawn) {
      const n = Math.round(r * 0.9);
      for (let i = 0; i < n; i++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * 0.75;
        const x = c[0] + Math.cos(a) * d, z = c[1] + Math.sin(a) * d, s = 0.8 + rnd() * 0.6;
        const t = new THREE.Mesh(treeTrunk, trunkMat); t.position.set(x, 1.4, z); t.scale.setScalar(s); add(t);
        const l = new THREE.Mesh(treeTop, leafMats[i % 4]); l.position.set(x, 1.3 + 2.4 * s, z); l.scale.set(s, s * 1.2, s); l.castShadow = true; add(l);
      }
    }
  }
  // 北側の街路樹（東大通沿い）
  for (let x = 110; x <= 330; x += 22) {
    const p = W([x, 188]);
    const l = new THREE.Mesh(treeTop, leafMats[0]); l.position.set(p[0], 3.4, p[1]); l.castShadow = true; add(l);
    const t = new THREE.Mesh(treeTrunk, trunkMat); t.position.set(p[0], 1.1, p[1]); add(t);
  }

  // 上屋（シェルター）: 円形ガラス屋根ユニット + 樹状柱
  const shelterMat = new THREE.MeshPhongMaterial({ color: 0x62c2c0, transparent: true, opacity: 0.5, shininess: 80, side: THREE.DoubleSide, depthWrite: false });
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xf4f7f7 });
  const colMat = new THREE.MeshLambertMaterial({ color: 0xf0f2f2 });
  const H = EST.shelterH;
  const colGeo = new THREE.CylinderGeometry(0.16, 0.22, H - 1.4, 8);
  const branchGeo = new THREE.CylinderGeometry(0.08, 0.12, 2.6, 6);
  const chains = [...OSM_SHELTERS.map(pts => ({ w: pts, r: 1 })), ...SHELTER_CHAINS.map(c => ({ w: c.pts.map(W), r: c.r }))];
  for (const ch of chains) {
    const R = EST.shelterR * ch.r;
    for (const [x, z] of resample(ch.w, R * 1.45)) {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.97, 0.18, 36, 1, true), shelterMat);
      disc.position.set(x, H, z); add(disc);
      const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 36), shelterMat);
      cap.rotation.x = -Math.PI / 2; cap.position.set(x, H + 0.09, z); cap.castShadow = true; add(cap);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 4, 36), rimMat);
      rim.rotation.x = Math.PI / 2; rim.position.set(x, H + 0.05, z); add(rim);
      const col = new THREE.Mesh(colGeo, colMat); col.position.set(x, (H - 1.4) / 2, z); col.castShadow = true; add(col);
      for (let k = 0; k < 4; k++) {
        const b = new THREE.Mesh(branchGeo, colMat), a = k * Math.PI / 2 + 0.4;
        b.position.set(x + Math.cos(a) * 0.9, H - 0.75, z + Math.sin(a) * 0.9);
        b.rotation.set(Math.sin(a) * 0.75, 0, -Math.cos(a) * 0.75); add(b);
      }
    }
  }
  // 西エリア: トイレ（OSM 外形）+ 白い格子のガラス屋根
  {
    const box = extrudeW(OSM_TOILET, 0, 3.6, 0xe9e4da); add(box);
    add(extrudeW(OSM_KOBAN, 0, 4.2, 0xd8d2c4));
    let cx = 0, cz = 0; for (const [x, z] of OSM_TOILET) { cx += x; cz += z; } cx /= 4; cz /= 4;
    const ang = Math.atan2(OSM_TOILET[2][1] - OSM_TOILET[0][1], OSM_TOILET[2][0] - OSM_TOILET[0][0]);
    const roofMat = new THREE.MeshPhongMaterial({ color: 0xffffff, transparent: true, opacity: 0.78, side: THREE.DoubleSide });
    const roof = new THREE.Mesh(new THREE.CircleGeometry(1, 48), roofMat);
    roof.rotation.set(-Math.PI / 2, 0, -ang); roof.scale.set(20, 9, 1); roof.position.set(cx, 5.6, cz); roof.castShadow = true; add(roof);
    const grid = new THREE.Mesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0xaab6ba, wireframe: true }));
    grid.rotation.copy(roof.rotation); grid.scale.copy(roof.scale); grid.position.set(cx, 5.65, cz); add(grid);
    for (const k of [-0.6, 0, 0.6]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 5.6, 8), colMat);
      col.position.set(cx + Math.cos(ang) * 20 * k, 2.8, cz + Math.sin(ang) * 20 * k); add(col);
    }
    labels.push({ name: 'トイレ・西側ガラス屋根', pos: [cx, 8, cz], plan: true, key: 'toilet' });
  }

  // ペデストリアンデッキ（2階レベル, OSM 外形）と中央大屋根
  {
    const deck = extrudeW(OSM_DECK, EST.deckH - 1.2, 1.2, 0xdedad2); add(deck);
    for (const [x, z] of resample(OSM_DECK.slice(1, 7), 18)) {
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, EST.deckH - 1.2, 10), colMat); pil.position.set(x, (EST.deckH - 1.2) / 2, z); pil.castShadow = true; add(pil);
    }
    add(ribbon(OSM_DECK.slice(1, 7), 0.12, EST.deckH + 0.6, 0xbfe3e6));
    const roof = extrudeW(OSM_BIGROOF, EST.roofH, 0.9, 0xf7f7f5); add(roof);
    for (const [x, z] of OSM_BIGROOF) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, EST.roofH, 10), colMat); c.position.set(x, EST.roofH / 2, z); c.castShadow = true; add(c);
    }
    const lp = W(LIFT.c);
    const lift = new THREE.Mesh(new THREE.BoxGeometry(LIFT.w * S, EST.deckH + 4, LIFT.d * S), new THREE.MeshPhongMaterial({ color: 0xa9c9cf, transparent: true, opacity: 0.85 }));
    lift.position.set(lp[0], (EST.deckH + 4) / 2, lp[1]); lift.rotation.y = rot; lift.castShadow = true; add(lift);
    labels.push({ name: 'ペデストリアンデッキ・中央大屋根', pos: [-5, EST.roofH + 3, -15], plan: true, key: 'deck' });
    labels.push({ name: '中央昇降棟', pos: [lp[0], EST.deckH + 6, lp[1]], plan: true, key: 'lift' });
  }

  const cW = W([420, 330]), cE = W([610, 300]), cWest = W([220, 330]);
  labels.push({ name: '万代広場 中央エリア（8つのステージ）', pos: [cW[0], 9, cW[1]], plan: true, key: 'central' });
  labels.push({ name: '東エリア バス乗降場', pos: [cE[0], 9, cE[1]], plan: true, key: 'east' });
  labels.push({ name: '西エリア タクシー・一般車', pos: [cWest[0], 9, cWest[1]], plan: true, key: 'west' });

  g.traverse(o => { if (o.isMesh && o.castShadow === undefined) o.castShadow = false; });
  return { group: g, labels };
}
