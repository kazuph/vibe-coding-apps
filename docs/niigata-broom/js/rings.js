// リングの配置・描画・通過判定
import * as THREE from 'three';
import { ll } from './world.js';

// t: p=ポイント b=加速 l=宙返り / hd=進行方向(度, 北=0 東=90) / agl=周りの建物・地面からの最低高さ / alt=最低高度(m)
const P = (id, name, lat, lon, o = {}) => ({ id, t: 'p', name, lat, lon, agl: 30, alt: 0, hd: 0, r: 16, pts: 100, ...o });
const POINT = [
  P('bandaibashi', '萬代橋', 37.91957, 139.05313, { agl: 18, hd: 50, note: '六連アーチの石の橋' }),
  P('toki', '朱鷺メッセ・万代島ビル', 37.92521, 139.05969, { dx: 70, alt: 110, hd: 330, note: '日本海側で一番高い展望室' }),
  P('next21', 'NEXT21', 37.92252, 139.04316, { dx: -55, alt: 95, hd: 0 }),
  P('mediaship', '新潟日報メディアシップ', 37.9186, 139.05607, { dx: 45, alt: 80, hd: 45 }),
  P('station', '新潟駅', 37.912, 139.0618, { agl: 25, hd: 90 }),
  P('iconic', 'アイコニックタワー', 37.9106, 139.0593, { dx: -40, alt: 85, hd: 180 }),
  P('bandaicity', '万代シテイ', 37.9172, 139.0566, { agl: 25, hd: 120 }),
  P('ryutopia', 'りゅーとぴあ・白山公園', 37.9142, 139.0401, { agl: 25, hd: 230 }),
  P('shiyakusho', '新潟市役所', 37.91568, 139.03665, { agl: 25, hd: 300 }),
  P('kencho', '新潟県庁', 37.90269, 139.02343, { dx: 50, alt: 70, hd: 200 }),
  P('marinepia', 'マリンピア日本海', 37.9226, 139.0266, { agl: 25, hd: 300 }),
  P('hiyoriyama', '日和山', 37.9316, 139.0455, { agl: 30, hd: 330 }),
  P('minatopia', 'みなとぴあ', 37.92965, 139.05776, { agl: 25, hd: 20 }),
  P('ryuto', '柳都大橋', 37.9232, 139.05572, { agl: 18, hd: 40 }),
  P('yachiyo', '八千代橋', 37.91515, 139.04946, { agl: 16, hd: 55 }),
  P('showa', '昭和大橋', 37.912, 139.0433, { agl: 16, hd: 60 }),
  P('bigswan', 'デンカビッグスワンスタジアム', 37.88255, 139.05916, { agl: 35, hd: 90 }),
  P('ecosta', 'HARD OFF ECOスタジアム', 37.87931, 139.06422, { agl: 30, hd: 90 }),
  P('toyanogata', '鳥屋野潟', 37.8879, 139.0522, { agl: 20, hd: 60 }),
  P('toyanopark', '鳥屋野潟公園', 37.88034, 139.04696, { agl: 22, hd: 250 }),
  P('nuttari', '沼垂テラス商店街', 37.9207, 139.0703, { agl: 22, hd: 0 }),
  P('furumachi', '古町', 37.9219, 139.0447, { agl: 25, hd: 315 }),
  P('honcho', '本町', 37.9214, 139.0476, { agl: 25, hd: 315 }),
  P('isetan', '新潟伊勢丹', 37.91543, 139.05473, { agl: 22, hd: 220 }),
  P('rikujo', '新潟市陸上競技場', 37.9131, 139.03693, { agl: 25, hd: 270 }),
  P('sekiya', '関屋分水の河口', 37.9085, 139.0032, { agl: 20, hd: 330 }),
  P('nishiko', '信濃川河口・新潟西港', 37.9445, 139.0651, { agl: 25, hd: 0 }),
  P('higashibo', '新潟港の防波堤', 37.9561, 139.0697, { agl: 30, hd: 30 }),
  P('offshore', '沖合（佐渡の方角）', 37.9503, 139.0205, { agl: 60, hd: 300, pts: 150 }),
  P('yorii', '寄居浜', 37.933, 139.0405, { agl: 25, hd: 240 }),
  P('minamiguchi', '新潟駅南口・けやき通り', 37.907, 139.062, { agl: 25, hd: 180 }),
  P('toyanoeast', '鳥屋野潟の東岸', 37.895, 139.068, { agl: 20, hd: 45 }),
  P('bypass', '新潟バイパス 女池IC', 37.8718, 139.0396, { agl: 30, hd: 90 }),
  P('upstream', '信濃川 上流', 37.8869, 139.0178, { agl: 20, hd: 0 }),
  P('bigswan_sky', 'ビッグスワン上空', 37.88255, 139.05916, { agl: 0, alt: 230, hd: 0, pts: 150 }),
  P('toki_top', '万代島ビル てっぺん', 37.92521, 139.05969, { agl: 25, hd: 60, pts: 200 }),
];
// 加速リングの連なり（信濃川・海岸線・鳥屋野潟）
const CHAINS = [
  { id: 'river', name: '信濃川', agl: 14, pts: 50, way: [[37.9035, 139.0300], [37.9088, 139.0368], [37.9120, 139.0433], [37.9138, 139.0465], [37.91515, 139.04946], [37.9172, 139.0512], [37.9213, 139.0543], [37.9232, 139.05572], [37.9275, 139.0592], [37.932, 139.0618], [37.9372, 139.0636]] },
  { id: 'coast', name: '海岸線', agl: 22, pts: 50, way: [[37.9110, 139.0080], [37.9160, 139.0160], [37.9205, 139.0235], [37.9250, 139.0305], [37.9290, 139.0370], [37.9325, 139.0435], [37.9355, 139.0500]] },
  { id: 'lake', name: '鳥屋野潟', agl: 14, pts: 50, way: [[37.8835, 139.0440], [37.8862, 139.0490], [37.8890, 139.0545], [37.8925, 139.0600], [37.8958, 139.0650]] },
];
// 宙返りリング（縦の円に並べる）
const LOOPS = [
  { id: 'loop_toyano', name: '鳥屋野潟の宙返り', lat: 37.8885, lon: 139.0525, hd: 60, R: 44, base: 40 },
  { id: 'loop_river', name: 'やすらぎ堤の宙返り', lat: 37.9175, lon: 139.0515, hd: 50, R: 44, base: 45 },
  { id: 'loop_sea', name: '日本海の宙返り', lat: 37.9420, lon: 139.0420, hd: 300, R: 44, base: 50 },
];

