import * as THREE from 'three';
import { World, U, ll, setOrigin } from './world.js';
import { Sky, WEATHERS, WEATHER_ORDER, liveWeather } from './sky.js';
import { Rings, NIIGATA_RINGS } from './rings.js';
import { generate, cache, inJapan } from './gen.js';
import { JapanMap, JAPAN_VIEW } from './japan.js';
import { makeRider, animateRider, Sparkles } from './broom.js';

THREE.ColorManagement.enabled = false;
const $ = (id) => document.getElementById(id);
const SPEED = 42;           // m/s（一定）
const BOOST = 2.3;          // 加速リングの倍率
const BOOST_T = 2.6;        // 秒
export const PITCH = 1.0;   // rad/s。宙返りの半径は SPEED / PITCH ≒ 42m

// ---------- 記録（ブラウザに保存）
const KEY = 'niigata-broom:v1';
// 新潟市中央区（PLATEAU から作った作り置きの地域）
const BUILTIN = { id: 'niigata-chuo', name: '新潟市中央区', muni: '15103', pref: '新潟県', lat: 37.9125, lon: 139.0615, builtin: true };
const fresh = () => ({ v: 2, regions: {}, current: BUILTIN.id, dist: 0, time: 0, flights: 0, first: Date.now(), opt: { ctl: 'expert', invert: false, invertX: false, sound: true, weather: 'clear', cam: 0 } });
const newRegion = (r) => ({ done: {}, points: 0, completedAt: null, total: 0, totalPts: 0, created: Date.now(), ...r });
let save;
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
  save = { ...fresh(), ...raw }; save.opt = { ...fresh().opt, ...(raw.opt || {}) };
  if (!raw.v && raw.done) { // 地域ごとの記録になる前（新潟市中央区だけだった頃）の記録を引き継ぐ
    save.regions = { [BUILTIN.id]: newRegion({ ...BUILTIN, done: raw.done, points: raw.points || 0, completedAt: raw.completedAt || null, total: 83 }) };
    delete save.done; delete save.points; delete save.completedAt; save.v = 2;
  }
} catch { save = fresh(); }
if (!save.regions[BUILTIN.id]) save.regions[BUILTIN.id] = newRegion({ ...BUILTIN });
if (!save.regions[save.current]) save.current = BUILTIN.id;
const reg = () => save.regions[save.current];
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

let world = null;
const sky = new Sky(scene);
let rings, sparkles;
const rider = makeRider(); scene.add(rider);

// ---------- 飛行状態
const st = { pos: new THREE.Vector3(0, 110, 0), q: new THREE.Quaternion(), boost: 0, bank: 0, flying: false, warn: 0 };
function placeStart() { // 新潟は萬代橋の上流から、それ以外は地図の南側から北へ
  if (reg().builtin) { const [x, z] = ll(37.9085, 139.0395); st.pos.set(x, 110, z); st.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -50 * Math.PI / 180); }
  else { let g = 0; for (let k = -6; k <= 6; k++) g = Math.max(g, world.heightAt(k * 40, 900), world.heightAt(k * 40, 700)); st.pos.set(0, g + 70, 900); st.q.identity(); }
  camPos.copy(st.pos).add(new THREE.Vector3(0, 6, 15));
}
const camPos = new THREE.Vector3(), camUp = new THREE.Vector3(0, 1, 0);

