import pickle, struct, json, math, numpy as np
meta,l2=pickle.load(open('plateau.pkl','rb'))
Q=4.0
def q(v): return int(round(v*Q))
out=bytearray()
lod1=[(i,m) for i,m in enumerate(meta) if not m[3]]
out+=struct.pack('<4sII',b'NG3D',len(lod1),len(l2))
for i,(ring,h,zb,_) in lod1:
    r=ring[:-1] if ring[0]==ring[-1] else ring
    out+=struct.pack('<IHH',i,len(r),min(65535,int(h*10)))
    for x,z in r: out+=struct.pack('<hh',q(x),q(z))
for i,tris in l2:
    vmap={}; verts=[]; idx=[]
    for k,t in tris:
        for p in t:
            key=(q(p[0]),q(p[2]),q(p[1]),k)  # x, y(up), z
            if key not in vmap: vmap[key]=len(verts); verts.append(key)
            idx.append(vmap[key])
    if len(verts)>65535: print('skip big',i); continue
    out+=struct.pack('<IHI',i,len(verts),len(idx))
    for x,y,z,k in verts: out+=struct.pack('<hhhB',x,y,z,k)
    if len(verts)%2: pass
    out+=struct.pack(f'<{len(idx)}H',*idx)
open('city.bin','wb').write(out); print(len(out)/1e6,'MB')
