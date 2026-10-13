// 箒に乗った魔女（ボクセル）と、きらきらの軌跡
import * as THREE from 'three';

export function makeRider() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const box = (w, h, d, c, x, y, z, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); parent.add(m); return m; };
  // 前が -Z。単位はメートル（少し大きめにデフォルメ）
  box(0.28, 0.28, 4.2, 0x8a5a2b, 0, 0, -0.4);           // 柄
  box(0.32, 0.32, 0.25, 0xc9a24a, 0, 0, -2.4);           // 柄の先の飾り
  const bristle = new THREE.Group(); bristle.position.set(0, 0, 2.0); g.add(bristle);
  box(0.9, 0.9, 1.3, 0xe0b85a, 0, 0, 0.4, bristle);       // 穂
  box(1.1, 1.1, 0.7, 0xd4a645, 0, 0, 1.1, bristle);
  box(0.5, 0.5, 0.3, 0xa0522d, 0, 0, -0.35, bristle);     // 結び目
  const body = new THREE.Group(); body.position.set(0, 0.2, 0.4); g.add(body);
  box(0.9, 1.0, 0.7, 0x5b3c9e, 0, 0.55, 0, body);         // ローブ
  box(1.0, 0.35, 0.9, 0x4a2f86, 0, 0.1, 0, body);          // すそ
  box(0.3, 0.6, 0.3, 0x5b3c9e, -0.35, 0.1, -0.35, body);  // 足
  box(0.3, 0.6, 0.3, 0x5b3c9e, 0.35, 0.1, -0.35, body);
  box(0.3, 0.2, 0.4, 0x3a2410, -0.35, -0.2, -0.45, body); // 靴
  box(0.3, 0.2, 0.4, 0x3a2410, 0.35, -0.2, -0.45, body);
  box(0.25, 0.25, 0.75, 0x5b3c9e, -0.45, 0.75, -0.4, body); // 腕
  box(0.25, 0.25, 0.75, 0x5b3c9e, 0.45, 0.75, -0.4, body);
  box(0.7, 0.7, 0.7, 0xf2d0b0, 0, 1.4, 0, body);           // 顔
  box(0.76, 0.3, 0.76, 0xd9773a, 0, 1.6, 0.06, body);      // 髪
  box(0.74, 0.5, 0.3, 0xd9773a, 0, 1.25, 0.3, body);
  box(0.1, 0.1, 0.05, 0x222222, -0.16, 1.42, -0.36, body); // 目
  box(0.1, 0.1, 0.05, 0x222222, 0.16, 1.42, -0.36, body);
  const hat = new THREE.Group(); hat.position.set(0, 1.8, 0); body.add(hat);
  box(1.3, 0.12, 1.3, 0x241a3a, 0, 0, 0, hat);
  box(0.75, 0.4, 0.75, 0x241a3a, 0, 0.25, 0, hat);
  box(0.5, 0.4, 0.5, 0x241a3a, 0, 0.6, 0.05, hat);
  box(0.3, 0.4, 0.3, 0x241a3a, 0, 0.95, 0.15, hat);
  box(0.78, 0.12, 0.78, 0xffcc33, 0, 0.12, 0, hat);        // 帽子のリボン
  const cape = new THREE.Group(); cape.position.set(0, 1.0, 0.36); body.add(cape);
  const capeM = box(0.95, 1.1, 0.08, 0xc22a3a, 0, -0.5, 0, cape);
  const cat = new THREE.Group(); cat.position.set(0, 0.25, 1.35); g.add(cat); // 相棒の黒猫
  box(0.4, 0.35, 0.55, 0x1c1c22, 0, 0, 0, cat);
  box(0.36, 0.32, 0.32, 0x1c1c22, 0, 0.28, -0.25, cat);
  box(0.08, 0.12, 0.06, 0x1c1c22, -0.11, 0.48, -0.25, cat);
  box(0.08, 0.12, 0.06, 0x1c1c22, 0.11, 0.48, -0.25, cat);
  box(0.06, 0.06, 0.03, 0xffe14a, -0.08, 0.3, -0.42, cat);
  box(0.06, 0.06, 0.03, 0xffe14a, 0.08, 0.3, -0.42, cat);
  const tail = box(0.08, 0.08, 0.5, 0x1c1c22, 0, 0.15, 0.45, cat);
  g.scale.setScalar(1.5);
  g.userData = { cape, capeM, hat, tail, bristle };
  return g;
}

export function animateRider(r, t, boost) {
  const { cape, hat, tail } = r.userData;
  cape.rotation.x = 0.6 + Math.sin(t * (boost ? 22 : 12)) * 0.15 + (boost ? 0.4 : 0);
  hat.rotation.x = 0.15 + Math.sin(t * 7) * 0.05;
  tail.rotation.y = Math.sin(t * 5) * 0.5;
}

// きらきら（ほうきの後ろに残る光の粒）
export class Sparkles {
  constructor(scene, n = 400) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3).fill(-99999); this.age = new Float32Array(n).fill(99); this.col = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aAge', new THREE.BufferAttribute(this.age, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3));
    this.uScale = { value: 800 };
    this.points = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: this.uScale },
      vertexShader: `attribute float aAge; attribute vec3 aCol; uniform float uScale; varying float vA; varying vec3 vC;
        void main(){ vA = clamp(1.0 - aAge / 1.4, 0.0, 1.0); vC = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = uScale * (0.5 + vA) / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 q = abs(gl_PointCoord - 0.5); if (max(q.x, q.y) > 0.5) discard; gl_FragColor = vec4(vC * vA, vA); }`,
    }));
    this.points.frustumCulled = false; scene.add(this.points);
  }
  emit(p, color = [1, 0.85, 0.4], spread = 0.6) {
    const i = this.i++ % this.n;
    this.pos[i * 3] = p.x + (Math.random() - 0.5) * spread; this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread; this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
    this.age[i] = 0; this.col.set(color, i * 3);
  }
  burst(p, color, k = 60, R = 14) {
    for (let j = 0; j < k; j++) { const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI; this.emit(new THREE.Vector3(p.x + Math.cos(a) * Math.sin(b) * R, p.y + Math.cos(b) * R, p.z + Math.sin(a) * Math.sin(b) * R), color, 2); }
  }
  update(dt, h) {
    for (let i = 0; i < this.n; i++) { this.age[i] += dt; this.pos[i * 3 + 1] -= dt * 0.8; }
    this.uScale.value = h * 0.22;
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.aAge.needsUpdate = true; this.points.geometry.attributes.aCol.needsUpdate = true;
  }
}
