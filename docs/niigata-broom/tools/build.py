# 新潟市中央区のボクセル化（near 8m グリッド + far 圧縮遠景グリッド）
import json, math, os, pickle, gzip, struct, sys
import numpy as np
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT, exist_ok=True)
LAT0, LON0 = 37.9125, 139.0615
KY = 111132.0; KX = 111320.0 * math.cos(math.radians(LAT0))
def ll2xz(lat, lon): return ((lon - LON0) * KX, -(lat - LAT0) * KY)
def xz2ll(x, z): return (LAT0 - z / KY, LON0 + x / KX)

B = 8.0
X0, X1, Z0, Z1 = -6000.0, 5000.0, -5800.0, 5400.0
W = int((X1 - X0) / B); H = int((Z1 - Z0) / B)
print('grid', W, H, W * H)

# ---------- DEM ----------
cache = {}
def load(kind, z, x, y):
    k = (kind, z, x, y)
    if k in cache: return cache[k]
    p = f'dem/{kind}_{z}_{x}_{y}.txt'
    a = None
    if os.path.exists(p) and os.path.getsize(p) > 0:
        rows = open(p).read().strip().split('\n')
        a = np.array([[float(v) if v != 'e' else np.nan for v in r.split(',')] for r in rows], dtype=np.float32)
    cache[k] = a; return a
def sample(kind, z, lat, lon):
    n = 2 ** z
    fx = (lon + 180) / 360 * n
    fy = (1 - np.arcsinh(np.tan(np.radians(lat))) / np.pi) / 2 * n
    tx = np.floor(fx).astype(int); ty = np.floor(fy).astype(int)
    px = np.clip(((fx - tx) * 256).astype(int), 0, 255); py = np.clip(((fy - ty) * 256).astype(int), 0, 255)
    out = np.full(lat.shape, np.nan, np.float32)
    for (a, b) in set(zip(tx.ravel().tolist(), ty.ravel().tolist())):
        t = load(kind, z, a, b)
        if t is None: continue
        m = (tx == a) & (ty == b)
        out[m] = t[py[m], px[m]]
    return out

xs = X0 + (np.arange(W) + 0.5) * B; zs = Z0 + (np.arange(H) + 0.5) * B
XX, ZZ = np.meshgrid(xs, zs)
LAT, LON = xz2ll(XX, ZZ)
h = sample('dem5a', 15, LAT, LON)
for kind, z in (('dem5b', 15), ('dem', 14)):
    m = np.isnan(h)
    if m.any(): h[m] = sample(kind, z, LAT[m], LON[m])
sea = np.isnan(h)
h[sea] = -5
print('sea cells', sea.mean())

# ---------- OSM ----------
osm = json.load(open('osm_raw.json'))['elements']
def px(lat, lon):
    x, z = ll2xz(lat, lon)
    return ((x - X0) / B, (z - Z0) / B)
def stitch(ways):
    ways = [w[:] for w in ways if len(w) >= 2]; rings = []
    while ways:
        cur = ways.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, w in enumerate(ways):
                if w[0] == cur[-1]: cur += w[1:]; ways.pop(i); changed = True; break
                if w[-1] == cur[-1]: cur += w[::-1][1:]; ways.pop(i); changed = True; break
                if w[-1] == cur[0]: cur = w + cur[1:]; ways.pop(i); changed = True; break
                if w[0] == cur[0]: cur = w[::-1] + cur[1:]; ways.pop(i); changed = True; break
        if len(cur) >= 3: rings.append(cur)
    return rings
def geom(e):
    """[(outer rings, inner rings)] in pixel coords"""
    if e['type'] == 'way':
        g = [(p['lat'], p['lon']) for p in e.get('geometry', [])]
        return [[px(*p) for p in g]], []
    outs = stitch([[(p['lat'], p['lon']) for p in m.get('geometry', [])] for m in e['members'] if m['type'] == 'way' and m['role'] in ('outer', '')])
    ins = stitch([[(p['lat'], p['lon']) for p in m.get('geometry', [])] for m in e['members'] if m['type'] == 'way' and m['role'] == 'inner'])
    return [[px(*p) for p in r] for r in outs], [[px(*p) for p in r] for r in ins]

