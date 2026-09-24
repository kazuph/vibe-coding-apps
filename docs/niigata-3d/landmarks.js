// 橋梁・PLATEAU 未収録の建物・ランドマークラベル
import * as THREE from 'three';

export const BRIDGE_TOP = 2.6;

function outlineAxis(p) {
  // 橋の外形ポリゴンから長軸方向・長さ・幅を求める（主成分）
  let cx = 0, cz = 0; for (const [x, z] of p) { cx += x; cz += z; } cx /= p.length; cz /= p.length;
  let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of p) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
  const a = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(a), uz = Math.sin(a);
  let lo = 1e9, hi = -1e9, wlo = 1e9, whi = -1e9;
  for (const [x, z] of p) { const s = (x - cx) * ux + (z - cz) * uz, t = -(x - cx) * uz + (z - cz) * ux; lo = Math.min(lo, s); hi = Math.max(hi, s); wlo = Math.min(wlo, t); whi = Math.max(whi, t); }
  const mid = (lo + hi) / 2, wm = (wlo + whi) / 2;
  return { cx: cx + ux * mid - uz * wm, cz: cz + uz * mid + ux * wm, ux, uz, len: hi - lo, wid: whi - wlo, ang: a };
}

function archBridge(ax, spans, stone) {
  // 萬代橋: 鉄筋コンクリート 6 連アーチ・御影石張り（重要文化財）
  const g = new THREE.Group();
  const L = ax.len, W = ax.wid, top = BRIDGE_TOP + 0.4;
  const sum = spans.reduce((a, b) => a + b, 0), abut = (L - sum) / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-L / 2, -1.2); shape.lineTo(-L / 2, top); shape.lineTo(L / 2, top); shape.lineTo(L / 2, -1.2);
  let x = L / 2 - abut;
  for (let i = spans.length - 1; i >= 0; i--) {
    const s = spans[i], rise = Math.min(s * 0.14, top - 0.2);
    shape.lineTo(x, -1.2);
    // 放物線アーチ
    for (let k = 1; k < 16; k++) { const t = k / 16; shape.lineTo(x - s * t, -1.2 + (rise + 1.2) * 4 * t * (1 - t)); }
    shape.lineTo(x - s, -1.2);
    x -= s;
  }
  shape.lineTo(-L / 2, -1.2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false, curveSegments: 4 });
  geo.translate(0, 0, -W / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: stone }));
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  // 欄干と照明灯（10基が復元）
  const rail = new THREE.BoxGeometry(L, 1.1, 0.5);
  for (const s of [-1, 1]) { const r = new THREE.Mesh(rail, new THREE.MeshLambertMaterial({ color: 0xcfc6b4 })); r.position.set(0, top + 0.55, s * (W / 2 - 0.25)); g.add(r); }
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2f3a3a });
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
    const px = -L / 2 + abut + (sum / 4) * i;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 7, 8), lampMat); pole.position.set(px, top + 3.5, s * (W / 2 - 0.3)); pole.castShadow = true; g.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3c8 })); lamp.position.set(px, top + 7.1, s * (W / 2 - 0.3)); g.add(lamp);
  }
  g.position.set(ax.cx, 0, ax.cz); g.rotation.y = -ax.ang;
  return g;
}

function girderBridge(ax, pierEvery, color) {
  const g = new THREE.Group();
  const L = ax.len, W = ax.wid;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(L, 1.6, W), new THREE.MeshLambertMaterial({ color }));
  deck.position.y = BRIDGE_TOP - 0.4; deck.castShadow = deck.receiveShadow = true; g.add(deck);
  const pm = new THREE.MeshLambertMaterial({ color: 0xb9b5aa });
  const n = Math.max(1, Math.round(L / pierEvery));
  for (let i = 1; i < n; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2, 3.5, W * 0.8), pm);
    p.position.set(-L / 2 + L * i / n, 0, 0); g.add(p);
  }
  for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(L, 1.0, 0.3), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 })); r.position.set(0, BRIDGE_TOP + 0.9, s * (W / 2 - 0.15)); g.add(r); }
  g.position.set(ax.cx, 0, ax.cz); g.rotation.y = -ax.ang;
  return g;
}

