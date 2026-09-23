import glob, math, struct, json, numpy as np, mapbox_earcut as ec
import xml.etree.ElementTree as ET
NS={'gml':'http://www.opengis.net/gml','bldg':'http://www.opengis.net/citygml/building/2.0','core':'http://www.opengis.net/citygml/2.0','uro':'https://www.geospatial.jp/iur/uro/3.0'}
LAT0,LON0=37.9125,139.0615
KY=111132.0; KX=111320.0*math.cos(math.radians(LAT0))
def xy(lat,lon): return ((lon-LON0)*KX, -(lat-LAT0)*KY)  # x east, z south
G='{http://www.opengis.net/gml}'; B='{http://www.opengis.net/citygml/building/2.0}'
def plist(el):
    v=[float(t) for t in el.text.split()]
    return [(v[i],v[i+1],v[i+2]) for i in range(0,len(v),3)]
lod1=[]; lod2tris=[]; meta=[]
def tri3d(ring):
    # ring: list of (x,y,z) closed; project onto best plane
    P=np.array(ring[:-1] if ring[0]==ring[-1] else ring)
    if len(P)<3: return []
    n=np.zeros(3)
    for i in range(len(P)):
        a=P[i]; b=P[(i+1)%len(P)]
        n+=np.array([(a[1]-b[1])*(a[2]+b[2]),(a[2]-b[2])*(a[0]+b[0]),(a[0]-b[0])*(a[1]+b[1])])
    ax=np.argmax(np.abs(n)); keep=[i for i in range(3) if i!=ax]
    Q=P[:,keep].astype(np.float64)
    try: idx=ec.triangulate_float64(Q,np.array([len(Q)],dtype=np.uint32))
    except Exception: return []
    return [tuple(P[i]) for i in idx]
cnt=0
for f in sorted(glob.glob('/tmp/claude-0/plateau/*_bldg_*.gml')):
    for ev,el in ET.iterparse(f):
        if el.tag!=B+'Building': continue
        cnt+=1
        h=el.find(B+'measuredHeight'); h=float(h.text) if h is not None else None
        fp=el.find(B+'lod0FootPrint')
        if fp is None: fp=el.find(B+'lod0RoofEdge')
        s1=el.find(B+'lod1Solid')
        zmin=None; ring=None
        if s1 is not None:
            zs=[]
            for pl in s1.iter(G+'posList'):
                pts=plist(pl); zs+= [p[2] for p in pts]
            zmin=min(zs); zmax=max(zs)
            if h is None or h<=0: h=zmax-zmin
        if fp is not None:
            pl=next(fp.iter(G+'posList')); ring=[xy(p[0],p[1]) for p in plist(pl)]
        elif s1 is not None:
            pl=next(s1.iter(G+'posList')); ring=[xy(p[0],p[1]) for p in plist(pl)]
        if ring is None or h is None: el.clear(); continue
        if zmin is None: zmin=0
        # lod2
        tris=[]
        for tag in ('lod2MultiSurface','lod2Solid'):
            pass
        has2=False
        for bs in el.findall(B+'boundedBy'):
            for surf in bs:
                kind=surf.tag.split('}')[1]
                k={'RoofSurface':1,'WallSurface':0,'GroundSurface':2}.get(kind,0)
                if k==2: continue
                for poly in surf.iter(G+'Polygon'):
                    ext=poly.find(G+'exterior')
                    if ext is None: continue
                    pl=next(ext.iter(G+'posList'))
                    pts=[(*xy(p[0],p[1]),p[2]-zmin) for p in plist(pl)]
                    # holes ignored (rare)
                    t=tri3d(pts)
                    if t: has2=True; tris.append((k,t))
        meta.append((ring,h,zmin,has2))
        if has2: lod2tris.append((len(meta)-1,tris))
        el.clear()
print('buildings',cnt,len(meta),'lod2',len(lod2tris))
import pickle; pickle.dump((meta,lod2tris),open('/tmp/claude-0/work/plateau.pkl','wb'))
