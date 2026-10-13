# PLATEAU CityGML から建物の外形・高さ・用途・（LOD2 があれば）屋根面ごとの高さを取り出す
import glob, pickle, xml.etree.ElementTree as ET
G='{http://www.opengis.net/gml}'; B='{http://www.opengis.net/citygml/building/2.0}'
out=[]; n2=0
def pts(pl):
    v=[float(t) for t in pl.text.split()]; return [(v[i],v[i+1],v[i+2]) for i in range(0,len(v),3)]
for f in sorted(glob.glob('plateau/*_bldg_*.gml')):
    for ev,el in ET.iterparse(f):
        if el.tag!=B+'Building': continue
        h=el.find(B+'measuredHeight'); u=el.find(B+'usage')
        h=float(h.text) if h is not None and h.text else -1
        u=int(u.text) if u is not None and u.text and u.text.isdigit() else 0
        ring=None; zmin=None
        s1=el.find(B+'lod1Solid')
        if s1 is not None:
            zs=[p[2] for pl in s1.iter(G+'posList') for p in pts(pl)]; zmin=min(zs)
            if h<=0: h=max(zs)-zmin
        for tag in ('lod0FootPrint','lod0RoofEdge','lod1Solid'):
            g=el.find(B+tag)
            if g is not None:
                pl=next(g.iter(G+'posList'),None)
                if pl is not None: ring=[(a,b) for a,b,_ in pts(pl)]; break
        roofs=[]
        for bb in el.findall(B+'boundedBy'):
            for surf in bb:
                if surf.tag!=B+'RoofSurface': continue
                for poly in surf.iter(G+'Polygon'):
                    ext=poly.find(G+'exterior'); pl=next(ext.iter(G+'posList'),None) if ext is not None else None
                    if pl is None: continue
                    p=pts(pl); roofs.append(([(a,b) for a,b,_ in p], max(c for _,_,c in p)))
        if roofs and zmin is not None:
            n2+=1; roofs=[(r,z-zmin) for r,z in roofs]
        else: roofs=None
        if ring and h>0: out.append((ring,h,u,roofs))
        el.clear()
pickle.dump(out,open('bldg.pkl','wb')); print(len(out),'lod2',n2)
