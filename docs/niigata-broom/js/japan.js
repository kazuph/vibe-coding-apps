// 日本地図（都道府県 → 市区町村）。データ: 国土数値情報（行政区域）を簡素化した物
export class JapanMap {
  async load() {
    const j = await (await fetch('data/japan.json')).json();
    this.src = j.src;
    this.munis = j.m.map(([code, pref, name, lx, ly, enc]) => {
      const rings = enc.map(f => { const r = new Float32Array(f.length); let x = 0, y = 0; for (let i = 0; i < f.length; i += 2) { x += f[i]; y += f[i + 1]; r[i] = x / j.q; r[i + 1] = y / j.q; } return r; });
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const r of rings) for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); y0 = Math.min(y0, r[i + 1]); y1 = Math.max(y1, r[i + 1]); }
      return { code, pref, name, lon: lx, lat: ly, rings, bb: [x0, y0, x1, y1] };
    });
    this.byCode = new Map(this.munis.map(m => [m.code, m]));
    this.prefs = [...new Set(this.munis.map(m => m.pref))];
    return this;
  }
  // 経度緯度 → 市区町村
  find(lat, lon) {
    for (const m of this.munis) {
      const [x0, y0, x1, y1] = m.bb; if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
      let c = false;
      for (const r of m.rings) for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) c = !c; }
      if (c) return m;
    }
    return null;
  }
  // 描画。status(code) → 'done' | 'part' | null
  draw(canvas, view, status, selected) {
    const ctx = canvas.getContext('2d'), Wc = canvas.width, Hc = canvas.height;
    const [x0, y0, x1, y1] = view, k = 0.8; // 経度の縮み（北緯約37度）
    const s = Math.min(Wc / ((x1 - x0) * k), Hc / (y1 - y0)), ox = (Wc - (x1 - x0) * k * s) / 2, oy = (Hc - (y1 - y0) * s) / 2;
    this.tf = { x0, y1, k, s, ox, oy };
    ctx.fillStyle = '#2f6fb0'; ctx.fillRect(0, 0, Wc, Hc);
    const GREENS = ['#7cc254', '#6aaa48', '#8fcf68', '#5f9c40'];
    const prefView = (x1 - x0) < 8;
    for (const m of this.munis) {
      if (m.bb[2] < x0 || m.bb[0] > x1 || m.bb[3] < y0 || m.bb[1] > y1) continue;
      const st = status(m.code);
      ctx.beginPath();
      for (const r of m.rings) { for (let i = 0; i < r.length; i += 2) { const px = ox + (r[i] - x0) * k * s, py = oy + (y1 - r[i + 1]) * s; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
      ctx.fillStyle = st === 'done' ? '#ffd23f' : st === 'part' ? '#ff8a3d' : GREENS[this.prefs.indexOf(m.pref) % 4];
      ctx.fill('evenodd');
      if (prefView) { ctx.strokeStyle = 'rgba(30,40,30,.45)'; ctx.lineWidth = 1; ctx.stroke(); }
      if (selected && m.code === selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); }
    }
    if (prefView) { // 市区町村名
      ctx.font = `${Math.round(canvas.width / 40)}px DotGothic16, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#132'; ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3;
      for (const m of this.munis) {
        if (m.lon < x0 || m.lon > x1 || m.lat < y0 || m.lat > y1) continue;
        const px = ox + (m.lon - x0) * k * s, py = oy + (y1 - m.lat) * s, nm = m.name.replace(/^.+?市(.+区)$/, '$1').replace(/^.+?郡(.+[町村])$/, '$1');
        ctx.strokeText(nm, px, py); ctx.fillText(nm, px, py);
      }
    }
  }
  pick(canvas, cx, cy) { // 画面座標 → 市区町村
    const { x0, y1, k, s, ox, oy } = this.tf, r = canvas.getBoundingClientRect();
    const px = (cx - r.left) * canvas.width / r.width, py = (cy - r.top) * canvas.height / r.height;
    const lat = y1 - (py - oy) / s, lon = x0 + (px - ox) / (k * s);
    const hit = this.find(lat, lon); if (hit) return hit;
    // 指で押すと少しずれるので、海などを押した時は近くの市区町村（画面上 18px 以内）を選ぶ
    let best = null, bd = 18 * canvas.width / r.width;
    for (const m of this.munis) { const d = Math.hypot((m.lon - lon) * k * s, (m.lat - lat) * s); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  prefBox(pref) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const m of this.munis) if (m.pref === pref) { x0 = Math.min(x0, m.bb[0]); y0 = Math.min(y0, m.bb[1]); x1 = Math.max(x1, m.bb[2]); y1 = Math.max(y1, m.bb[3]); }
    // 離島で広がりすぎる都道府県（東京都・鹿児島県・沖縄県など）は、市区町村の代表点の集まりで絞る
    const pts = this.munis.filter(m => m.pref === pref).map(m => [m.lon, m.lat]).sort((a, b) => a[0] - b[0]);
    if (x1 - x0 > 4 || y1 - y0 > 4) { const mid = pts[Math.floor(pts.length / 2)]; return [mid[0] - 1.2, mid[1] - 0.9, mid[0] + 1.2, mid[1] + 0.9]; }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.06; return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }
}
export const JAPAN_VIEW = [128.4, 30.2, 146.2, 45.7];
