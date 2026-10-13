// 空・雲・雨/雪・天気
import * as THREE from 'three';
import { U } from './world.js';

const C = (h) => new THREE.Color(h);
// 天気プリセット。sunEl/sunAz は度（方位は北=0, 東=90）
export const WEATHERS = {
  clear:  { name: '晴れ', icon: '☀️', sunEl: 52, sunAz: 160, top: 0x2f6fd6, hor: 0xa9d2f2, sun: 0xfff3dc, sunI: 1.0, amb: 0x9fb4d6, gnd: 0x6b665c, fog: 0.00007, cloud: 0.32, cloudCol: 0xffffff, rain: 0, snow: 0, night: 0, wet: 0, storm: 0 },
  cloudy: { name: 'くもり', icon: '☁️', sunEl: 45, sunAz: 170, top: 0x7d8796, hor: 0xb9c0c8, sun: 0xc8ccd2, sunI: 0.35, amb: 0xb4bcc6, gnd: 0x77746e, fog: 0.00012, cloud: 0.72, cloudCol: 0xd4d8de, rain: 0, snow: 0, night: 0, wet: 0, storm: 0 },
  rain:   { name: '雨', icon: '🌧️', sunEl: 40, sunAz: 170, top: 0x4c5562, hor: 0x8a939d, sun: 0x9aa0a8, sunI: 0.18, amb: 0x8d96a2, gnd: 0x5d5c5a, fog: 0.0002, cloud: 0.86, cloudCol: 0x8d939b, rain: 1, snow: 0, night: 0, wet: 1, storm: 0 },
  storm:  { name: '雷雨', icon: '⛈️', sunEl: 35, sunAz: 170, top: 0x262c38, hor: 0x5a6270, sun: 0x707884, sunI: 0.1, amb: 0x5e6674, gnd: 0x3c3c3c, fog: 0.00024, cloud: 0.95, cloudCol: 0x5c626c, rain: 1.6, snow: 0, night: 0.25, wet: 1, storm: 1 },
  snow:   { name: '雪', icon: '❄️', sunEl: 30, sunAz: 170, top: 0x9aa6b6, hor: 0xd5dbe2, sun: 0xdfe4ea, sunI: 0.3, amb: 0xc4ccd6, gnd: 0x9a9ca0, fog: 0.00022, cloud: 0.8, cloudCol: 0xe4e8ee, rain: 0, snow: 1, night: 0, wet: 0, storm: 0, snowCover: 1 },
  fog:    { name: '霧', icon: '🌫️', sunEl: 30, sunAz: 120, top: 0xb7c0c8, hor: 0xd8dde0, sun: 0xe8e6e0, sunI: 0.35, amb: 0xc4cad0, gnd: 0x8a8a88, fog: 0.00075, cloud: 0.5, cloudCol: 0xeeeeee, rain: 0, snow: 0, night: 0, wet: 0.3, storm: 0 },
  sunset: { name: '夕焼け', icon: '🌇', sunEl: 4, sunAz: 285, top: 0x34428a, hor: 0xff9a52, sun: 0xffa062, sunI: 0.95, amb: 0x9c88a6, gnd: 0x5e4a46, fog: 0.0001, cloud: 0.4, cloudCol: 0xffb38a, rain: 0, snow: 0, night: 0.35, wet: 0, storm: 0 },
  night:  { name: '夜', icon: '🌙', sunEl: -30, sunAz: 300, top: 0x050a1e, hor: 0x1a2a4a, sun: 0x8fa6d6, sunI: 0.22, amb: 0x2a3552, gnd: 0x141820, fog: 0.00009, cloud: 0.3, cloudCol: 0x3a4660, rain: 0, snow: 0, night: 1, wet: 0, storm: 0 },
};
export const WEATHER_ORDER = ['live', 'clear', 'cloudy', 'rain', 'storm', 'snow', 'fog', 'sunset', 'night'];

