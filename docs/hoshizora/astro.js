/* 今夜の空 — 天文計算とセンサー姿勢の純関数（ブラウザでは globalThis.Astro、Node テストでも同じものを読む） */
(function (root) {
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const sind = x => Math.sin(x * D2R), cosd = x => Math.cos(x * D2R);
const rev = x => x - Math.floor(x / 360) * 360;

/* ===== 恒星カタログ（J2000）: id|名前|赤経h|赤緯°|等級|色|距離(光年) ===== */
const RAW = `sirius|シリウス|6.752|-16.716|-1.46|b|8.6
canopus|カノープス|6.399|-52.696|-0.74|w|310
alphacen|リギル・ケンタウルス|14.660|-60.835|-0.27|y|4.4
arcturus|アークトゥルス|14.261|19.182|-0.05|o|37
vega|ベガ（織姫星）|18.616|38.784|0.03|b|25
capella|カペラ|5.278|45.998|0.08|y|43
rigel|リゲル|5.242|-8.202|0.13|b|860
procyon|プロキオン|7.655|5.225|0.34|w|11.5
achernar|アケルナル|1.629|-57.237|0.46|b|139
betelgeuse|ベテルギウス|5.919|7.407|0.5|r|550
altair|アルタイル（彦星）|19.846|8.868|0.77|w|17
aldebaran|アルデバラン|4.599|16.509|0.86|o|65
spica|スピカ|13.420|-11.161|0.98|b|250
antares|アンタレス|16.490|-26.432|1.06|r|550
pollux|ポルックス|7.755|28.026|1.14|o|34
fomalhaut|フォーマルハウト|22.961|-29.622|1.16|w|25
deneb|デネブ|20.690|45.280|1.25|w|2600
regulus|レグルス|10.140|11.967|1.35|b|79
adhara|アダーラ|6.977|-28.972|1.5|b|
castor|カストル|7.577|31.888|1.58|w|51
alcyone|すばる（プレアデス星団）|3.791|24.105|1.6|b|444
shaula|シャウラ|17.560|-37.104|1.62|b|
bellatrix|ベラトリックス|5.419|6.350|1.64|b|250
elnath|エルナト|5.438|28.608|1.65|b|
alnilam|アルニラム|5.604|-1.202|1.69|b|
alnitak|アルニタク|5.679|-1.943|1.77|b|
alioth|アリオト|12.900|55.960|1.77|w|
mirfak|ミルファク|3.405|49.861|1.79|y|510
dubhe|ドゥーベ|11.062|61.751|1.79|o|123
wezen|ウェズン|7.140|-26.393|1.83|y|
kausaus|カウス・アウストラリス|18.403|-34.385|1.85|w|
sargas|サルガス|17.622|-42.998|1.86|y|
alkaid|ベネトナシュ|13.792|49.313|1.86|b|104
menkalinan|メンカリナン|5.992|44.948|1.9|w|
alhena|アルヘナ|6.629|16.399|1.93|w|
polaris|ポラリス（北極星）|2.530|89.264|1.98|y|430
mirzam|ミルザム|6.378|-17.956|1.98|b|
alphard|アルファルド|9.460|-8.659|1.98|o|
hamal|ハマル|2.120|23.463|2.0|o|66
algieba|アルギエバ|10.333|19.842|2.0|o|
diphda|デネブ・カイトス|0.727|-17.987|2.04|o|
nunki|ヌンキ|18.921|-26.297|2.05|b|
mirach|ミラク|1.162|35.621|2.05|r|
alpheratz|アルフェラッツ|0.140|29.091|2.06|b|97
kochab|コカブ|14.845|74.156|2.08|o|
rasalhague|ラス・アルハゲ|17.582|12.560|2.08|w|
saiph|サイフ|5.796|-9.670|2.09|b|
algol|アルゴル|3.136|40.956|2.1|b|90
almach|アルマク|2.065|42.330|2.1|o|
denebola|デネボラ|11.818|14.572|2.14|w|36
gammacas|カシオペヤ座γ|0.945|60.717|2.15|b|
alphecca|アルフェッカ|15.578|26.715|2.23|w|
mintaka|ミンタカ|5.533|-0.299|2.23|b|
sadr|サドル|20.370|40.257|2.23|y|
schedar|シェダル|0.675|56.537|2.24|o|
eltanin|エルタニン|17.943|51.489|2.24|o|
mizar|ミザール|13.399|54.925|2.27|w|83
caph|カフ|0.153|59.150|2.28|w|
dschubba|ジュバ|16.006|-22.622|2.29|b|
epssco|さそり座ε|16.836|-34.293|2.29|o|
merak|メラク|11.031|56.382|2.37|w|
izar|イザール|14.750|27.074|2.37|o|
enif|エニフ|21.736|9.875|2.39|o|
kappasco|ギルタブ|17.708|-39.030|2.4|b|
scheat|シェアト|23.063|28.083|2.42|r|
phecda|フェクダ|11.897|53.695|2.44|w|
alderamin|アルデラミン|21.310|62.586|2.45|w|
aludra|アルドラ|7.402|-29.303|2.45|b|
markab|マルカブ|23.079|15.205|2.48|b|
gienah|ギェナー|20.770|33.970|2.48|o|
menkar|メンカル|3.038|4.090|2.53|r|
zosma|ゾスマ|11.235|20.524|2.56|w|
ascella|アスケラ|19.044|-29.880|2.6|w|
zubeneschamali|ズベン・エス・カマリ|15.283|-9.383|2.61|b|
acrab|アクラブ|16.091|-19.806|2.62|b|
thetaaur|マハシム|5.995|37.213|2.62|w|
unukalhai|ウヌカルハイ|15.738|6.426|2.63|o|
sheratan|シェラタン|1.911|20.808|2.64|w|
ruchbah|ルクバー|1.430|60.235|2.66|w|
muphrid|ムフリッド|13.911|18.398|2.68|y|
hassaleh|ハッサレー|4.950|33.166|2.69|o|
lesath|レサト|17.513|-37.296|2.7|b|
kausmed|カウス・メディア|18.350|-29.828|2.7|o|
tarazed|タラゼド|19.771|10.613|2.72|o|
porrima|ポリマ|12.694|-1.449|2.74|w|
zubenelgenubi|ズベン・エル・ゲヌビ|14.848|-16.042|2.75|w|
rastaban|ラスタバン|17.507|52.301|2.79|y|
kausbor|カウス・ボレアリス|18.466|-25.422|2.8|o|
tausco|さそり座τ|16.598|-28.216|2.82|b|
algenib|アルゲニブ|0.220|15.184|2.83|b|
vindemiatrix|ビンデミアトリックス|13.036|10.959|2.83|y|
dengedi|デネブ・アルゲディ|21.784|-16.127|2.85|w|
tejat|テジャト|6.383|22.514|2.87|r|
deltacyg|はくちょう座δ|19.750|45.131|2.87|b|
pisco|さそり座π|15.981|-26.114|2.89|b|
sigmasco|アルニヤト|16.353|-25.593|2.89|b|
gomeisa|ゴメイサ|7.453|8.289|2.89|b|
corcaroli|コル・カロリ|12.934|38.318|2.9|w|
epsleo|しし座ε|9.764|23.774|2.98|y|
zetaaql|わし座ζ|19.090|13.863|2.99|w|
alnasl|アルナスル|18.097|-30.424|2.99|o|
pherkad|フェルカド|15.345|71.834|3.0|w|
mebsuta|メブスタ|6.732|25.131|3.0|y|
mu1sco|さそり座μ|16.864|-38.047|3.0|b|
iota1sco|さそり座ι|17.793|-40.127|3.0|y|
zetatau|おうし座ζ|5.627|21.143|3.0|b|
seginus|セギヌス|14.535|38.308|3.03|w|
albireo|アルビレオ|19.512|27.960|3.05|o|430
phisgr|いて座φ|18.761|-26.991|3.17|b|
thetaaql|わし座θ|20.188|-0.821|3.23|b|
sulafat|スラファト|18.982|32.690|3.25|b|
tausgr|いて座τ|19.116|-27.671|3.3|o|
etasco|さそり座η|17.203|-43.239|3.3|w|
megrez|メグレズ|12.257|57.033|3.31|w|
chertan|シェルタン|11.237|15.430|3.33|w|
segin|セギン|1.907|63.670|3.35|b|
deltaaql|わし座δ|19.425|3.115|3.36|w|
meissa|メイサ|5.585|9.934|3.39|b|
homam|ホマム|22.691|10.831|3.4|b|
lambdaaql|わし座λ|19.104|-4.882|3.43|b|
adhafera|アダフェラ|10.278|23.417|3.43|w|
deltaboo|うしかい座δ|15.258|33.315|3.47|y|
nekkar|ネッカル|15.032|40.390|3.5|y|
sheliak|シェリアク|18.835|33.363|3.5|b|
etaleo|しし座η|10.122|16.763|3.5|w|
thetapeg|ビハム|22.170|6.198|3.5|w|
epstau|アイン|4.477|19.180|3.53|o|
wasat|ワサト|7.335|21.982|3.53|w|
rhoboo|うしかい座ρ|14.530|30.371|3.58|o|
zeta2sco|さそり座ζ|16.910|-42.362|3.6|o|
gammatau|おうし座γ|4.330|15.628|3.65|o|
thuban|トゥバン|14.073|64.376|3.65|w|
betacrb|ヌサカン|15.464|29.106|3.68|w|
alshain|アルシャイン|19.922|6.407|3.71|y|
deltatau|おうし座δ|4.382|17.543|3.76|o|
gammacrb|かんむり座γ|15.713|26.296|3.8|w|
rasel|ラス・エラセド|9.879|26.007|3.88|o|
thetacrb|かんむり座θ|15.549|31.359|4.1|b|
epscrb|かんむり座ε|15.960|26.878|4.15|o|
epsumi|こぐま座ε|16.766|82.037|4.2|y|
zetaumi|こぐま座ζ|15.734|77.795|4.3|w|
zetalyr|こと座ζ|18.746|37.605|4.3|w|
delta2lyr|こと座δ|18.908|36.899|4.3|r|
yildun|ユルドゥン|17.537|86.586|4.35|w|
deltacrb|かんむり座δ|15.827|26.068|4.6|y|
etaumi|こぐま座η|16.292|75.755|4.95|w|`;

const COL = { b: [200, 215, 255], w: [248, 246, 255], y: [255, 240, 205], o: [255, 212, 160], r: [255, 170, 140] };
const stars = RAW.trim().split('\n').map(l => {
  const [id, name, ra, dec, mag, col, ly] = l.split('|');
  return { id, name, ra: +ra * 15, dec: +dec, mag: +mag, col: COL[col], ly: ly ? +ly : null };
});

/* ===== 天文計算 ===== */
const jd = d => d.getTime() / 86400000 + 2440587.5;
// 地方恒星時（度）
const lstDeg = (J, lon) => rev(280.46061837 + 360.98564736629 * (J - 2451545) + lon);
// J2000 → 観測日の平均赤道座標。IAU 1976 の回転（極付近でも tan(dec) を使わない）。
function precess(ra, dec, T) { // T: J2000 からの年数
  const t = T / 100;
  const zeta = (2306.2181*t + 0.30188*t*t + 0.017998*t*t*t) / 3600;
  const z = (2306.2181*t + 1.09468*t*t + 0.018203*t*t*t) / 3600;
  const theta = (2004.3109*t - 0.42665*t*t - 0.041833*t*t*t) / 3600;
  const A = cosd(dec) * sind(ra + zeta);
  const B = cosd(theta) * cosd(dec) * cosd(ra + zeta) - sind(theta) * sind(dec);
  const C = sind(theta) * cosd(dec) * cosd(ra + zeta) + cosd(theta) * sind(dec);
  return [rev(Math.atan2(A, B) * R2D + z), Math.atan2(C, Math.hypot(A, B)) * R2D];
}
// 赤道座標 → 東・北・天頂の単位ベクトル
function enu(ra, dec, lst, lat) {
  const H = (lst - ra) * D2R, dl = dec * D2R, ph = lat * D2R;
  return [-Math.cos(dl) * Math.sin(H),
    Math.cos(ph) * Math.sin(dl) - Math.sin(ph) * Math.cos(dl) * Math.cos(H),
    Math.sin(ph) * Math.sin(dl) + Math.cos(ph) * Math.cos(dl) * Math.cos(H)];
}
function orbit(N, i, w, a, e, M) {
  M = rev(M); let E = M + R2D * e * sind(M) * (1 + e * cosd(M));
  for (let k = 0; k < 6; k++) E = E - (E - R2D * e * sind(E) - M) / (1 - e * cosd(E));
  const xv = a * (cosd(E) - e), yv = a * Math.sqrt(1 - e * e) * sind(E);
  const v = Math.atan2(yv, xv) * R2D, r = Math.hypot(xv, yv), vw = v + w;
  return { x: r * (cosd(N) * cosd(vw) - sind(N) * sind(vw) * cosd(i)),
    y: r * (sind(N) * cosd(vw) + cosd(N) * sind(vw) * cosd(i)),
    z: r * sind(vw) * sind(i), v, r };
}
function ecl2eq(x, y, z, ecl) {
  const ye = y * cosd(ecl) - z * sind(ecl), ze = y * sind(ecl) + z * cosd(ecl);
  return { ra: rev(Math.atan2(ye, x) * R2D), dec: Math.atan2(ze, Math.hypot(x, ye)) * R2D, dist: Math.hypot(x, y, z) };
}
// 太陽・月・惑星（Paul Schlyter の軌道要素。月は主要摂動つき）
function bodies(J) {
  const d = J - 2451543.5, ecl = 23.4393 - 3.563e-7 * d;
  const ws = 282.9404 + 4.70935e-5 * d, es = 0.016709 - 1.151e-9 * d, Ms = rev(356.0470 + 0.9856002585 * d);
  const so = orbit(0, 0, ws, 1, es, Ms); const lsun = rev(so.v + ws);
  const xs = so.r * cosd(lsun), ys = so.r * sind(lsun);
  const out = [{ key: 'sun', name: '太陽', ...ecl2eq(xs, ys, 0, ecl) }];
  const Nm = 125.1228 - 0.0529538083 * d, wm = 318.0634 + 0.1643573223 * d, Mm = rev(115.3654 + 13.0649929509 * d);
  const mo = orbit(Nm, 5.1454, wm, 60.2666, 0.0549, Mm);
  let ml = Math.atan2(mo.y, mo.x) * R2D, mb = Math.atan2(mo.z, Math.hypot(mo.x, mo.y)) * R2D;
  let mr = mo.r;
  const Ls = rev(Ms + ws), Lm = rev(Mm + wm + Nm), D = Lm - Ls, Fm = Lm - Nm;
  ml += -1.274 * sind(Mm - 2 * D) + 0.658 * sind(2 * D) - 0.186 * sind(Ms) - 0.059 * sind(2 * Mm - 2 * D) - 0.057 * sind(Mm - 2 * D + Ms)
    + 0.053 * sind(Mm + 2 * D) + 0.046 * sind(2 * D - Ms) + 0.041 * sind(Mm - Ms) - 0.035 * sind(D) - 0.031 * sind(Mm + Ms)
    - 0.015 * sind(2 * Fm - 2 * D) + 0.011 * sind(Mm - 4 * D);
  mb += -0.173 * sind(Fm - 2 * D) - 0.055 * sind(Mm - Fm - 2 * D) - 0.046 * sind(Mm + Fm - 2 * D) + 0.033 * sind(Fm + 2 * D) + 0.017 * sind(2 * Mm + Fm);
  mr += -0.58 * cosd(Mm - 2 * D) - 0.46 * cosd(2 * D);
  const mq = ecl2eq(cosd(mb) * cosd(ml), cosd(mb) * sind(ml), sind(mb), ecl);
  out.push({ key: 'moon', name: '月', ra: mq.ra, dec: mq.dec, age: rev(ml - lsun), distKm: mr * 6378.14 });
  const P = [
    ['mercury', '水星', [48.3313, 3.24587e-5], [7.0047, 5e-8], [29.1241, 1.01444e-5], 0.387098, [0.205635, 5.59e-10], [168.6562, 4.0923344368], [200, 200, 190], -0.2],
    ['venus', '金星', [76.6799, 2.4659e-5], [3.3946, 2.75e-8], [54.891, 1.38374e-5], 0.72333, [0.006773, -1.302e-9], [48.0052, 1.6021302244], [255, 250, 225], -4.2],
    ['mars', '火星', [49.5574, 2.11081e-5], [1.8497, -1.78e-8], [286.5016, 2.92961e-5], 1.523688, [0.093405, 2.516e-9], [18.6021, 0.5240207766], [255, 150, 110], 0.5],
    ['jupiter', '木星', [100.4542, 2.76854e-5], [1.303, -1.557e-7], [273.8777, 1.64505e-5], 5.20256, [0.048498, 4.469e-9], [19.895, 0.0830853001], [255, 236, 205], -2.3],
    ['saturn', '土星', [113.6634, 2.3898e-5], [2.4886, -1.081e-7], [339.3939, 2.97661e-5], 9.55475, [0.055546, -9.499e-9], [316.967, 0.0334442282], [245, 225, 170], 0.6]];
  const Mj = rev(19.895 + 0.0830853001 * d), Msa = rev(316.967 + 0.0334442282 * d);
  for (const [key, name, N, i, w, a, e, M, col, mag] of P) {
    const o = orbit(N[0] + N[1] * d, i[0] + i[1] * d, w[0] + w[1] * d, a, e[0] + e[1] * d, M[0] + M[1] * d);
    let x = o.x, y = o.y, z = o.z;
    if (key === 'jupiter' || key === 'saturn') { // 木星・土星の大きな相互摂動
      let lo = Math.atan2(y, x) * R2D, la = Math.atan2(z, Math.hypot(x, y)) * R2D; const r = Math.hypot(x, y, z);
      if (key === 'jupiter') lo += -0.332 * sind(2 * Mj - 5 * Msa - 67.6) - 0.056 * sind(2 * Mj - 2 * Msa + 21) + 0.042 * sind(3 * Mj - 5 * Msa + 21)
        - 0.036 * sind(Mj - 2 * Msa) + 0.022 * cosd(Mj - Msa) + 0.023 * sind(2 * Mj - 3 * Msa + 52) - 0.016 * sind(Mj - 5 * Msa - 69);
      else {
        lo += 0.812 * sind(2 * Mj - 5 * Msa - 67.6) - 0.229 * cosd(2 * Mj - 4 * Msa - 2) + 0.119 * sind(Mj - 2 * Msa - 3)
          + 0.046 * sind(2 * Mj - 6 * Msa - 69) + 0.014 * sind(Mj - 3 * Msa + 32);
        la += -0.020 * cosd(2 * Mj - 4 * Msa - 2) + 0.018 * sind(2 * Mj - 6 * Msa - 49);
      }
      x = r * cosd(lo) * cosd(la); y = r * sind(lo) * cosd(la); z = r * sind(la);
    }
    const q = ecl2eq(x + xs, y + ys, z, ecl);
    out.push({ key, name, col, mag, ra: q.ra, dec: q.dec, dist: q.dist });
  }
  return out;
}
// ある時刻・場所の空（すべて東北天頂ベクトル）。月は地心→観測地点（地表）からの見え方に補正
function skyAt(date, lat, lon, refracted = true) {
  const J = jd(date), T = (J - 2451545) / 365.25, lst = lstDeg(J, lon);
  const observed = v => refracted ? refract(v) : v;
  const st = stars.map(s => { const [ra, dec] = precess(s.ra, s.dec, T); return { s, v: observed(enu(ra, dec, lst, lat)) }; });
  const bs = bodies(J).map(b => {
    let v = enu(b.ra, b.dec, lst, lat);
    if (b.key === 'moon') { // 月の視差（最大約1°）: 地球中心でなく地表から見る
      const k = b.distKm / 6378.14; v = [v[0] * k, v[1] * k, v[2] * k - 1];
      const n = Math.hypot(...v); v = [v[0] / n, v[1] / n, v[2] / n];
    }
    return { ...b, v: observed(v) };
  });
  return { J, lst, stars: st, bodies: bs };
}
const altAz = v => ({ alt: Math.atan2(v[2], Math.hypot(v[0], v[1])) * R2D, az: rev(Math.atan2(v[0], v[1]) * R2D) });
// Sæmundsson: 幾何高度→見かけ高度。標準大気 10°C / 1010hPa。
// 地平線より下の淡い表示は -1° の補正を天底まで連続的に減らす（観測精度は保証しない）。
function refract(v) {
  const {alt, az} = altAz(v), h = Math.max(-1, alt);
  let correction = Math.max(0, 1.02 / Math.tan((h + 10.3 / (h + 5.11)) * D2R) / 60);
  if (alt < -1) correction *= (alt + 90) / 89;
  const a = Math.min(90, alt + correction);
  return [cosd(a) * sind(az), cosd(a) * cosd(az), sind(a)];
}

/* ===== センサー姿勢 → 視線 =====
   DeviceOrientation の alpha/beta/gamma（Z-X'-Y'' 回転）を東北天頂の世界座標へ。
   r = 画面の右、u = 画面の上、f = 背面カメラの向き（画面の奥）。 */
function deviceBasis(a, b, g) {
  const cA = cosd(a), sA = sind(a), cB = cosd(b), sB = sind(b), cG = cosd(g), sG = sind(g);
  const r = [cA * cG - sA * sB * sG, sA * cG + cA * sB * sG, -cB * sG];
  const u = [-sA * cB, cA * cB, sB];
  const z = [cA * sG + sA * sB * cG, sA * sG - cA * sB * cG, cB * cG];
  return { r, u, z };
}
function deviceView(a, b, g, screenAngle) {
  let { r, u, z } = deviceBasis(a, b, g);
  const th = -(screenAngle || 0) * D2R;
  if (th) {
    const c = Math.cos(th), s = Math.sin(th);
    const r2 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
    u = [-r[0] * s + u[0] * c, -r[1] * s + u[1] * c, -r[2] * s + u[2] * c]; r = r2;
  }
  return { r, u, f: [-z[0], -z[1], -z[2]] };
}
/* iOS の alpha は北基準ではない。heading は磁気偏角を補正した真方位。
   CoreLocation の基準は縦持ちの上端。平らな姿勢でのみ校正し、傾けたら保持する。
   直立時に「背面カメラの方位」とみなす推測はしない。 */
function iosAlphaOffset(a, b, g, heading) {
  if (![a, b, g, heading].every(Number.isFinite) || Math.abs(b) >= 15 || Math.abs(g) >= 15) return null;
  const vec = deviceBasis(a, b, g).u;
  const azRaw = rev(Math.atan2(vec[0], vec[1]) * R2D);
  return rev(azRaw - heading); // alpha に足すと方位が heading に一致する量
}

root.Astro = { D2R, R2D, sind, cosd, rev, stars, jd, lstDeg, precess, enu, bodies, skyAt, altAz, refract, deviceBasis, deviceView, iosAlphaOffset };
})(typeof globalThis !== 'undefined' ? globalThis : this);