const hdVec = (hd) => new THREE.Vector3(Math.sin(hd * Math.PI / 180), 0, -Math.cos(hd * Math.PI / 180));

export class Rings {
  constructor(scene, world) {
    this.world = world; this.list = [];
    const maxTop = (x, z, r) => { let m = 0; for (let a = -r; a <= r; a += 4) for (let b = -r; b <= r; b += 4) m = Math.max(m, world.heightAt(x + a, z + b)); return m; };
    for (const p of POINT) {
      const [x0, z0] = ll(p.lat, p.lon); const x = x0 + (p.dx || 0), z = z0 + (p.dz || 0);
      const y = Math.max(p.alt, maxTop(x, z, p.r + 6) + p.agl + p.r);
      this.list.push({ ...p, pos: new THREE.Vector3(x, y, z), n: hdVec(p.hd) });
    }
    for (const c of CHAINS) {
      const pts = c.way.map(([la, lo]) => { const [x, z] = ll(la, lo); return new THREE.Vector3(x, 0, z); });
      pts.forEach((p, i) => {
        const nx = pts[Math.min(i + 1, pts.length - 1)], pv = pts[Math.max(i - 1, 0)];
        const n = nx.clone().sub(pv).setY(0).normalize();
        const r = 14; p.y = maxTop(p.x, p.z, r + 4) + c.agl + r;
        this.list.push({ id: `${c.id}_${i + 1}`, t: 'b', name: `${c.name}の加速リング ${i + 1}`, group: c.name, pos: p, n, r, pts: c.pts });
      });
    }
    for (const L of LOOPS) {
      const [x, z] = ll(L.lat, L.lon), f = hdVec(L.hd), up = new THREE.Vector3(0, 1, 0);
      const cy = maxTop(x, z, L.R) + L.base + L.R;
      const n = 8;
      for (let k = 0; k < n; k++) {
        const th = k / n * Math.PI * 2;
        const pos = new THREE.Vector3(x, cy, z).addScaledVector(f, Math.sin(th) * L.R).addScaledVector(up, -Math.cos(th) * L.R);
        const dir = f.clone().multiplyScalar(Math.cos(th)).addScaledVector(up, Math.sin(th)).normalize();
        this.list.push({ id: `${L.id}_${k + 1}`, t: 'l', name: `${L.name} ${k + 1}/${n}`, group: L.name, pos, n: dir, r: 15, pts: 80 });
      }
    }
    this.total = this.list.length;
    this.totalPts = this.list.reduce((s, r) => s + r.pts, 0);
    this.build(scene);
  }
  build(scene) {
    const SEG = 20; this.SEG = SEG;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false }), this.list.length * SEG);
    this.mesh.frustumCulled = false;
    this.col = { p: new THREE.Color(0xffd23f), b: new THREE.Color(0x3ff0ff), l: new THREE.Color(0xff5fd2), done: new THREE.Color(0x8a8f99) };
    this.list.forEach((r, i) => {
      r.q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), r.n);
      for (let s = 0; s < SEG; s++) this.mesh.setColorAt(i * SEG + s, (s % 2 ? this.col[r.t].clone().multiplyScalar(0.8) : this.col[r.t]));
    });
    scene.add(this.mesh);
    // 名前ラベル（ポイントリングのみ）
    this.labels = new THREE.Group(); scene.add(this.labels);
    for (const r of this.list) {
      if (r.t !== 'p') continue;
      const c = document.createElement('canvas'); const ctx = c.getContext('2d'); c.width = 512; c.height = 96;
      ctx.font = 'bold 44px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(20,24,40,.85)'; ctx.strokeText(r.name, 256, 48); ctx.fillStyle = '#fff'; ctx.fillText(r.name, 256, 48);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      sp.scale.set(64, 12, 1); sp.position.copy(r.pos).add(new THREE.Vector3(0, r.r + 12, 0)); sp.renderOrder = 5;
      r.label = sp; this.labels.add(sp);
    }
    this.burst = [];
  }
  setDone(done) { this.done = done; this.refreshColors(); }
  refreshColors() {
    this.list.forEach((r, i) => {
      const d = this.done[r.id];
      for (let s = 0; s < this.SEG; s++) this.mesh.setColorAt(i * this.SEG + s, d ? this.col.done : (s % 2 ? this.col[r.t].clone().multiplyScalar(0.75) : this.col[r.t]));
    });
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(t, camPos) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    this.list.forEach((r, i) => {
      const done = this.done[r.id];
      const pulse = done ? 0.8 : 1 + 0.08 * Math.sin(t * 4 + i);
      const rr = r.r * (done ? 0.9 : 1), cs = r.r * 0.2 * pulse;
      for (let k = 0; k < this.SEG; k++) {
        const a = k / this.SEG * Math.PI * 2 + t * (r.t === 'b' ? 1.5 : 0.5) * (done ? 0.2 : 1);
        p.set(Math.cos(a) * rr, Math.sin(a) * rr, 0).applyQuaternion(r.q).add(r.pos);
        e.setFromAxisAngle(zAxis, a); q.copy(r.q).multiply(e);
        s.set(cs, cs, cs * (r.t === 'b' ? 1.8 : 1));
        m.compose(p, q, s); this.mesh.setMatrixAt(i * this.SEG + k, m);
      }
      if (r.label) { const d = r.pos.distanceTo(camPos); r.label.visible = d < 900; r.label.material.opacity = Math.min(1, (900 - d) / 300); }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  // p0→p1 の移動でリングを通過したか
  check(p0, p1) {
    const hits = [];
    for (const r of this.list) {
      if (r.pos.distanceToSquared(p1) > (r.r + 120) ** 2) continue;
      const d0 = p0.clone().sub(r.pos).dot(r.n), d1 = p1.clone().sub(r.pos).dot(r.n);
      if ((d0 > 0) === (d1 > 0) || d0 === d1) continue;
      const x = p0.clone().lerp(p1, d0 / (d0 - d1));
      if (x.distanceTo(r.pos) < r.r * 1.1) hits.push(r);
    }
    return hits;
  }
  nearestOpen(pos) {
    let best = null, bd = Infinity;
    for (const r of this.list) { if (this.done[r.id]) continue; const d = r.pos.distanceTo(pos); if (d < bd) { bd = d; best = r; } }
    return best ? { r: best, d: bd } : null;
  }
}