def polymask(els, ss=2):
    img = Image.new('1', (W * ss, H * ss), 0); d = ImageDraw.Draw(img)
    for e in els:
        outs, ins = geom(e)
        for r in outs:
            if len(r) >= 3: d.polygon([(x * ss, y * ss) for x, y in r], fill=1)
        for r in ins:
            if len(r) >= 3: d.polygon([(x * ss, y * ss) for x, y in r], fill=0)
    a = np.asarray(img, dtype=np.uint8).reshape(H, ss, W, ss).mean(axis=(1, 3))
    return a >= 0.5
def linemask(els, width_m):
    img = Image.new('1', (W, H), 0); d = ImageDraw.Draw(img)
    for e in els:
        r = [px(p['lat'], p['lon']) for p in e.get('geometry', [])]
        if len(r) >= 2:
            w = width_m(e) if callable(width_m) else width_m
            d.line(r, fill=1, width=max(1, int(round(w / B))))
    return np.asarray(img, dtype=bool)

T = lambda e: e.get('tags', {})
sel = lambda f: [e for e in osm if f(T(e))]
water_els = sel(lambda t: t.get('natural') == 'water' or t.get('waterway') == 'riverbank')
water = polymask(water_els)
farm = polymask(sel(lambda t: t.get('landuse') == 'farmland'))
grass = polymask(sel(lambda t: t.get('landuse') in ('grass', 'meadow', 'village_green', 'recreation_ground', 'cemetery') or t.get('natural') in ('grassland', 'scrub')))
park = polymask(sel(lambda t: t.get('leisure') in ('park', 'garden', 'golf_course')))
pitch = polymask(sel(lambda t: t.get('leisure') in ('pitch', 'stadium', 'sports_centre')))
forest = polymask(sel(lambda t: t.get('landuse') == 'forest' or t.get('natural') == 'wood'))
sand = polymask(sel(lambda t: t.get('natural') in ('beach', 'sand')))
indus = polymask(sel(lambda t: t.get('landuse') in ('industrial', 'harbour', 'port', 'railway')))
RW = {'motorway': 22, 'trunk': 20, 'primary': 16, 'secondary': 14, 'tertiary': 11, 'motorway_link': 9, 'trunk_link': 9, 'primary_link': 9, 'secondary_link': 8, 'tertiary_link': 8, 'residential': 6, 'unclassified': 6}
roads_all = sel(lambda t: t.get('highway') in RW)
bigroad = linemask([e for e in roads_all if RW[T(e)['highway']] >= 11], lambda e: RW[T(e)['highway']])
road = linemask(roads_all, lambda e: RW[T(e)['highway']]) & ~bigroad
rail = linemask(sel(lambda t: t.get('railway') == 'rail'), 8)
bridge_els = sel(lambda t: t.get('bridge') and (t.get('highway') in list(RW) + ['footway', 'pedestrian', 'cycleway', 'path'] or t.get('railway') == 'rail'))
bridge = linemask(bridge_els, lambda e: RW.get(T(e).get('highway'), 8))
stone = linemask(sel(lambda t: t.get('man_made') in ('breakwater', 'groyne', 'pier')), 10)

