import math, os, urllib.request, sys, concurrent.futures as cf
def tile(lat,lon,z):
    n=2**z; x=(lon+180)/360*n; y=(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n
    return x,y
def get(kind,z,x,y):
    p=f'dem/{kind}_{z}_{x}_{y}.txt'
    if os.path.exists(p): return p
    try:
        d=urllib.request.urlopen(f'https://cyberjapandata.gsi.go.jp/xyz/{kind}/{z}/{x}/{y}.txt',timeout=60).read()
    except urllib.error.HTTPError as e:
        d=b'' if e.code==404 else None
        if d is None: raise
    open(p,'wb').write(d); return p
def jobs(kind,z,s,w,n,e):
    x0,y0=tile(n,w,z); x1,y1=tile(s,e,z)
    return [(kind,z,x,y) for x in range(int(x0),int(x1)+1) for y in range(int(y0),int(y1)+1)]
J=jobs('dem5a',15,37.855,138.985,37.975,139.125)+jobs('dem5b',15,37.855,138.985,37.975,139.125)+jobs('dem',14,37.855,138.985,37.975,139.125)+jobs('dem',11,37.45,138.05,38.45,139.75)
print(len(J))
with cf.ThreadPoolExecutor(8) as ex: list(ex.map(lambda j:get(*j),J))
print('ok')