// ---------- 入力（ジョイスティック + キーボード）
const input = { x: 0, y: 0, kx: 0, ky: 0, rud: 0, krud: 0 };
{
  const stick = $('stick'), knob = $('knob'); let id = null;
  const set = (e) => {
    const r = stick.getBoundingClientRect(), R = r.width / 2;
    let dx = e.clientX - (r.left + R), dy = e.clientY - (r.top + R); const d = Math.hypot(dx, dy), m = R * 0.78;
    if (d > m) { dx *= m / d; dy *= m / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`; input.x = dx / m; input.y = dy / m; // スティックは下に引くと上昇（上下反転）
  };
  stick.addEventListener('pointerdown', (e) => { id = e.pointerId; stick.setPointerCapture(id); set(e); audio.unlock(); });
  stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; input.x = input.y = 0; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  const keys = new Set();
  const upd = () => { input.kx = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0); input.ky = (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0) - (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0); input.krud = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0); };
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
function doneCount() { return rings.list.filter(r => reg().done[r.id]).length; }
const pctOf = (r) => r.total ? Math.floor(Object.keys(r.done).length / r.total * 1000) / 10 : 0;
// 日本地図: 市区町村ごとの状態（その市区町村の中のどこかを 100% にしたら「コンプリート」）
function muniStatus(code) {
  let st0 = null;
  for (const r of Object.values(save.regions)) if (r.muni === code) { if (r.completedAt) return 'done'; if (Object.keys(r.done).length) st0 = 'part'; }
  return st0;
}
function japanStats() { const done = new Set(Object.values(save.regions).filter(r => r.completedAt && r.muni).map(r => r.muni)); const total = japan?.munis.length || 1894; return { n: done.size, total, pct: Math.floor(done.size / total * 10000) / 100 }; }
function refreshScore() {
  const R = reg(), n = doneCount(), pct = Math.floor(n / rings.total * 1000) / 10;
  $('regionName').textContent = `📍 ${R.name}`;
  $('pts').innerHTML = `${R.points.toLocaleString()} <small>/ ${rings.totalPts.toLocaleString()} pt</small>`;
  $('comp').textContent = `コンプリート ${pct}%（${n}/${rings.total}）`;
  $('bar').firstElementChild.style.width = pct + '%';
  const js = japanStats();
  $('jpLine').textContent = `🗾 日本 ${js.pct}%（${js.n}/${js.total.toLocaleString()} 市区町村）`;
  $('sComp').textContent = pct + '%'; $('sPts').textContent = R.points.toLocaleString(); $('sDist').textContent = (save.dist / 1000).toFixed(1) + 'km';
  layoutHud();
  $('sRegion').textContent = R.pref && R.pref !== R.name ? `${R.pref} ${R.name}` : R.name; $('sJapan').textContent = js.pct + '%'; $('sJapanN').textContent = `${js.n}/${js.total.toLocaleString()}`;
}
// 右上の得点パネルの高さが地域名で変わるので、ボタンと案内をその下に並べ直す
function layoutHud() {
  requestAnimationFrame(() => {
    const sc = $('score').getBoundingClientRect(), mp = $('mapBox').getBoundingClientRect();
    if (!sc.height) return;
    $('btns').style.top = sc.bottom + 8 + 'px'; $('wxLabel').style.top = sc.bottom + 14 + 'px';
    $('nav').style.top = innerWidth < 560 ? Math.max(sc.bottom, mp.bottom) + 8 + 'px' : '';
  });
}
addEventListener('resize', layoutHud);
const fmtDate = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function showRecords() {
  const n = doneCount(), R = reg(), js = japanStats();
  $('recStats').innerHTML = `<div><b>${Math.floor(n / rings.total * 1000) / 10}%</b>${R.name}<br>${n}/${rings.total} リング</div><div><b>${R.points.toLocaleString()}</b>ポイント</div><div><b>${(save.dist / 1000).toFixed(1)}km</b>${Math.round(save.time / 60)}分・${save.flights}回</div>`
    + (R.completedAt ? `<div style="grid-column:1/-1"><b>🏆 コンプリート</b>${fmtDate(R.completedAt)}</div>` : '')
    + `<div style="grid-column:1/-1"><b>🗾 ${js.pct}%</b>日本地図 ${js.n}/${js.total.toLocaleString()} 市区町村</div>`;
  const others = Object.values(save.regions).filter(r => r.total && (Object.keys(r.done).length || r.id === R.id)).sort((a, b) => b.created - a.created);
  const regionsHtml = `<h3>飛んだ場所 ${others.length}</h3>` + others.map(r => `<div class="it ${r.completedAt ? 'done' : ''}"><span>${r.completedAt ? '🏆' : '📍'} ${r.pref && r.pref !== r.name ? r.pref + ' ' : ''}${r.name}</span><span>${pctOf(r)}%</span></div>`).join('');
  const groups = [['金のリング（名所）', r => r.t === 'p'], ['水色のリング（加速）', r => r.t === 'b'], ['ピンクのリング（宙返り）', r => r.t === 'l']];
  $('recList').innerHTML = groups.map(([title, f]) => {
    const rs = rings.list.filter(f), c = rs.filter(r => R.done[r.id]).length;
    const D = R.done; if (!rs.length) return '';
    return `<h3>${title} ${c}/${rs.length}</h3>` + rs.map(r => `<div class="it ${D[r.id] ? 'done' : ''}"><span>${D[r.id] ? '✅' : '⬜'} ${r.name}</span><span>${D[r.id] ? fmtDate(D[r.id]) : `${r.pts}pt`}</span></div>`).join('');
  }).join('') + regionsHtml;
  $('confirm').hidden = true; $('rec').hidden = false;
}
$('recClose').onclick = () => { $('rec').hidden = true; };
$('recReset').onclick = () => { $('confirm').hidden = false; };
$('resetNo').onclick = () => { $('confirm').hidden = true; };
$('resetYes').onclick = () => { // すべての地域の記録を消す（作った地図はブラウザに残る）
  const opt = save.opt, cur = reg(); save = fresh(); save.opt = opt;
  save.regions[BUILTIN.id] = newRegion({ ...BUILTIN, total: cur.builtin ? cur.total : 0, totalPts: cur.builtin ? cur.totalPts : 0 });
  if (!cur.builtin) save.regions[cur.id] = newRegion({ ...cur, done: {}, points: 0, completedAt: null });
  save.current = cur.id; persist(); rings.setDone(reg().done); refreshScore(); showRecords(); };
$('bRec').onclick = showRecords; $('openRec').onclick = showRecords;
$('bWx').onclick = cycleWeather; $('bCam').onclick = cycleCam;
$('bPause').onclick = () => { st.flying = false; $('hud').hidden = true; $('start').hidden = false; refreshScore(); persist(); };
$('go').onclick = () => startFlying();
// 操作の向き（設定画面で上下・左右をそれぞれ反転できる）
const expert = () => save.opt.ctl === 'expert';
function stickLabel() {
  const y = save.opt.invert ? ['↑上昇', '↓下降', '上に倒し'] : ['↑下降', '↓上昇', '下に引き'];
  const x = expert() ? (save.opt.invertX ? '←右回転 →左回転' : '←左回転 →右回転') : (save.opt.invertX ? '←右旋回 →左旋回' : '←左旋回 →右旋回');
  $('stickLbl').textContent = expert() ? `${y[0]} ${y[1]} ${x}（傾けて${y[2] === '下に引き' ? '引く' : '倒す'}と曲がる）` : `${y[0]} ${y[1]} ${x}（${y[2]}続けると宙返り）`;
  $('howCtl').textContent = expert()
    ? 'エキスパート操作: 左右で機体を回転（ロール）、上下で機首の上げ下げ。曲がるときは傾けてから引く。手を離しても水平には戻らない。左右の小さいボタン（PC は Q / E）で機首を左右に振る（ラダー）。'
    : '初心者操作: 左右でそのまま左右へ曲がる。手を離すと自動で水平に戻る。';
  document.querySelectorAll('input[name=ctl]').forEach(r => { r.checked = r.value === save.opt.ctl; });
  $('rudL').hidden = $('rudR').hidden = !expert();
  $('howY').textContent = save.opt.invert ? 'ジョイスティックは上に倒すと上昇、下に引くと下降。上に倒し続けると宙返り。' : 'ジョイスティックは下に引くと上昇、上に倒すと下降。下に引き続けると宙返り。';
}
$('optInvert').checked = save.opt.invert; $('optInvert').onchange = (e) => { save.opt.invert = e.target.checked; persist(); stickLabel(); };
$('optInvertX').checked = save.opt.invertX; $('optInvertX').onchange = (e) => { save.opt.invertX = e.target.checked; persist(); stickLabel(); };
document.querySelectorAll('input[name=ctl]').forEach(r => r.onchange = () => { save.opt.ctl = r.value; persist(); stickLabel(); });
// ラダー（エキスパート操作のときだけ表示）
for (const [id, v] of [['rudL', -1], ['rudR', 1]]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { b.setPointerCapture(e.pointerId); input.rud = v; b.classList.add('on'); });
  const off = () => { if (input.rud === v) input.rud = 0; b.classList.remove('on'); };
  b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off);
}
stickLabel();
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
  if (wardRing.length) { ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (const ring of wardRing) ring.forEach(([x, z], i) => { const [a, b] = toS(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke(); ctx.setLineDash([]); }
  const colors = { p: '#ffd23f', b: '#3ff0ff', l: '#ff5fd2' };
  for (const r of rings.list) {
    const [a, b] = toS(r.pos.x, r.pos.z); if (a < -6 || b < -6 || a > S + 6 || b > S + 6) continue;
    const d = reg().done[r.id], s = mapWhole ? 3 : 5;
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
  const inv = save.opt.invert ? -1 : 1, invX = save.opt.invertX ? -1 : 1;
  const sx = THREE.MathUtils.clamp((input.x + input.kx) * invX, -1, 1), sy = THREE.MathUtils.clamp((input.y + input.ky) * inv, -1, 1);
  // ピッチ（ほうきの横軸まわり）→ 引き続けると宙返り
  st.q.multiply(tmpQ.setFromAxisAngle(V(1, 0, 0), sy * PITCH * dt));
  if (expert()) {
    // エキスパート: 左右はロール（ほうきの前後軸まわりの回転）。傾いた分だけ少し曲がる（揚力の向き）
    st.q.multiply(tmpQ.setFromAxisAngle(V(0, 0, 1), -sx * 2.2 * dt));
    const rud = THREE.MathUtils.clamp(input.rud + input.krud, -1, 1);
    if (rud) st.q.multiply(tmpQ.setFromAxisAngle(V(0, 1, 0), -rud * 0.45 * dt));
    const r0 = V(1, 0, 0).applyQuaternion(st.q), f0 = V(0, 0, -1).applyQuaternion(st.q);
    if (Math.abs(f0.y) < 0.9) st.q.premultiply(tmpQ.setFromAxisAngle(V(0, 1, 0), r0.y * 0.35 * dt));
  } else {
    // 初心者: 左右はそのまま旋回（鉛直軸まわり）
    st.q.premultiply(tmpQ.setFromAxisAngle(V(0, 1, 0), -sx * 1.05 * dt));
  }
  const f = V(0, 0, -1).applyQuaternion(st.q), up = V(0, 1, 0).applyQuaternion(st.q);
  // 初心者: 操作していない時は、ゆっくり背中を空に向け直す（背面飛行からの復帰）
  if (!expert() && Math.abs(sy) < 0.15 && Math.abs(f.y) < 0.97) {
    const want = V(0, 1, 0).addScaledVector(f, -f.y).normalize();
    const ang = Math.atan2(f.dot(up.clone().cross(want)), up.dot(want));
    st.q.premultiply(tmpQ.setFromAxisAngle(f, ang * Math.min(1, dt * 1.6)));
  }
  st.q.normalize();
  st.bank += ((expert() ? 0 : -sx * 0.65) - st.bank) * Math.min(1, dt * 5);
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
  const ceil = Math.max(1400, world.maxTop + 400);
  if (st.pos.y > ceil) { st.pos.y = ceil; const right = V(1, 0, 0).applyQuaternion(st.q); if (fwd.y > -0.1) st.q.premultiply(tmpQ.setFromAxisAngle(right, -dt * 2)).normalize(); }
  // 区域の外に出すぎたら中央へ向けて曲がる
  const cx = world.X0 + world.W * world.B / 2, cz = world.Z0 + world.H * world.B / 2, R = Math.hypot(st.pos.x - cx, st.pos.z - cz);
  if (R > Math.max(world.W, world.H) * world.B / 2 + 2500) {
    const toC = Math.atan2(cx - st.pos.x, -(cz - st.pos.z)), h = Math.atan2(fwd.x, -fwd.z);
    let d = toC - h; d = Math.atan2(Math.sin(d), Math.cos(d));
    st.q.premultiply(tmpQ.setFromAxisAngle(V(0, 1, 0), -Math.sign(d) * dt * 0.9)).normalize();
    if (st.warn <= 0) { toast('ここから先は地図の外。引き返します', ''); st.warn = 6; }
  }
  st.warn -= dt;
  save.dist += spd * dt; save.time += dt;
  // リング
  for (const r of rings.check(prev, st.pos)) hitRing(r);
  return spd;
}
function hitRing(r) {
  const R = reg(), first = !R.done[r.id];
  if (r.t === 'b') { st.boost = BOOST_T; audio.noise(0.6, 400, 2400, 0.12); }
  sparkles.burst(r.pos, r.t === 'p' ? [1, 0.85, 0.3] : r.t === 'b' ? [0.3, 0.95, 1] : [1, 0.4, 0.85], first ? 70 : 25, r.r);
  if (!first) return;
  R.done[r.id] = Date.now(); R.points += r.pts;
  audio.tone(r.t === 'p' ? [988, 1319] : r.t === 'b' ? [659, 880] : [784, 1047], 0.16);
  toast(`+${r.pts} ${r.name}`, r.t);
  if (r.group) {
    const g = rings.list.filter(x => x.group === r.group);
    if (g.every(x => R.done[x.id])) { setTimeout(() => { toast(r.t === 'l' ? `🎉 ${r.group} 達成！` : `🎉 ${r.group}の加速リング 全部くぐった！`, 'l big'); audio.tone([784, 988, 1175, 1568], 0.2); }, 600); }
  }
  if (doneCount() === rings.total && !R.completedAt) { R.completedAt = Date.now(); setTimeout(() => { toast(`🏆 ${R.name} コンプリート！ 日本地図が塗られました`, 'p big'); audio.tone([523, 659, 784, 1047, 1319], 0.25); }, 1200); }
  rings.setDone(R.done); refreshScore(); persist();
}

// ---------- カメラ追従
function updateCamera(dt, spd) {
  const f = V(0, 0, -1).applyQuaternion(st.q), up = V(0, 1, 0).applyQuaternion(st.q);
  const mode = save.opt.cam;
  rider.visible = mode !== 2;
  const wantUp = up.clone().lerp(V(0, 1, 0), mode === 2 ? 0 : expert() ? 0.12 : 0.35).normalize(); // エキスパートは機体と一緒に視界も傾く
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
  if (!world || !rings) return;
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

// ---------- 地域の読み込み（作り置きの新潟市中央区 / このブラウザに覚えた地図 / その場で自動生成）
let japan = null, loadingRegion = false;
function showLoading(title, msg, p) { $('loading').hidden = false; $('loadTitle').textContent = title; $('loadMsg').textContent = msg; $('loadBar').style.width = Math.round(p * 100) + '%'; }
async function loadRegion(spec) {
  if (loadingRegion) return; loadingRegion = true;
  const prevId = save.current;
  try {
    $('loadBack').hidden = true;
    const R = save.regions[spec.id] || newRegion(spec);
    showLoading(`🧹 ${R.name} を組み立て中…`, 'データを読み込んでいます', 0.02);
    let grid, defs, ward = [];
    setOrigin(R.lat, R.lon);
    if (R.builtin) {
      grid = await World.loadFiles(); defs = NIIGATA_RINGS;
      try { ward = [(await (await fetch('data/ward.json')).json()).ward || []]; } catch { }
    } else {
      const c = await cache.get('region/' + R.id);
      if (c && c.v === 1) ({ grid, defs } = c);
      else { ({ grid, defs } = await generate({ lat: R.lat, lon: R.lon, name: R.name }, (m, p) => showLoading(`🧹 ${R.name} を組み立て中…`, m, p * 0.8))); cache.put('region/' + R.id, { v: 1, grid, defs }); }
      setOrigin(R.lat, R.lon);
      const m = japan?.byCode.get(R.muni);
      if (m) ward = m.rings.map(r => { const o = []; for (let i = 0; i < r.length; i += 2) o.push(ll(r[i + 1], r[i])); return o; });
    }
    // 古い地域を片付けてから新しい地域を組み立てる
    if (world) { world.dispose(); rings.dispose(); }
    world = new World(); rings = null;
    await world.build(grid, (p) => showLoading(`🧹 ${R.name} を組み立て中…`, `ブロックを積んでいます ${Math.round(p * 100)}%`, 0.8 + p * 0.2));
    scene.add(world.group);
    mapImg = world.mapImage(); wardRing = ward;
    rings = new Rings(scene, world, defs);
    save.regions[R.id] = { ...R, total: rings.total, totalPts: rings.totalPts };
    save.current = R.id; persist();
    rings.setDone(reg().done);
    placeStart(); refreshScore();
    $('loading').hidden = true;
    return true;
  } catch (e) {
    console.error(e); save.current = prevId;
    showLoading('😿 地図を作れませんでした', e.message + '（通信を確かめて、もう一度試してください）', 0); $('loadBack').hidden = !world;
    return false;
  } finally { loadingRegion = false; }
}
$('loadBack').onclick = () => { $('loading').hidden = true; };

// ---------- 日本地図の画面
let jpView = JAPAN_VIEW, jpSel = null, jpPref = null;
function drawJapan() { japan.draw($('jpMap'), jpView, muniStatus, jpSel?.code); $('jpBack').hidden = !jpPref; }
function jpStatHtml() {
  const js = japanStats();
  let h = `日本全体 <b>${js.pct}%</b><br>${js.n}/${js.total.toLocaleString()} 市区町村をコンプリート`;
  if (jpPref) { const ms = japan.munis.filter(m => m.pref === jpPref), d = ms.filter(m => muniStatus(m.code) === 'done').length; h += `<br>${jpPref} ${d}/${ms.length}`; }
  $('jpStat').innerHTML = h;
}
const fly2 = async (spec) => { $('japan').hidden = true; if (await loadRegion(spec)) { $('start').hidden = true; startFlying(); } };
function regionSpecForMuni(m) {
  if (m.code === BUILTIN.muni) return { ...BUILTIN };
  return { id: `m:${m.code}`, name: m.name, muni: m.code, pref: m.pref, lat: m.lat, lon: m.lon };
}
function jpShowMuni(m) {
  jpSel = m; drawJapan(); jpStatHtml();
  const rs = Object.values(save.regions).filter(r => r.muni === m.code && r.total);
  const st0 = muniStatus(m.code);
  $('jpInfo').innerHTML = `<b>${m.pref} ${m.name}</b> ${st0 === 'done' ? '🏆 コンプリート' : st0 === 'part' ? '🧹 飛行中' : '・まだ飛んでいません'}`
    + rs.map(r => `<div class="rg"><span>📍 ${r.name}（${pctOf(r)}%）</span><button class="btn sec" data-id="${r.id}">つづきを飛ぶ</button></div>`).join('')
    + (rs.some(r => r.id === regionSpecForMuni(m).id) ? '' : `<div class="rg"><span>${m.code === BUILTIN.muni ? 'PLATEAU の建物で作った特別な地図' : 'この市区町村の中心あたり 5km 四方を自動で作ります'}</span><button class="btn" data-new="1">ここを飛ぶ</button></div>`);
  $('jpInfo').querySelectorAll('button').forEach(b => b.onclick = () => fly2(b.dataset.new ? regionSpecForMuni(m) : save.regions[b.dataset.id]));
}
async function openJapan() {
  $('japan').hidden = false;
  if (!japan) { $('jpInfo').textContent = '日本地図を読み込み中…'; japan = await new JapanMap().load(); }
  jpStatHtml(); drawJapan();
}
$('openJapan').onclick = openJapan;
$('jpClose').onclick = () => { $('japan').hidden = true; refreshScore(); };
$('jpBack').onclick = () => { jpPref = null; jpSel = null; jpView = JAPAN_VIEW; $('jpInfo').textContent = '都道府県をタップすると、市区町村ごとに見られます。'; jpStatHtml(); drawJapan(); };
$('jpMap').addEventListener('click', (e) => {
  const m = japan?.pick($('jpMap'), e.clientX, e.clientY); if (!m) return;
  if (!jpPref || m.pref !== jpPref) { jpPref = m.pref; jpView = japan.prefBox(m.pref); }
  jpShowMuni(m);
});
// 地名で探す（Nominatim。押した時だけ・1 秒に 1 回まで）
let lastSearch = 0;
$('jpSearch').addEventListener('submit', async (e) => {
  e.preventDefault(); const q = $('jpQ').value.trim(); if (!q) return;
  const wait = 1100 - (Date.now() - lastSearch); if (wait > 0) await new Promise(r => setTimeout(r, wait)); lastSearch = Date.now();
  $('jpResults').textContent = '探しています…';
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ja&q=' + encodeURIComponent(q));
    if (!r.ok) throw new Error('検索 ' + r.status);
    const list = await r.json();
    if (!japan) japan = await new JapanMap().load();
    if (!list.length) { $('jpResults').textContent = '見つかりませんでした。別の言い方で試してください。'; return; }
    $('jpResults').innerHTML = '';
    for (const x of list) {
      const lat = +x.lat, lon = +x.lon, m = japan.find(lat, lon), short = (x.name || x.display_name.split(',')[0]).replace(/[（(].*$/, '').trim();
      const row = document.createElement('div'); row.className = 'res';
      row.innerHTML = `<span>${x.display_name}${m ? '' : '（日本の地図の外: 日本地図のコンプリートには数えません）'}</span>`;
      const b = document.createElement('button'); b.className = 'btn'; b.textContent = 'ここを飛ぶ';
      b.onclick = () => fly2({ id: `g:${lat.toFixed(3)},${lon.toFixed(3)}`, name: short, muni: m?.code || null, pref: m?.pref || '', lat, lon });
      row.appendChild(b); $('jpResults').appendChild(row);
    }
  } catch (err) { $('jpResults').textContent = '検索できませんでした: ' + err.message; }
});

// ---------- 起動
function startFlying() { audio.unlock(); save.flights++; persist(); st.flying = true; $('start').hidden = true; $('hud').hidden = false; $('go').textContent = '🧹 つづきを飛ぶ'; layoutHud(); }
(async () => {
  sparkles = new Sparkles(scene);
  await applyWeather(wxKey, true);
  japan = await new JapanMap().load().catch(() => null);
  let ok = await loadRegion(reg());
  if (!ok && save.current !== BUILTIN.id) ok = await loadRegion(save.regions[BUILTIN.id]);
  if (!ok) return;
  $('start').hidden = false;
  requestAnimationFrame((n) => { last = n; frame(n); });
  window.__app = { get world() { return world; }, get rings() { return rings; }, st, input, sky, get save() { return save; }, camera, applyWeather, loadRegion, get japan() { return japan; }, get fps() { return fps; }, renderer, hitRing, flyTo: (x, y, z, hd) => { st.pos.set(x, y, z); st.q.setFromAxisAngle(V(0, 1, 0), -hd * Math.PI / 180); camPos.copy(st.pos).add(V(0, 5, 20)); } };
})();
