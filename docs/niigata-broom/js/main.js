import * as THREE from 'three';
import { World, U, ll } from './world.js';
import { Sky, WEATHERS, WEATHER_ORDER, liveWeather } from './sky.js';
import { Rings } from './rings.js';
import { makeRider, animateRider, Sparkles } from './broom.js';

THREE.ColorManagement.enabled = false;
const $ = (id) => document.getElementById(id);
const SPEED = 42;           // m/s（一定）
const BOOST = 2.3;          // 加速リングの倍率
const BOOST_T = 2.6;        // 秒
export const PITCH = 1.0;   // rad/s。宙返りの半径は SPEED / PITCH ≒ 42m

// ---------- 記録（ブラウザに保存）
const KEY = 'niigata-broom:v1';
const fresh = () => ({ done: {}, points: 0, dist: 0, time: 0, flights: 0, first: Date.now(), completedAt: null, opt: { invert: false, sound: true, weather: 'clear', cam: 0 } });
let save;
try { save = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; save.opt = { ...fresh().opt, ...(save.opt || {}) }; } catch { save = fresh(); }
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* 保存できない環境（プライベート等）では保持しない */ } };

// ---------- three.js
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
const mobile = matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 1.5, 160000);
const hemi = new THREE.HemisphereLight(0xffffff, 0x666655, 1.2); scene.add(hemi);
const sunL = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(sunL);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const world = new World();
const sky = new Sky(scene);
let rings, sparkles;
const rider = makeRider(); scene.add(rider);

// ---------- 飛行状態
const START = (() => { const [x, z] = ll(37.9085, 139.0395); return new THREE.Vector3(x, 110, z); })();
const st = { pos: START.clone(), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -50 * Math.PI / 180), boost: 0, bank: 0, flying: false, warn: 0 };
const camPos = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0);