const dirFrom = (el, az) => { const e = el * Math.PI / 180, a = az * Math.PI / 180; return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)); };

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.state = this.toState(WEATHERS.clear); this.target = this.state;
    this.skyU = { uTop: { value: C(0x2f6fd6) }, uHor: { value: C(0xa9d2f2) }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: C(0xffffff) }, uNightS: { value: 0 }, uCloudy: { value: 0 }, uTimeS: U.uTime, uFlashS: U.uFlash };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, uniforms: this.skyU,
      vertexShader: `varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: /* glsl */`
        uniform vec3 uTop, uHor, uSun, uSunC; uniform float uNightS, uCloudy, uTimeS, uFlashS; varying vec3 vD;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(){
          vec3 d = normalize(vD); float y = d.y;
          vec3 c = mix(uHor, uTop, pow(clamp(y, 0.0, 1.0), 0.55));
          if (y < 0.0) c = mix(uHor, uHor * 0.75, clamp(-y * 6.0, 0.0, 1.0));
          // 太陽の周りの明るみ
          float sd = max(dot(d, uSun), 0.0); c += uSunC * pow(sd, 12.0) * 0.35 * (1.0 - uCloudy);
          // 四角い太陽（マイクラ風）
          vec3 up = abs(uSun.y) > 0.99 ? vec3(1, 0, 0) : vec3(0, 1, 0);
          vec3 sx = normalize(cross(up, uSun)), sy = cross(uSun, sx);
          vec3 md = -uSun;
          if (dot(d, uSun) > 0.0) { vec2 q = vec2(dot(d, sx), dot(d, sy)); if (max(abs(q.x), abs(q.y)) < 0.045) c = mix(c, vec3(1.0, 0.97, 0.85), (1.0 - uCloudy * 0.85) * (1.0 - uNightS)); }
          // 夜: 月と星
          if (uNightS > 0.5 && dot(d, md) > 0.0) { vec2 q = vec2(dot(d, sx), dot(d, sy)); if (max(abs(q.x), abs(q.y)) < 0.03) c = mix(c, vec3(0.92, 0.94, 1.0), 1.0 - uCloudy * 0.8); }
          if (y > 0.0) { vec2 g = floor(vec2(atan(d.z, d.x) * 300.0, y * 300.0)); float s = step(0.996, h(g)); c += vec3(s) * uNightS * (1.0 - uCloudy) * (0.6 + 0.4 * sin(uTimeS * 3.0 + h(g) * 50.0)); }
          c += vec3(0.6, 0.65, 0.8) * uFlashS;
          gl_FragColor = vec4(c, 1.0);
        }`,
    }));
    sky.renderOrder = -10; sky.frustumCulled = false; this.sky = sky; scene.add(sky);
    this.buildClouds();
    this.buildPrecip();
    this.flashT = 0; this.nextFlash = 5;
  }
  toState(w) {
    return { top: C(w.top), hor: C(w.hor), sun: C(w.sun), sunI: w.sunI, amb: C(w.amb), gnd: C(w.gnd), fog: w.fog, cloud: w.cloud, cloudCol: C(w.cloudCol), rain: w.rain, snow: w.snow, night: w.night, wet: w.wet, storm: w.storm, snowCover: w.snowCover || 0, sunDir: dirFrom(w.sunEl, w.sunAz) };
  }
  set(w, instant = false) {
    this.target = this.toState(w);
    if (instant) this.state = this.toState(w);
    this.rebuildClouds(w.cloud);
  }
  // 周期的な値ノイズで雲の形を作る（タイルが継ぎ目なくつながる）
  buildClouds() {
    this.cloudN = 128; this.cloudS = 64; // 128×64m = 8.2km のタイル
    const N = this.cloudN; const r = new Float32Array(N * N);
    const rnd = (i, j, p) => { i = ((i % p) + p) % p; j = ((j % p) + p) % p; const x = Math.sin(i * 127.1 + j * 311.7 + p * 7.7) * 43758.5453; return x - Math.floor(x); };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let v = 0, amp = 0.55;
      for (const p of [8, 16, 32]) {
        const fx = i / N * p, fz = j / N * p, x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
        const s = (t) => t * t * (3 - 2 * t);
        const a = rnd(x0, z0, p), b = rnd(x0 + 1, z0, p), c = rnd(x0, z0 + 1, p), d = rnd(x0 + 1, z0 + 1, p);
        v += amp * (a + (b - a) * s(tx) + (c - a) * s(tz) + (a - b - c + d) * s(tx) * s(tz)); amp *= 0.5;
      }
      r[j * N + i] = v / 0.96;
    }
    this.cloudNoise = r;
    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { ...U, uCol: { value: C(0xffffff) }, uAlpha: { value: 0.88 } },
      vertexShader: `varying vec3 vN; varying float vDist; void main(){ vN = normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform vec3 uCol, uFogCol, uSunCol, uSkyAmb; uniform float uAlpha, uFogDen, uFlash; varying vec3 vN; varying float vDist;
        void main(){ float f = vN.y > 0.5 ? 1.0 : (vN.y < -0.5 ? 0.72 : 0.86); vec3 c = uCol * f * (0.75 + 0.25 * length(uSunCol)) + uFlash * 0.5;
          float fog = 1.0 - exp(-pow(vDist * uFogDen * 0.6, 1.6)); gl_FragColor = vec4(mix(c, uFogCol, clamp(fog, 0.0, 1.0)), uAlpha * (1.0 - fog * 0.6)); }`,
    });
    this.cloudGroup = new THREE.Group(); this.scene.add(this.cloudGroup);
    this.cloudCover = -1;
  }
  rebuildClouds(cover) {
    if (Math.abs(cover - this.cloudCover) < 0.01) return;
    this.cloudCover = cover;
    const N = this.cloudN, S = this.cloudS, th = 1 - cover * 0.62 - 0.12, Hh = 28;
    const on = (i, j) => this.cloudNoise[(((j % N) + N) % N) * N + (((i % N) + N) % N)] > th;
    const p = [], n = [];
    const q = (a, b, c, d, nn) => { for (const v of [a, b, c, a, c, d]) { p.push(...v); n.push(...nn); } };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!on(i, j)) continue;
      // 横に連続する部分は 1 枚にまとめる
      let w = 1; while (i + w < N && on(i + w, j)) w++;
      const x0 = i * S, x1 = (i + w) * S, z0 = j * S, z1 = z0 + S;
      q([x0, Hh, z0], [x0, Hh, z1], [x1, Hh, z1], [x1, Hh, z0], [0, 1, 0]);
      q([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, -1, 0]);
      for (let t = i; t < i + w; t++) {
        const a = t * S, b = a + S;
        if (!on(t, j - 1)) q([b, 0, z0], [a, 0, z0], [a, Hh, z0], [b, Hh, z0], [0, 0, -1]);
        if (!on(t, j + 1)) q([a, 0, z1], [b, 0, z1], [b, Hh, z1], [a, Hh, z1], [0, 0, 1]);
      }
      if (!on(i - 1, j)) q([x0, 0, z1], [x0, 0, z0], [x0, Hh, z0], [x0, Hh, z1], [-1, 0, 0]);
      if (!on(i + w, j)) q([x1, 0, z0], [x1, 0, z1], [x1, Hh, z1], [x1, Hh, z0], [1, 0, 0]);
      i += w - 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
    this.cloudGroup.clear();
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const m = new THREE.Mesh(g, this.cloudMat); m.userData.o = [a, b]; m.frustumCulled = false; this.cloudGroup.add(m); }
  }
  buildPrecip() {
    const n = 6000, seeds = new Float32Array(n * 2 * 3), ends = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { const s = [Math.random(), Math.random(), Math.random()]; for (let k = 0; k < 2; k++) { seeds.set(s, (i * 2 + k) * 3); ends[i * 2 + k] = k; } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(seeds, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.rainU = { uCam: { value: new THREE.Vector3() }, uT: U.uTime, uAmt: { value: 0 }, uWind: { value: new THREE.Vector2(6, 2) } };
    this.rain = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.rainU,
      vertexShader: `attribute float aEnd; uniform vec3 uCam; uniform float uT, uAmt; uniform vec2 uWind; varying float vA;
        void main(){ vec3 box = vec3(220.0, 160.0, 220.0); vec3 vel = vec3(uWind.x, -70.0, uWind.y);
          vec3 p = position * box + vel * uT; p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam; p -= vel * 0.03 * aEnd;
          vA = step(position.x, uAmt * 0.6) * 0.5; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(0.75, 0.8, 0.88, vA); }`,
    }));
    this.rain.frustumCulled = false; this.scene.add(this.rain);
    const sn = 5000, sp = new Float32Array(sn * 3); for (let i = 0; i < sn * 3; i++) sp[i] = Math.random();
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.snowU = { uCam: this.rainU.uCam, uT: U.uTime, uAmt: { value: 0 }, uScale: { value: 300 } };
    this.snowP = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.snowU,
      vertexShader: `uniform vec3 uCam; uniform float uT, uAmt, uScale; varying float vA;
        void main(){ vec3 box = vec3(200.0, 140.0, 200.0); vec3 p = position * box + vec3(sin(uT * 0.7 + position.z * 30.0) * 3.0, -6.0 * uT, cos(uT * 0.5 + position.x * 20.0) * 3.0 + 2.0 * uT);
          p = mod(p - uCam + box * 0.5, box) - box * 0.5 + uCam; vA = step(position.y, uAmt);
          vec4 mv = viewMatrix * vec4(p, 1.0); gl_PointSize = clamp(uScale * 0.5 / -mv.z, 1.0, 6.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; void main(){ if (vA < 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, 0.9); }`,
    }));
    this.snowP.frustumCulled = false; this.scene.add(this.snowP);
  }
  update(dt, camPos, renderer) {
    const s = this.state, t = this.target, k = 1 - Math.exp(-dt * 1.2);
    for (const key of ['top', 'hor', 'sun', 'amb', 'gnd', 'cloudCol']) s[key].lerp(t[key], k);
    for (const key of ['sunI', 'fog', 'rain', 'snow', 'night', 'wet', 'storm', 'snowCover']) s[key] += (t[key] - s[key]) * k;
    s.sunDir.lerp(t.sunDir, k).normalize();
    // 雷
    let flash = 0;
    if (s.storm > 0.5) {
      this.nextFlash -= dt;
      if (this.nextFlash < 0) { this.flashT = 0.35; this.nextFlash = 4 + Math.random() * 9; this.onThunder?.(); }
    }
    if (this.flashT > 0) { this.flashT -= dt; flash = Math.max(0, Math.sin(this.flashT * 40)) * 0.9 * (this.flashT / 0.35); }
    U.uFlash.value = flash;
    const light = s.sunDir.y > 0 ? s.sunDir : s.sunDir.clone().multiplyScalar(-1).setY(Math.abs(s.sunDir.y) + 0.3).normalize();
    U.uSunDir.value.copy(light);
    U.uSunCol.value.copy(s.sun).multiplyScalar(s.sunI * (s.sunDir.y > 0 ? 1 : 0.5));
    U.uSkyAmb.value.copy(s.amb); U.uGroundAmb.value.copy(s.gnd);
    U.uFogCol.value.copy(s.hor); U.uFogDen.value = s.fog; U.uNight.value = s.night; U.uSnow.value = s.snowCover * 0.9; U.uWet.value = s.wet;
    U.uSkyTop.value.copy(s.top);
    this.skyU.uTop.value.copy(s.top); this.skyU.uHor.value.copy(s.hor); this.skyU.uSun.value.copy(s.sunDir); this.skyU.uSunC.value.copy(s.sun);
    this.skyU.uNightS.value = s.night; this.skyU.uCloudy.value = Math.max(0, (s.cloud ?? 0) - 0.3);
    s.cloud = t.cloud;
    this.sky.position.copy(camPos);
    this.cloudMat.uniforms.uCol.value.copy(s.cloudCol);
    this.cloudMat.uniforms.uAlpha.value = 0.9;
    // 雲は風で流れ、カメラの周り 3×3 タイルに並べる
    const T = this.cloudN * this.cloudS, drift = U.uTime.value * 4;
    const bx = Math.floor((camPos.x - drift) / T) * T + drift, bz = Math.floor((camPos.z - drift * 0.4) / T) * T + drift * 0.4;
    for (const m of this.cloudGroup.children) m.position.set(bx + m.userData.o[0] * T, 520, bz + m.userData.o[1] * T);
    this.rainU.uCam.value.copy(camPos); this.rainU.uAmt.value = s.rain; this.snowU.uAmt.value = s.snow;
    this.rain.visible = s.rain > 0.02; this.snowP.visible = s.snow > 0.02;
    this.snowU.uScale.value = renderer.domElement.height;
    renderer.setClearColor(s.hor);
  }
}

// 太陽の位置（簡易計算・新潟市）
export function sunPosition(date, lat = 37.91, lon = 139.04) {
  const d = (date.getTime() / 86400000) - 10957.5; // J2000
  const g = (357.529 + 0.98560028 * d) * Math.PI / 180, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * Math.PI / 180, e = (23.439 - 0.00000036 * d) * Math.PI / 180;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24, lst = (gmst * 15 + lon) * Math.PI / 180;
  const ha = lst - ra, la = lat * Math.PI / 180;
  const el = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha));
  return { el: el * 180 / Math.PI, az: ((az * 180 / Math.PI) + 360) % 360 };
}

// いまの新潟の天気（Open-Meteo）をプリセットに合成
export async function liveWeather() {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=37.916&longitude=139.036&current=weather_code,is_day,cloud_cover,temperature_2m&timezone=Asia%2FTokyo';
  const r = await fetch(url); if (!r.ok) throw new Error('weather ' + r.status);
  const j = await r.json(); const c = j.current, code = c.weather_code;
  let base = 'clear', label = '晴れ';
  if (code >= 95) { base = 'storm'; label = '雷雨'; }
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) { base = 'snow'; label = '雪'; }
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) { base = 'rain'; label = '雨'; }
  else if (code === 45 || code === 48) { base = 'fog'; label = '霧'; }
  else if (code === 3 || c.cloud_cover > 75) { base = 'cloudy'; label = 'くもり'; }
  else if (code === 2) { label = '晴れ時々くもり'; }
  const sp = sunPosition(new Date());
  const w = { ...WEATHERS[base] };
  if (base === 'clear') w.cloud = Math.max(0.15, Math.min(0.6, c.cloud_cover / 100));
  w.sunEl = sp.el; w.sunAz = sp.az;
  // 太陽高度で時間帯を合成
  const mixW = (a, b, t) => { const o = { ...a }; for (const k of ['top', 'hor', 'sun', 'amb', 'gnd', 'cloudCol']) o[k] = new THREE.Color(a[k]).lerp(new THREE.Color(b[k]), t).getHex(); for (const k of ['sunI', 'night']) o[k] = a[k] + (b[k] - a[k]) * t; return o; };
  let out = w;
  if (sp.el < -6) out = mixW(w, { ...WEATHERS.night }, base === 'clear' ? 1 : 0.85);
  else if (sp.el < 10) out = mixW(w, WEATHERS.sunset, base === 'clear' ? 1 - Math.max(0, sp.el + 6) / 32 : 0.4);
  out.sunEl = sp.el; out.sunAz = sp.az;
  if (sp.el < -6) out.night = 1;
  return { w: out, label: `${label} ${Math.round(c.temperature_2m)}℃`, time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) };
}
