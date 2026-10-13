# 国土数値情報（行政区域）を簡素化した市区町村 GeoJSON（smartnews-smri/japan-topography）を、ゲーム用の小さな JSON にする
import json, sys, math
d = json.load(open(sys.argv[1]))
Q = 1000  # 0.001 度単位
out = []
def area(r): return 0.5 * sum(r[i][0] * r[i - 1][1] - r[i - 1][0] * r[i][1] for i in range(len(r)))
def inside(x, y, rings):
    c = False
    for r in rings:
        for i in range(len(r)):
            x1, y1 = r[i]; x2, y2 = r[i - 1]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def label(polys):
    big = max(polys, key=lambda p: abs(area(p[0])))
    xs = [p[0] for p in big[0]]; ys = [p[1] for p in big[0]]
    best, bd = None, -1
    for i in range(1, 24):
        for j in range(1, 24):
            x = min(xs) + (max(xs) - min(xs)) * i / 24; y = min(ys) + (max(ys) - min(ys)) * j / 24
            if not inside(x, y, big): continue
            dmin = min(math.hypot(x - a, y - b) for r in big for a, b in r)
            if dmin > bd: bd, best = dmin, (x, y)
    return best or (sum(xs) / len(xs), sum(ys) / len(ys))
for f in d['features']:
    p = f['properties']; g = f['geometry']
    if not g or not p.get('N03_007'): continue  # 所属未定地は除く
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    lx, ly = label(polys)
    enc = []
    for poly in polys:
        for ring in poly:
            q = [(round(x * Q), round(y * Q)) for x, y in ring]
            flat = [q[0][0], q[0][1]]
            for k in range(1, len(q)):
                dx, dy = q[k][0] - q[k - 1][0], q[k][1] - q[k - 1][1]
                if dx or dy: flat += [dx, dy]
            if len(flat) >= 6: enc.append(flat)
    name = (p.get('N03_003') or '') + (p.get('N03_004') or '')
    out.append([p['N03_007'], p['N03_001'], name or (p.get('N03_002') or ''), round(lx, 4), round(ly, 4), enc])
json.dump({'src': '国土交通省 国土数値情報（行政区域）2021年 / smartnews-smri/japan-topography（簡素化0.1%）', 'q': Q, 'm': out}, open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
print(len(out))