function extrude(p, h, color, opts = {}) {
  const shape = new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, ...opts }));
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function buildLandmarkModels({ ll, osm }) {
  const group = new THREE.Group();
  const labels = [];

  for (const b of osm.bridgeAreas) {
    const ax = outlineAxis(b.p);
    let obj;
    if (b.n === '萬代橋') {
      // 径間: 両端 39.0m / 41.5m / 中央 42.4m ×2（Wikipedia「萬代橋」）
      obj = archBridge(ax, [39.0, 41.5, 42.4, 42.4, 41.5, 39.0], 0xd9d2c3);
      obj.userData.info = 'bandaibashi';
    } else {
      obj = girderBridge(ax, b.n === '柳都大橋' ? ax.len / 3 : 26, 0xc9ccce);
      if (b.n === '柳都大橋') obj.userData.info = 'ryuto';
      if (b.n === '昭和大橋') obj.userData.info = 'showa';
    }
    group.add(obj);
  }

  // アイコニックタワー新潟ステーション（2025年6月竣工。PLATEAU 2023年度には未収録のため OSM 外形 + 公表高さで補完）
  for (const e of osm.extra) {
    const m = extrude(e.p, 103.85, 0xd6dde2);
    m.userData.info = 'iconic';
    m.userData.modern = true; // 「2023年計測時」表示では隠す
    group.add(m);
  }

  // 万代口東地区（JR東日本の計画。建物配置は未公表のため、敷地のみ表示）
  // OSM landuse=construction (way 1347117514)。旧在来線仮設ホーム跡地に一致するため同敷地と判断（推定）
  const site = [[56.9, -67.5], [67.4, -56.5], [76.5, -24.1], [213.1, -45.4], [198.5, -76.2], [111.3, -58.2], [100.8, -62.8], [91.8, -78.4]];

  const L = (name, lat, lon, h, key, far = 2600, plan = false) => { const [x, z] = ll(lat, lon); labels.push({ name, pos: [x, h, z], key, far, plan }); };
  L('新潟駅', 37.91247, 139.06281, 40, 'station', 4000);
  L('万代島ビル（朱鷺メッセ）140.5m', 37.92527, 139.05975, 150, 'bandaijima', 6000);
  L('朱鷺メッセ コンベンションセンター', 37.92710, 139.06050, 32, 'tokimesse', 3000);
  L('佐渡汽船 新潟港ターミナル', 37.93024, 139.06178, 22, 'sado', 2400);
  L('新潟日報メディアシップ 105m', 37.91855, 139.05596, 112, 'mediaship', 5000);
  L('萬代橋', 37.91951, 139.05327, 12, 'bandaibashi', 3500);
  L('柳都大橋', 37.92464, 139.0539, 10, 'ryuto', 2500);
  L('りゅーとぴあ', 37.91402, 139.04048, 40, 'ryutopia', 4000);
  L('新潟県民会館', 37.91305, 139.03945, 26, 'kenmin', 2400);
  L('新潟市音楽文化会館', 37.91328, 139.04156, 24, 'onbun', 2000);
  L('新潟県政記念館', 37.9148, 139.04038, 16, 'kensei', 1800);
  L('白山神社', 37.91579, 139.03872, 14, 'hakusan', 1800);
  L('新潟市陸上競技場', 37.9130639, 139.0369472, 18, 'rikujo', 2200);
  L('白山公園', 37.91440, 139.03935, 8, 'hakusanpark', 2000);
  L('昭和大橋', 37.9117, 139.0438, 10, 'showa', 2500);
  { const [x, z] = ll(37.91063, 139.05926); labels.push({ name: 'アイコニックタワー 103.85m', pos: [x, 110, z], key: 'iconic', far: 4000, modern: true }); }
  labels.push({ name: '南口広場', pos: [30, 12, 170], key: 'south', far: 1500 });
  labels.push({ name: '駅直下バスターミナル（高架下）', pos: [64, 8, 35], key: 'busterminal', far: 900 });
  const [sx, sz] = [135, -52];
  labels.push({ name: '万代口東地区 開発（2028年夏開業予定）', pos: [sx, 20, sz], key: 'bandaieast', far: 2000, plan: true });

  // 万代口東地区の敷地（OSM landuse=construction）の輪郭のみ
  const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints([...site, site[0]].map(([x, z]) => new THREE.Vector3(x, 0.8, z))), new THREE.LineBasicMaterial({ color: 0xe0662b }));
  outline.userData.planOnly = true;
  group.add(outline);

  return { group, labels };
}