# ---------- 区界 ----------
ward = [e for e in osm if e['type'] == 'relation' and T(e).get('boundary') == 'administrative']
wardmask = polymask(ward, 1) if ward else np.ones((H, W), bool)
ward_ring = []
if ward:
    outs, _ = geom(ward[0]); r = max(outs, key=len)
    step = max(1, len(r) // 400)
    ward_ring = [[round(X0 + x * B, 1), round(Z0 + y * B, 1)] for x, y in r[::step]]

# ---------- Buildings (PLATEAU) ----------
bl = pickle.load(open('bldg.pkl', 'rb'))
def style_of(u):
    if u == 411: return 0          # 住宅
    if u in (412, 414): return 1   # 共同住宅
    if u in (401, 404): return 2   # 業務
    if u in (402, 403, 413): return 3  # 商業・宿泊
    if u in (421, 422): return 4   # 官公庁・文教
    if u in (431, 441, 452, 451): return 5  # 倉庫・工場
    return 6
SS = 2
bh_img = Image.new('I', (W * SS, H * SS), 0); d = ImageDraw.Draw(bh_img)
st_img = Image.new('L', (W * SS, H * SS), 0); d2 = ImageDraw.Draw(st_img)
id_img = Image.new('L', (W * SS, H * SS), 0); d3 = ImageDraw.Draw(id_img)
# 高さは低い順に描いて、重なりは高い方が残るようにする。LOD2 がある建物は屋根面ごとの高さを使う
draws = []
for bi, (ring, hgt, u, roofs) in enumerate(bl):
    pts = [px(la, lo) for la, lo in ring]
    if min(p[0] for p in pts) > W or max(p[0] for p in pts) < 0 or min(p[1] for p in pts) > H or max(p[1] for p in pts) < 0: continue
    pp = [(x * SS, y * SS) for x, y in pts]
    d2.polygon(pp, fill=style_of(u) + 1); d3.polygon(pp, fill=1 + bi % 251)
    if roofs:
        draws.append((min(z for _, z in roofs), pp))
        for r, z in roofs:
            rp = [px(la, lo) for la, lo in r]
            if len(rp) >= 3: draws.append((z, [(x * SS, y * SS) for x, y in rp]))
    else:
        draws.append((hgt, pp))
draws.sort(key=lambda d: d[0])
for z, pp in draws:
    if z > 0.5: d.polygon(pp, fill=int(z * 10))
bh_s = np.asarray(bh_img, dtype=np.int32).reshape(H, SS, W, SS)
st_s = np.asarray(st_img, dtype=np.uint8).reshape(H, SS, W, SS)
cover = (bh_s > 0).mean(axis=(1, 3))
bh = bh_s.max(axis=(1, 3)) / 10.0
st = st_s.max(axis=(1, 3))
bid = np.asarray(id_img, dtype=np.uint8).reshape(H, SS, W, SS).max(axis=(1, 3))
anyroad = road | bigroad | rail
isb = (cover >= 0.25) & ~water & ~sea
isb &= ~(anyroad & (cover < 0.75))
isb &= ~(bigroad & (cover < 1.0))
bhb = np.where(isb, np.maximum(1, np.round(bh / B)), 0).astype(np.uint8)
print('building cells', isb.mean(), 'max', bhb.max())

# ---------- 合成 ----------
# mat: 0 sea 1 river 2 sand 3 grass 4 road 5 rail 6 forest 7 park 8 farm 9 town 10 bridge 11 stone 12 concrete 13 pitch 14 bigroad
from numpy.lib.stride_tricks import sliding_window_view
pad = np.pad(isb.astype(np.float32), 4)
dens = sliding_window_view(pad, (9, 9)).mean(axis=(2, 3))
mat = np.where(dens > 0.12, 9, 3).astype(np.uint8)
mat[farm] = 8; mat[grass] = 3; mat[park] = 7; mat[pitch] = 13; mat[forest] = 6; mat[indus] = 12
# 海岸砂丘: 海に近い低地は砂
near_sea = sea.copy()
for _ in range(5):
    n = near_sea.copy(); n[1:] |= near_sea[:-1]; n[:-1] |= near_sea[1:]; n[:, 1:] |= near_sea[:, :-1]; n[:, :-1] |= near_sea[:, 1:]; near_sea = n
mat[near_sea & ~sea] = 2
mat[sand] = 2
mat[road] = 4; mat[bigroad] = 14; mat[rail] = 5
wat = (water | sea)
mat[water & ~sea] = 1; mat[sea] = 0
br = bridge & wat
mat[br] = 10
st_mask = stone & sea
mat[st_mask] = 11
# 地面レベル
L = np.clip(1 + np.floor(np.maximum(h, 0) / B + 0.15), 1, 60).astype(np.uint8)
L[wat] = 0
L[br] = 1; L[st_mask] = 1
bhb[wat & ~br] = 0; bhb[br] = 0; bhb[st_mask] = 0
# 建物スタイル (0..7)
style = np.where(isb, np.maximum(st, 1) - 1, 0).astype(np.uint8)

# ---------- 書き出し ----------
hdr = struct.pack('<4sIIffff', b'NBV1', W, H, X0, Z0, B, 0)
raw = hdr + L.tobytes() + mat.tobytes() + bhb.tobytes() + style.tobytes() + wardmask.astype(np.uint8).tobytes() + np.where(isb, bid, 0).astype(np.uint8).tobytes()
open(f'{OUT}/near.bin.gz', 'wb').write(gzip.compress(raw, 9))
print('near', len(raw) / 1e6, 'MB raw ->', os.path.getsize(f'{OUT}/near.bin.gz') / 1e6, 'MB gz')

# ---------- far (距離圧縮した遠景) ----------
F = 200.0; R0 = 9000.0; K = 0.45; FN = 440
fxs = (np.arange(FN) - FN / 2 + 0.5) * F
FX, FZ = np.meshgrid(fxs, fxs)
r = np.hypot(FX, FZ); rr = np.where(r < R0, r, R0 + (r - R0) / K)
sc = np.where(r > 0, rr / np.maximum(r, 1e-6), 1)
RX, RZ = FX * sc, FZ * sc
FLAT, FLON = xz2ll(RX, RZ)
fh = sample('dem', 11, FLAT, FLON)
fsea = np.isnan(fh)
# 範囲外（内陸東・南）は平野として扱う
outside = (FLON > 139.74) | (FLAT < 37.46)
fh[fsea & outside & (FLAT < 38.0) & (FLON > 139.2)] = 5
fh[fsea & outside & (FLAT < 37.47)] = 5
fsea = np.isnan(fh)
fh[fsea] = -5
VF = 25.0; EX = 1.5
FL = np.where(fsea, 0, np.maximum(1, np.round(np.maximum(fh, 0) * EX / VF))).astype(np.uint8)
inner = (FX > X0 + F) & (FX < X1 - F) & (FZ > Z0 + F) & (FZ < Z1 - F)
FL[inner] = 255  # near グリッドがある範囲は描かない
hdr = struct.pack('<4sIffff', b'NBF1', FN, F, VF, R0, K)
open(f'{OUT}/far.bin.gz', 'wb').write(gzip.compress(hdr + FL.tobytes(), 9))
print('far max level', FL[FL < 255].max(), os.path.getsize(f'{OUT}/far.bin.gz') / 1e6, 'MB')
json.dump({'ward': ward_ring}, open(f'{OUT}/ward.json', 'w'))

# プレビュー
pal = np.array([[40, 90, 170], [60, 130, 200], [230, 215, 160], [110, 170, 80], [150, 150, 150], [110, 90, 80], [40, 110, 50], [90, 180, 90], [190, 190, 90], [180, 170, 150], [120, 100, 90], [130, 130, 140], [170, 170, 175], [120, 190, 110], [90, 90, 100]], np.uint8)
img = pal[mat]
img[isb] = [200, 120, 100]
Image.fromarray(img).save(f'{OUT}/preview.png')
fim = np.zeros((FN, FN, 3), np.uint8); fim[...] = [40, 90, 170]
land = (FL > 0) & (FL < 255); fim[land] = np.stack([np.clip(80 + FL[land] * 4, 0, 255)] * 3, -1)
fim[FL == 255] = [255, 0, 0]
Image.fromarray(fim).save(f'{OUT}/far_preview.png')