// ---------- 入力（ジョイスティック + キーボード）
const input = { x: 0, y: 0, kx: 0, ky: 0 };
{
  const stick = $('stick'), knob = $('knob'); let id = null;
  const set = (e) => {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const d = Math.hypot(dx, dy), m = R * 0.78;
    if (d > m) { dx *= m / d; dy *= m / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`; input.x = dx / m; input.y = -dy / m;
  };
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); audio.unlock(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; input.x = input.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  const keys = new Set();
  const upd = () => { input.kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0); input.ky = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0); };
  addEventListener('keydown', (e) => { if (e.code.startsWith('Arrow')) e.preventDefault(); keys.add(e.code); upd(); audio.unlock(); if (e.code === 'KeyC') cycleCam(); if (e.code === 'KeyT') cycleWeather(); });
  addEventListener('keyup', (e) => { keys.delete(e.code); upd(); });
  addEventListener('blur', () => { keys.clear(); upd(); });
}

// ---------- 効果音（WebAudio で合成）
const audio = {
  ctx: null,
  unlock() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { } } this.ctx?.resume?.(); },
  tone(freqs, dur = 0.18, type = 'square', vol = 0.06) {
    if (!save.opt.sound || !this.ctx) return; const t0 = this.ctx.currentTime;
    freqs.forEach((f, i) => { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0, t0 + i * dur * 0.6); g.gain.linearRampToValueAtTime(vol, t0 + i * dur * 0.6 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * dur * 0.6 + dur); o.connect(g).connect(this.ctx.destination); o.start(t0 + i * dur * 0.6); o.stop(t0 + i * dur * 0.6 + dur + 0.02); });
  },
  noise(dur, f0, f1, vol = 0.12) {
    if (!save.opt.sound || !this.ctx) return; const c = this.ctx, n = c.sampleRate * dur, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; f.type = 'bandpass'; f.frequency.setValueAtTime(f0, c.currentTime); f.frequency.exponentialRampToValueAtTime(f1, c.currentTime + dur); g.gain.value = vol;
    s.connect(f).connect(g).connect(c.destination); s.start();
  },
};
sky.onThunder = () => setTimeout(() => audio.noise(2.2, 120, 40, 0.35), 300 + Math.random() * 900);

// ---------- 天気
let wxKey = save.opt.weather;
async function applyWeather(key, instant = false) {
  wxKey = key; save.opt.weather = key; persist();
  const lbl = $('wxLabel');
  if (key === 'live') {
    $('bWx').textContent = '📡'; lbl.hidden = false; lbl.textContent = 'いまの新潟の天気を取得中…';
    try { const r = await liveWeather(); if (wxKey !== 'live') return; sky.set(r.w, instant); lbl.textContent = `いまの新潟 ${r.time} ${r.label}`; }
    catch { lbl.textContent = '天気を取得できませんでした（晴れで表示）'; sky.set(WEATHERS.clear, instant); }
  } else { sky.set(WEATHERS[key], instant); $('bWx').textContent = WEATHERS[key].icon; lbl.hidden = false; lbl.textContent = WEATHERS[key].name; }
  clearTimeout(applyWeather.t); applyWeather.t = setTimeout(() => { if (wxKey !== 'live') lbl.hidden = true; }, 2500);
  document.querySelectorAll('#wxList button').forEach(b => b.classList.toggle('on', b.dataset.k === key));
}
function cycleWeather() { const i = WEATHER_ORDER.indexOf(wxKey); applyWeather(WEATHER_ORDER[(i + 1) % WEATHER_ORDER.length]); }
{
  const list = $('wxList');
  for (const k of WEATHER_ORDER) {
    const b = document.createElement('button'); b.dataset.k = k;
    b.textContent = k === 'live' ? '📡 いまの新潟' : `${WEATHERS[k].icon} ${WEATHERS[k].name}`;
    b.onclick = () => applyWeather(k); list.appendChild(b);
  }
}

// ---------- カメラ
const CAMS = ['うしろから', '遠くから', 'ほうき視点'];
function cycleCam() { save.opt.cam = (save.opt.cam + 1) % CAMS.length; persist(); toast(`🎥 ${CAMS[save.opt.cam]}`, ''); }

// ---------- HUD
function toast(text, cls = 'p') { const d = document.createElement('div'); d.className = `t panel ${cls}`; d.textContent = text; $('toast').appendChild(d); setTimeout(() => d.remove(), 2300); while ($('toast').children.length > 3) $('toast').firstChild.remove(); }
function doneCount() { return rings.list.filter(r => save.done[r.id]).length; }
function refreshScore() {
  const n = doneCount(), pct = Math.floor(n / rings.total * 1000) / 10;
  $('pts').innerHTML = `${save.points.toLocaleString()} <small>/ ${rings.totalPts.toLocaleString()} pt</small>`;
  $('comp').textContent = `コンプリート ${pct}%（${n}/${rings.total}）`;
  $('bar').firstElementChild.style.width = pct + '%';
  $('sComp').textContent = pct + '%'; $('sPts').textContent = save.points.toLocaleString(); $('sDist').textContent = (save.dist / 1000).toFixed(1) + 'km';
}
const fmtDate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function showRecords() {
  const n = doneCount();
  $('recStats').innerHTML = `<div><b>${Math.floor(n / rings.total * 1000) / 10}%</b>${n}/${rings.total} リング</div><div><b>${save.points.toLocaleString()}</b>ポイント</div><div><b>${(save.dist / 1000).toFixed(1)}km</b>${Math.round(save.time / 60)}分・${save.flights}回</div>`
    + (save.completedAt ? `<div style="grid-column:1/-1"><b>🏆 コンプリート</b>${fmtDate(save.completedAt)}</div>` : '');
  const groups = [['金のリング（名所）', r => r.t === 'p'], ['水色のリング（加速）', r => r.t === 'b'], ['ピンクのリング（宙返り）', r => r.t === 'l']];
  $('recList').innerHTML = groups.map(([title, f]) => {
    const rs = rings.list.filter(f), c = rs.filter(r => save.done[r.id]).length;
    return `<h3>${title} ${c}/${rs.length}</h3>` + rs.map(r => `<div class="it ${save.done[r.id] ? 'done' : ''}"><span>${save.done[r.id] ? '✅' : '⬜'} ${r.name}</span><span>${save.done[r.id] ? fmtDate(save.done[r.id]) : `${r.pts}pt`}</span></div>`).join('');
  }).join('');
  $('confirm').hidden = true; $('rec').hidden = false;
}
$('recClose').onclick = () => { $('rec').hidden = true; };
$('recReset').onclick = () => { $('confirm').hidden = false; };
$('resetNo').onclick = () => { $('confirm').hidden = true; };
$('resetYes').onclick = () => { const opt = save.opt; save = fresh(); save.opt = opt; persist(); rings.setDone(save.done); refreshScore(); showRecords(); };
$('bRec').onclick = showRecords; $('openRec').onclick = showRecords;
$('bWx').onclick = cycleWeather; $('bCam').onclick = cycleCam;
$('bPause').onclick = () => { st.flying = false; $('hud').hidden = true; $('start').hidden = false; refreshScore(); persist(); };
$('go').onclick = () => { audio.unlock(); save.flights++; persist(); st.flying = true; $('start').hidden = true; $('hud').hidden = false; $('go').textContent = '🧹 つづきを飛ぶ'; };
$('optInvert').checked = save.opt.invert; $('optInvert').onchange = (e) => { save.opt.invert = e.target.checked; persist(); };
$('optSound').checked = save.opt.sound; $('optSound').onchange = (e) => { save.opt.sound = e.target.checked; persist(); };

// ---------- ミニマップ
let mapImg, wardRing = [], mapWhole = false;
$('map').onclick = () => { mapWhole = !mapWhole; $('mapHint').textContent = mapWhole ? 'タップで拡大' : 'タップで全体図'; };
function drawMap() {
  const c = $('map'), ctx = c.getContext('2d'), S = c.width;
  const { X0, Z0, B, W, H } = world;
  const span = mapWhole ? Math.max(W, H) * B : 2400; // 表示範囲 (m)
  const cx = mapWhole ? X0 + W * B / 2 : st.pos.x, cz = mapWhole ? Z0 + H * B / 2 : st.pos.z;
  const k = S / span, toS = (x, z) => [(x - cx) * k + S / 2, (z - cz) * k + S / 2];
  ctx.fillStyle = '#2f6fb0'; ctx.fillRect(0, 0, S, S);
  ctx.imageSmoothingEnabled = mapWhole;
  const [ix, iz] = toS(X0, Z0); ctx.drawImage(mapImg, ix, iz, W * B * k, H * B * k);
  if (wardRing.length) { ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5; ctx.beginPath(); wardRing.forEach(([x, z], i) => { const [a, b] = toS(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke(); ctx.setLineDash([]); }
  const colors = { p: '#ffd23f', b: '#3ff0ff', l: '#ff5fd2' };
  for (const r of rings.list) {
    const [a, b] = toS(r.pos.x, r.pos.z); if (a < -6 || b < -6 || a > S + 6 || b > S + 6) continue;
    const d = save.done[r.id], s = mapWhole ? 3 : 5;
    ctx.fillStyle = d ? 'rgba(60,60,70,.8)' : colors[r.t]; ctx.strokeStyle = '#000a'; ctx.lineWidth = 1;
    ctx.fillRect(a - s / 2, b - s / 2, s, s); ctx.strokeRect(a - s / 2, b - s / 2, s, s);
  }
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(st.q); const ang = Math.atan2(f.x, -f.z);
  const [px, pz] = toS(st.pos.x, st.pos.z);
  ctx.save(); ctx.translate(px, pz); ctx.rotate(ang); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#5b3c9e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('N', 8, 20);
}

// ---------- 飛行
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const tmpQ = new THREE.Quaternion();
function fly(dt) {
  const inv = save.opt.invert ? -1 : 1;
  const sx = THREE.MathUtils.clamp(input.x + input.kx, -1, 1), sy = THREE.MathUtils.clamp((input.y + input.ky) * inv, -1, 1);
  // ピッチ（ほうきの横軸まわり）→ 引き続けると宙返り
  st.q.multiply(tmpQ.setFromAxisAngle(V(1, 0, 0), sy * PITCH * dt));
  // 旋回（鉛直軸まわり）
  st.q.premultiply(tmpQ.setFromAxisAngle(V(0, 1, 0), -sx * 1.05 * dt));
  const f = V(0, 0, -1).applyQuaternion(st.q), up = V(0, 1, 0).applyQuaternion(st.q);
  // 操作していない時は、ゆっくり背中を空に向け直す（背面飛行からの復帰）
  if (Math.abs(sy) < 0.15 && Math.abs(f.y) < 0.97) {
    const want = V(0, 1, 0).addScaledVector(f, -f.y).normalize();
    const ang = Math.atan2(f.dot(up.clone().cross(want)), up.dot(want));
    st.q.premultiply(tmpQ.setFromAxisAngle(f, ang * Math.min(1, dt * 1.6)));
  }
  st.q.normalize();
  st.bank += (-sx * 0.65 - st.bank) * Math.min(1, dt * 5);
  st.boost = Math.max(0, st.boost - dt);
  const spd = SPEED * (1 + (BOOST - 1) * Math.min(1, st.boost / 0.8));
  const prev = st.pos.clone();
  const fwd = V(0, 0, -1).applyQuaternion(st.q);
  st.pos.addScaledVector(fwd, spd * dt);
  // 地面・建物・水面に当たらないように押し上げる
  let ground = 0; for (const [ox, oz] of [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]]) ground = Math.max(ground, world.heightAt(st.pos.x + ox, st.pos.z + oz));
  const minY = Math.max(ground, world.B * 0.8) + 3.5;
  if (st.pos.y < minY) {
    st.pos.y = minY;
    if (fwd.y < 0.15) { const right = V(1, 0, 0).applyQuaternion(st.q); st.q.premultiply(tmpQ.setFromAxisAngle(right, Math.min(0.6, (0.15 - fwd.y)) * dt * 6 * Math.sign(up.y || 1))).normalize(); }
  }
  if (st.pos.y > 1400) { st.pos.y = 1400; const right = V(1, 0, 0).applyQuaternion(st.q); if (fwd.y > -0.1) st.q.premultiply(tmpQ.setFromAxisAngle(right, -dt * 2)).normalize(); }
  // 区域の外に出すぎたら中央へ向けて曲がる
  const cx = -500, cz = 0, R = Math.hypot(st.pos.x - cx, st.pos.z - cz);
  if (R > 9000) {
    const toC = Math.atan2(cx - st.pos.x, -(cz - st.pos.z)), h = Math.atan2(fwd.x, -fwd.z);
    let d = toC - h; d = Math.atan2(Math.sin(d), Math.cos(d));
    st.q.premultiply(tmpQ.setFromAxisAngle(V(0, 1, 0), -Math.sign(d) * dt * 0.9)).normalize();
    if (st.warn <= 0) { toast('ここから先は中央区の外。引き返します', ''); st.warn = 6; }
  }
  st.warn -= dt;
  save.dist += spd * dt; save.time += dt;
  // リング
  for (const r of rings.check(prev, st.pos)) hitRing(r);
  return spd;
}
function hitRing(r) {
  const first = !save.done[r.id];
  if (r.t === 'b') { st.boost = BOOST_T; audio.noise(0.6, 400, 2400, 0.12); }
  sparkles.burst(r.pos, r.t === 'p' ? [1, 0.85, 0.3] : r.t === 'b' ? [0.3, 0.95, 1] : [1, 0.4, 0.85], first ? 70 : 25, r.r);
  if (!first) return;
  save.done[r.id] = Date.now(); save.points += r.pts;
  audio.tone(r.t === 'p' ? [988, 1319] : r.t === 'b' ? [659, 880] : [784, 1047], 0.16);
  toast(`+${r.pts} ${r.name}`, r.t);
  if (r.group) {
    const g = rings.list.filter(x => x.group === r.group);
    if (g.every(x => save.done[x.id])) { setTimeout(() => { toast(r.t === 'l' ? `🎉 ${r.group} 達成！` : `🎉 ${r.group}の加速リング 全部くぐった！`, 'l big'); audio.tone([784, 988, 1175, 1568], 0.2); }, 600); }
  }
  if (doneCount() === rings.total && !save.completedAt) { save.completedAt = Date.now(); setTimeout(() => { toast('🏆 コンプリート 100%！ おめでとう！', 'p big'); audio.tone([523, 659, 784, 1047, 1319], 0.25); }, 1200); }
  rings.setDone(save.done); refreshScore(); persist();
}

// ---------- カメラ追従
function updateCamera(dt, spd) {
  const f = V(0, 0, -1).applyQuaternion(st.q), up = V(0, 1, 0).applyQuaternion(st.q);
  const mode = save.opt.cam;
  rider.visible = mode !== 2;
  const wantUp = up.clone().lerp(V(0, 1, 0), mode === 2 ? 0 : 0.35).normalize();
  camUp.lerp(wantUp, 1 - Math.exp(-dt * 5)).normalize();
  let want, look;
  if (mode === 2) { want = st.pos.clone().addScaledVector(up, 1.9).addScaledVector(f, 0.6); look = want.clone().addScaledVector(f, 20); camPos.copy(want); }
  else {
    const back = mode === 1 ? 58 : 15, high = mode === 1 ? 18 : 6.5;
    want = st.pos.clone().addScaledVector(f, -back).addScaledVector(camUp, high);
    camPos.lerp(want, 1 - Math.exp(-dt * (mode === 1 ? 3 : 7)));
    look = st.pos.clone().addScaledVector(f, 14).addScaledVector(camUp, 2);
  }
  const g = world.heightAt(camPos.x, camPos.z); if (camPos.y < g + 2) camPos.y = g + 2;
  camera.position.copy(camPos); camera.up.copy(camUp); camera.lookAt(look);
  const fov = 68 + 16 * Math.min(1, st.boost / 0.8);
  if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
  $('boostFx').style.opacity = st.boost > 0.1 ? Math.min(1, st.boost) : 0;
}
function updateRider(t) {
  rider.position.copy(st.pos);
  rider.quaternion.copy(st.q).multiply(tmpQ.setFromAxisAngle(V(0, 0, 1), st.bank));
  animateRider(rider, t, st.boost > 0.2);
  const tail = V(0, 0, 3.4).applyQuaternion(rider.quaternion).add(st.pos);
  if (Math.random() < 0.9) sparkles.emit(tail, st.boost > 0.2 ? [0.4, 0.95, 1] : [1, 0.8, 0.35], 1.2);
}
function updateNav() {
  const n = rings.nearestOpen(st.pos), nav = $('nav');
  if (!n) { nav.hidden = true; return; }
  nav.hidden = false;
  const v = n.r.pos.clone().sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
  const ang = Math.atan2(v.x, -v.z) * 180 / Math.PI, el = v.y;
  nav.querySelector('.arrow').style.transform = `rotate(${ang}deg)`;
  nav.querySelector('.nm').textContent = n.r.t === 'p' ? n.r.name : n.r.t === 'b' ? `加速リング（${n.r.group}）` : n.r.group;
  nav.querySelector('.ds').textContent = `${n.d < 1000 ? Math.round(n.d) + 'm' : (n.d / 1000).toFixed(1) + 'km'}${Math.abs(el) > 30 && n.d < 600 ? (el > 0 ? ' ⤴' : ' ⤵') : ''}`;
}

// ---------- メインループ
let last = performance.now(), mapT = 0, saveT = 0, t = 0, fps = 60, fpsN = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  U.uTime.value = t;
  let spd = 0;
  if (st.flying) spd = fly(dt);
  else { // タイトル画面では、ゆっくり旋回して街を見せる
    st.q.premultiply(tmpQ.setFromAxisAngle(V(0, 1, 0), -dt * 0.12)).normalize();
    const f = V(0, 0, -1).applyQuaternion(st.q); st.pos.addScaledVector(f, 18 * dt);
    const g = world.heightAt(st.pos.x, st.pos.z); if (st.pos.y < g + 60) st.pos.y += (g + 60 - st.pos.y) * dt;
  }
  updateRider(t); updateCamera(dt, spd);
  sky.update(dt, camera.position, renderer);
  hemi.color.copy(U.uSkyAmb.value); hemi.groundColor.copy(U.uGroundAmb.value); hemi.intensity = 1.6;
  sunL.color.copy(U.uSunCol.value); sunL.intensity = 1.8; sunL.position.copy(U.uSunDir.value);
  rings.update(t, camera.position);
  sparkles.update(dt, renderer.domElement.height);
  // 霧で見えない範囲のチャンクは描かない
  const far = Math.min(60000, 2.9 / Math.max(U.uFogDen.value, 1e-6));
  for (const m of world.chunks) m.visible = m.geometry.boundingSphere.center.distanceTo(camera.position) - m.geometry.boundingSphere.radius < far;
  world.farMesh.visible = far * 2.4 > 6000;
  if (st.flying) {
    $('alt').textContent = Math.round(st.pos.y); $('spd').textContent = Math.round(spd * 3.6);
    if ((mapT -= dt) < 0) { drawMap(); updateNav(); mapT = 0.1; }
    if ((saveT -= dt) < 0) { persist(); saveT = 5; }
  }
  renderer.render(scene, camera);
  fpsN++; fpsT += dt; if (fpsT > 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0;
    // 重い端末では解像度を下げてなめらかさを優先する
    if (fps < 34 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.25)); resize(); }
  }
}
addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
addEventListener('pagehide', persist);

// ---------- 起動
(async () => {
  try {
    await world.load((p) => { $('loadBar').style.width = Math.round(p * 100) + '%'; $('loadMsg').textContent = `ブロックを積んでいます ${Math.round(p * 100)}%`; });
    scene.add(world.group);
    mapImg = world.mapImage();
    try { wardRing = (await (await fetch('data/ward.json')).json()).ward || []; } catch { }
    rings = new Rings(scene, world); rings.setDone(save.done);
    sparkles = new Sparkles(scene);
    refreshScore();
    await applyWeather(wxKey, true);
    $('loading').remove(); $('start').hidden = false;
    requestAnimationFrame((n) => { last = n; frame(n); });
    window.__app = { world, rings, st, input, sky, save, camera, applyWeather, get fps() { return fps; }, renderer, hitRing, flyTo: (x, y, z, hd) => { st.pos.set(x, y, z); st.q.setFromAxisAngle(V(0, 1, 0), -hd * Math.PI / 180); camPos.copy(st.pos).add(V(0, 5, 20)); } };
  } catch (e) { $('loadMsg').textContent = '読み込みに失敗しました: ' + e.message; console.error(e); }
})();
