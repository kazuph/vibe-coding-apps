import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildStationPlan, HIDE_IDS } from './plan.js';
import { buildLandmarkModels } from './landmarks.js';
import { AREAS, INFO } from './info.js';

// ---- 座標系: 原点 = 北緯37.9125 東経139.0615（新潟駅付近）, x=東, y=上, z=南 (m)
const LAT0 = 37.9125, LON0 = 139.0615, KY = 111132.0, KX = 111320.0 * Math.cos(LAT0 * Math.PI / 180);
export const ll = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KY];

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = new THREE.Color(0xcfe3ee);
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 2500, 7000);
const camera = new THREE.PerspectiveCamera(45, 1, 2, 12000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.48; controls.minDistance = 20; controls.maxDistance = 5000;
controls.screenSpacePanning = false;

scene.add(new THREE.HemisphereLight(0xe8f2ff, 0x8f8672, 1.6));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 1.5;
scene.add(sun, sun.target);
const SUN_DIR = new THREE.Vector3(0.55, 0.75, -0.15).normalize();

// ---- 地面
const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshLambertMaterial({ color: 0xe6e2d7 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const layers = {};
function mkGroup(name) { const g = new THREE.Group(); g.name = name; scene.add(g); layers[name] = g; return g; }

function polysToMesh(list, y, color, holes = []) {
  const geos = [];
  for (const p of list) {
    const shape = new THREE.Shape(p.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2); g.translate(0, y, 0); geos.push(g);
  }
  const m = new THREE.Mesh(mergeGeos(geos), new THREE.MeshLambertMaterial({ color }));
  m.receiveShadow = true; return m;
}
function mergeGeos(geos) {
  let n = 0; for (const g of geos) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3); let o = 0;
  for (const g of geos) {
    const p = g.attributes.position.array;
    if (g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i++) { pos[o++] = p[ix[i] * 3]; pos[o++] = p[ix[i] * 3 + 1]; pos[o++] = p[ix[i] * 3 + 2]; } }
    else { pos.set(p, o); o += p.length; }
    g.dispose();
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.computeVertexNormals(); return out;
}
function ribbonsGeo(items, yOf) {
  const pos = [];
  for (const it of items) {
    const p = it.p, w = it.w / 2, y = yOf(it);
    for (let i = 0; i < p.length - 1; i++) {
      const [x0, z0] = p[i], [x1, z1] = p[i + 1];
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz); if (L < 0.01) continue;
      const nx = -dz / L * w, nz = dx / L * w;
      pos.push(x0 + nx, y, z0 + nz, x1 - nx, y, z1 - nz, x1 + nx, y, z1 + nz, x0 + nx, y, z0 + nz, x0 - nx, y, z0 - nz, x1 - nx, y, z1 - nz);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ---- OSM（道路・水面・緑地・鉄道）
function buildOSM(d) {
  const base = mkGroup('base');
  const water = polysToMesh(d.water, 0.25, 0x7fb3cf); base.add(water);
  const holes = polysToMesh(d.waterholes, 0.3, 0xe6e2d7); base.add(holes);
  base.add(polysToMesh(d.green.map(g => g.p), 0.35, 0xb5cf94));
  const ROADC = { motorway: 0x9aa0a5, trunk: 0x9ca1a6, primary: 0xa3a8ac, secondary: 0xabafb3, tertiary: 0xb3b6b9, footway: 0xd6cfc0, pedestrian: 0xd6cfc0, steps: 0xd6cfc0, path: 0xd6cfc0, cycleway: 0xd0c7b6 };
  const groups = {};
  for (const r of d.roads) {
    if (r.proposed) continue;
    const c = ROADC[r.c] ?? 0xbabcbe;
    (groups[c] ||= []).push(r);
  }
  for (const [c, items] of Object.entries(groups)) {
    const m = new THREE.Mesh(ribbonsGeo(items, r => (r.b ? 2.75 : 0.45) + (r.w > 9 ? 0.03 : 0)), new THREE.MeshLambertMaterial({ color: +c, side: THREE.DoubleSide }));
    m.receiveShadow = true; base.add(m);
  }
  // 計画道路（万代島ルート線）
  const prop = d.roads.filter(r => r.proposed);
  if (prop.length) { const m = new THREE.Mesh(ribbonsGeo(prop, () => 0.3), new THREE.MeshBasicMaterial({ color: 0xe0662b, transparent: true, opacity: 0.35, side: THREE.DoubleSide })); base.add(m); }

  // 鉄道（高架は推定高さの高架橋として表示）
  const rail = mkGroup('rail');
  const railH = r => r.b ? (r.hs === 'yes' ? 13.5 : 12.5) : 0.3;
  const deckItems = d.rails.map(r => ({ ...r, w: r.b ? 7 : 3.2 }));
  const deck = new THREE.Mesh(ribbonsGeo(deckItems, r => railH(r)), new THREE.MeshLambertMaterial({ color: 0xc9c6bd, side: THREE.DoubleSide }));
  deck.castShadow = deck.receiveShadow = true; rail.add(deck);
  const track = new THREE.Mesh(ribbonsGeo(d.rails.map(r => ({ ...r, w: 2.2 })), r => railH(r) + 0.08), new THREE.MeshLambertMaterial({ color: 0x6d6258, side: THREE.DoubleSide }));
  rail.add(track);
  // 橋脚
  const pierGeo = new THREE.BoxGeometry(1.4, 1, 5); const piers = [];
  for (const r of d.rails) {
    if (!r.b) continue;
    const H = railH(r);
    for (let i = 0; i < r.p.length - 1; i++) {
      const [x0, z0] = r.p[i], [x1, z1] = r.p[i + 1], L = Math.hypot(x1 - x0, z1 - z0);
      for (let s = 10; s < L; s += 25) piers.push([x0 + (x1 - x0) * s / L, z0 + (z1 - z0) * s / L, Math.atan2(x1 - x0, z1 - z0), H]);
    }
  }
  const pm = new THREE.InstancedMesh(pierGeo, new THREE.MeshLambertMaterial({ color: 0xbdb9ae }), piers.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
  piers.forEach(([x, z, a, H], i) => { Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a); V.set(x, H / 2, z); Sc.set(1, H, 1); M.compose(V, Q, Sc); pm.setMatrixAt(i, M); });
  pm.castShadow = true; rail.add(pm);
}

// ---- PLATEAU 建物
let buildingMesh, beforeMesh; // 各メッシュの userData.index = [[triStart, id, h, lod], ...]
function buildCity(buf, hidden, invert = false) {
  const dv = new DataView(buf); let o = 12;
  const n1 = dv.getUint32(4, true), n2 = dv.getUint32(8, true);
  const pos = [], col = [];
  const wallC = new THREE.Color(), roofC = new THREE.Color();
  const shade = (h, id) => {
    const t = Math.min(h / 80, 1), j = ((id * 2654435761) >>> 0) % 1000 / 1000;
    wallC.setHSL(0.08 + j * 0.07, 0.10 + j * 0.08, 0.80 - t * 0.08 - j * 0.07);
    roofC.setHSL(0.56 + j * 0.03, 0.06, 0.86 - j * 0.06);
  };
  // 地面近くを少し暗くして、簡易的な環境遮蔽（AO）の効果を出す
  const push = (c, ...xyz) => { for (let i = 0; i < xyz.length; i += 3) { const y = xyz[i + 1], k = y < 0.5 ? 0.72 : y < 8 ? 0.72 + y * 0.035 : 1; pos.push(xyz[i], y, xyz[i + 2]); col.push(c.r * k, c.g * k, c.b * k); } };
  let hiddenCount = 0;
  const index = [];
  for (let b = 0; b < n1; b++) {
    const id = dv.getUint32(o, true), n = dv.getUint16(o + 4, true), h = dv.getUint16(o + 6, true) / 10; o += 8;
    const ring = [];
    for (let i = 0; i < n; i++) { ring.push([dv.getInt16(o, true) / 4, dv.getInt16(o + 2, true) / 4]); o += 4; }
    if (hidden(id, ring, h) !== invert) { hiddenCount++; continue; }
    index.push([pos.length / 9, id, h, 1]);
    shade(h, id);
    const H = Math.max(h, 2.5);
    for (let i = 0; i < n; i++) {
      const [x0, z0] = ring[i], [x1, z1] = ring[(i + 1) % n];
      push(wallC, x0, 0, z0, x1, 0, z1, x1, H, z1, x0, 0, z0, x1, H, z1, x0, H, z0);
    }
    const v2 = ring.map(([x, z]) => new THREE.Vector2(x, z));
    const tris = THREE.ShapeUtils.triangulateShape(v2, []);
    for (const [a, bb, c] of tris) push(roofC, ring[a][0], H, ring[a][1], ring[c][0], H, ring[c][1], ring[bb][0], H, ring[bb][1]);
  }
  for (let b = 0; b < n2; b++) {
    const id = dv.getUint32(o, true), nv = dv.getUint16(o + 4, true), ni = dv.getUint32(o + 6, true); o += 10;
    const vx = new Float32Array(nv * 3), vk = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) { vx[i * 3] = dv.getInt16(o, true) / 4; vx[i * 3 + 1] = dv.getInt16(o + 2, true) / 4; vx[i * 3 + 2] = dv.getInt16(o + 4, true) / 4; vk[i] = dv.getUint8(o + 6); o += 7; }
    const idx = []; for (let i = 0; i < ni; i++) { idx.push(dv.getUint16(o, true)); o += 2; }
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, maxy = 0;
    for (let i = 0; i < nv; i++) { minx = Math.min(minx, vx[i * 3]); maxx = Math.max(maxx, vx[i * 3]); minz = Math.min(minz, vx[i * 3 + 2]); maxz = Math.max(maxz, vx[i * 3 + 2]); maxy = Math.max(maxy, vx[i * 3 + 1]); }
    const ring = [[minx, minz], [maxx, minz], [maxx, maxz], [minx, maxz]];
    if (hidden(id, ring, maxy) !== invert) { hiddenCount++; continue; }
    index.push([pos.length / 9, id, maxy, 2]);
    shade(maxy, id);
    for (let i = 0; i < ni; i += 3) {
      const a = idx[i], bb = idx[i + 1], c = idx[i + 2];
      // 法線を上向き/外向きにそろえるため、面の向きは DoubleSide で吸収
      push(vk[a] === 1 ? roofC : wallC, vx[a * 3], vx[a * 3 + 1], vx[a * 3 + 2], vx[bb * 3], vx[bb * 3 + 1], vx[bb * 3 + 2], vx[c * 3], vx[c * 3 + 1], vx[c * 3 + 2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.userData.index = index;
  if (invert) { beforeMesh = mesh; mkGroup('before').add(mesh); return; }
  buildingMesh = mesh;
  mkGroup('buildings').add(buildingMesh);
  console.log('buildings', index.length, 'hidden', hiddenCount, 'tris', pos.length / 9);
}
function buildingAt(mesh, tri) {
  const index = mesh.userData.index;
  let lo = 0, hi = index.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (index[mid][0] <= tri) lo = mid; else hi = mid - 1; }
  return index[lo];
}

// ---- ラベル
const labelEls = [];
function addLabel(l) {
  const el = document.createElement('div');
  el.className = 'lbl' + (l.plan ? ' plan' : '');
  // plan: 完成予想の計画要素 / modern: PLATEAU 2023年度より後に竣工したもの。どちらも「2023年計測時」表示では隠す
  if (l.plan || l.modern) el.dataset.afterSurvey = '1';
  el.textContent = l.name;
  el.onclick = (e) => { e.stopPropagation(); if (l.key) showInfo(l.key); };
  document.getElementById('labels').appendChild(el);
  labelEls.push({ el, v: new THREE.Vector3(...l.pos), far: l.far ?? 1800, w: el.offsetWidth + 8 });
}
const tmpV = new THREE.Vector3();
function updateLabels() {
  const w = innerWidth, h = innerHeight, show = toggles.labels, placed = [];
  const cand = [];
  for (const L of labelEls) {
    L.el.style.display = 'none';
    if (!show || L.el.dataset.hide === '1') continue;
    tmpV.copy(L.v).project(camera);
    const d = camera.position.distanceTo(L.v);
    if (tmpV.z > 1 || d > L.far || Math.abs(tmpV.x) > 1.1 || Math.abs(tmpV.y) > 1.1) continue;
    cand.push([d, L, (tmpV.x + 1) / 2 * w, (1 - tmpV.y) / 2 * h]);
  }
  cand.sort((a, b) => a[0] - b[0]);
  for (const [, L, x, y] of cand) {
    const bw = L.w || 120, bh = 22;
    const box = [x - bw / 2, y - bh, x + bw / 2, y];
    if (placed.some(p => !(box[2] < p[0] || box[0] > p[2] || box[3] < p[1] || box[1] > p[3]))) continue;
    placed.push(box);
    L.el.style.display = '';
    L.el.style.left = x + 'px'; L.el.style.top = y + 'px';
  }
}

// ---- 情報パネル
const side = document.getElementById('side'), sideBody = document.getElementById('sideBody');
function showInfo(key) {
  const it = INFO[key]; if (!it) return;
  sideBody.innerHTML = it.html;
  side.style.display = '';
}
document.getElementById('close').onclick = () => { side.style.display = 'none'; };

// ---- カメラ移動
let fly = null;
function goTo(a, instant = false) {
  const [tx, tz] = a.target, dist = a.dist, az = a.az * Math.PI / 180, el = a.el * Math.PI / 180;
  const T = new THREE.Vector3(tx, a.ty ?? 0, tz);
  const P = new THREE.Vector3(tx + dist * Math.cos(el) * Math.sin(az), (a.ty ?? 0) + dist * Math.sin(el), tz + dist * Math.cos(el) * Math.cos(az));
  if (instant) { camera.position.copy(P); controls.target.copy(T); controls.update(); return; }
  fly = { t: 0, p0: camera.position.clone(), t0: controls.target.clone(), p1: P, t1: T };
}

// ---- UI
const toggles = { plan: true, labels: true, shadows: true, rail: true };
function buildUI() {
  const areas = document.getElementById('areas');
  for (const a of AREAS) {
    const b = document.createElement('button'); b.textContent = a.name;
    b.onclick = () => { [...areas.children].forEach(c => c.classList.remove('on')); b.classList.add('on'); goTo(a); showInfo(a.info); history.replaceState(null, '', '#' + a.id); };
    b.dataset.id = a.id; areas.appendChild(b);
  }
  const tg = document.getElementById('toggles');
  const defs = [['plan', '完成予想 2027（オフ: 2023年計測時）'], ['labels', 'ラベル'], ['rail', '高架・鉄道'], ['shadows', '影']];
  for (const [k, name] of defs) {
    const b = document.createElement('button'); b.className = 'tog' + (toggles[k] ? ' on' : ''); b.textContent = name;
    b.onclick = () => { toggles[k] = !toggles[k]; b.classList.toggle('on', toggles[k]); applyToggles(); };
    tg.appendChild(b);
  }
}
function applyToggles() {
  if (layers.plan) layers.plan.visible = toggles.plan;
  if (layers.before) layers.before.visible = !toggles.plan;
  if (layers.landmarks) layers.landmarks.traverse(o => { if (o.userData.planOnly || o.userData.modern) o.visible = toggles.plan; });
  if (layers.rail) layers.rail.visible = toggles.rail;
  renderer.shadowMap.enabled = toggles.shadows; sun.castShadow = toggles.shadows;
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  for (const L of labelEls) if (L.el.dataset.afterSurvey) L.el.dataset.hide = toggles.plan ? '' : '1';
}

// ---- クリック（建物の実測高さ表示）
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  mouse.set(e.clientX / innerWidth * 2 - 1, -e.clientY / innerHeight * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const objs = [buildingMesh, ...(layers.landmarks ? [layers.landmarks] : []), ...(toggles.plan && layers.plan ? [layers.plan] : []), ...(!toggles.plan && beforeMesh ? [beforeMesh] : [])];
  // Raycaster は visible を見ないので、非表示の祖先を持つものは除く
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const hit = ray.intersectObjects(objs, true).find(h => shown(h.object));
  if (!hit) return;
  let o = hit.object; while (o && !o.userData.info && o.parent) o = o.parent;
  if (o && o.userData.info) { showInfo(o.userData.info); return; }
  if (hit.object === buildingMesh || hit.object === beforeMesh) {
    const before = hit.object === beforeMesh;
    const b = buildingAt(hit.object, hit.faceIndex);
    sideBody.innerHTML = `<h2>${before ? '2023年度計測時の建物（万代広場の整備で撤去）' : '既存建物'}</h2><div class="meta"><span class="badge b-m">実測</span>PLATEAU 新潟市 2023年度</div>
      <p>計測高さ: <b>${b[2].toFixed(1)} m</b>（LOD${b[3]}${b[3] === 2 ? '・屋根形状あり' : '・箱型'}）</p>
      <p style="color:var(--sub);font-size:12px">高さは航空測量による実測値。建物名は PLATEAU に含まれないため表示していません。</p>`;
    side.style.display = '';
  }
});

// ---- ループ
const clock = new THREE.Clock();
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (fly) {
    fly.t = Math.min(1, fly.t + dt / 1.4); const k = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
    camera.position.lerpVectors(fly.p0, fly.p1, k); controls.target.lerpVectors(fly.t0, fly.t1, k);
    if (fly.t >= 1) fly = null;
  }
  controls.update();
  // 影のカメラを注視点に追従
  const dist = camera.position.distanceTo(controls.target), R = THREE.MathUtils.clamp(dist * 0.9, 120, 1400);
  const sc = sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 3000; sc.updateProjectionMatrix();
  sun.target.position.copy(controls.target); sun.position.copy(controls.target).addScaledVector(SUN_DIR, 1500);
  renderer.render(scene, camera);
  updateLabels();
  requestAnimationFrame(frame);
}

// ---- 起動
async function main() {
  resize();
  buildUI();
  const [bin, osm] = await Promise.all([fetch('data/city.bin').then(r => r.arrayBuffer()), fetch('data/osm.json').then(r => r.json())]);
  buildOSM(osm);
  // 万代広場の整備で撤去された PLATEAU 建物（2023年度計測時点の仮設・工事中構造物）は計画モデルに置き換える
  const hidden = (id) => HIDE_IDS.has(id);
  buildCity(bin, hidden);
  buildCity(bin, hidden, true); // 2023年度計測時点の工事中構造物（「完成予想」オフで表示）
  const plan = buildStationPlan();
  const pg = mkGroup('plan'); pg.add(plan.group);
  plan.group.traverse(o => { if (o.isMesh) o.userData.info = o.userData.info || null; });
  plan.group.userData.info = 'bandai';
  plan.labels.forEach(addLabel);
  const lm = buildLandmarkModels({ ll, osm });
  const lg = mkGroup('landmarks'); lg.add(lm.group);
  lm.labels.forEach(addLabel);
  const hashArea = AREAS.find(a => '#' + a.id === location.hash) || AREAS[0];
  goTo(hashArea, true);
  document.querySelector(`#areas button[data-id="${hashArea.id}"]`)?.classList.add('on');
  showInfo(hashArea.info);
  applyToggles();
  document.getElementById('loading').remove();
  setTimeout(() => { const h = document.getElementById('hint'); if (h) h.style.opacity = 0; }, 6000);
  frame();
  window.__ready = true;
}
main().catch(e => { document.getElementById('loading').textContent = '読み込みに失敗しました: ' + e.message; console.error(e); });
window.__goto = (id) => { const a = AREAS.find(a => a.id === id); if (a) goTo(a, true); };
window.__cam = (tx, tz, dist, az, el, ty = 0) => goTo({ target: [tx, tz], dist, az, el, ty }, true);
