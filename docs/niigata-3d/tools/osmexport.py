import pickle, json, math
nodes,ways,rels=pickle.load(open('osm.pkl','rb'))
LAT0,LON0=37.9125,139.0615; KY=111132.0; KX=111320.0*math.cos(math.radians(LAT0))
def xy(lat,lon): return [round((lon-LON0)*KX,1), round(-(lat-LAT0)*KY,1)]
def pts(nd): return [xy(*nodes[n]) for n in nd if n in nodes]
W={'motorway':20,'trunk':18,'primary':16,'secondary':13,'tertiary':10,'unclassified':6,'residential':5,'living_street':4,'service':3.5,'pedestrian':6,'footway':2,'cycleway':2.5,'steps':2,'path':1.5,'trunk_link':8,'primary_link':8,'secondary_link':7,'tertiary_link':6}
roads=[];rails=[];water=[];green=[];bridges=[]
for wid,(nd,t) in ways.items():
    hw=t.get('highway')
    if hw in W and t.get('area')!='yes':
        p=pts(nd)
        if len(p)>1: roads.append({'w':(7 if (t.get('bus')=='designated' or t.get('taxi')=='designated') else W[hw]),'c':hw,'b':1 if t.get('bridge') else 0,'l':int(t.get('layer','0') or 0) if (t.get('layer','0').lstrip('-').isdigit()) else 0,'n':t.get('name',''),'p':p,'proposed':0})
    elif hw=='proposed' or t.get('proposed'):
        p=pts(nd)
        if len(p)>1 and t.get('name'): roads.append({'w':12,'c':'proposed','b':1 if t.get('bridge') else 0,'l':1,'n':t.get('name',''),'p':p,'proposed':1})
    rw=t.get('railway')
    if rw in ('rail','light_rail','subway'):
        p=pts(nd)
        if len(p)>1: rails.append({'b':1 if t.get('bridge') else 0,'l':t.get('layer','0'),'n':t.get('name',''),'u':t.get('usage',''),'hs':t.get('highspeed',''),'p':p})
    if rw=='platform' or t.get('public_transport')=='platform' and t.get('train')=='yes':
        p=pts(nd)
        if len(p)>2: bridges.append({'k':'platform','ref':t.get('ref',''),'n':t.get('name',''),'l':t.get('layer',''),'p':p})
    if (t.get('natural')=='water' or t.get('waterway')=='riverbank' or t.get('landuse') in('reservoir','basin')) and nd[0]==nd[-1]:
        p=pts(nd)
        if len(p)>3: water.append(p)
    if (t.get('leisure') in ('park','garden','pitch','playground') or t.get('landuse') in ('grass','forest','recreation_ground','cemetery') or t.get('natural') in ('wood','grassland','scrub')) and nd[0]==nd[-1]:
        p=pts(nd)
        if len(p)>3: green.append({'k':t.get('leisure') or t.get('landuse') or t.get('natural'),'n':t.get('name',''),'p':p})
# multipolygon water (outer rings only, joined)
def join(wl):
    segs=[list(ways[w][0]) for w in wl if w in ways]
    rings=[]
    while segs:
        cur=segs.pop(0)
        changed=True
        while cur[0]!=cur[-1] and changed:
            changed=False
            for s in segs:
                if s[0]==cur[-1]: cur+=s[1:]
                elif s[-1]==cur[-1]: cur+=s[::-1][1:]
                elif s[-1]==cur[0]: cur=s[:-1]+cur
                elif s[0]==cur[0]: cur=s[::-1][:-1]+cur
                else: continue
                segs.remove(s); changed=True; break
        rings.append(cur)
    return rings
waterholes=[]
for rid,(m,t) in rels.items():
    if t.get('type')!='multipolygon': continue
    if t.get('natural')=='water' or t.get('leisure') in('park',) or t.get('landuse') in ('grass','forest') or t.get('natural') in('wood',):
        outs=join([r for ty,r,ro in m if ty=='way' and ro=='outer'])
        ins=join([r for ty,r,ro in m if ty=='way' and ro=='inner'])
        for r in outs:
            p=pts(r)
            if len(p)>3:
                if t.get('natural')=='water': water.append(p)
                else: green.append({'k':t.get('leisure') or t.get('landuse') or t.get('natural'),'n':t.get('name',''),'p':p})
        if t.get('natural')=='water':
            for r in ins:
                p=pts(r)
                if len(p)>3: waterholes.append(p)
json.dump({'roads':roads,'rails':rails,'platforms':bridges,'water':water,'waterholes':waterholes,'green':green},open('osm.json','w'),ensure_ascii=False,separators=(',',':'))
import os; print(os.path.getsize('osm.json')/1e6, len(roads),len(rails),len(water),len(waterholes),len(green))
d=json.load(open('osm.json'))
d['bridgeAreas']=[]; d['extra']=[]
for wid,(nd,t) in ways.items():
    if t.get('man_made')=='bridge' and nd[0]==nd[-1]:
        d['bridgeAreas'].append({'n':t.get('name',''),'p':pts(nd)})
    if 'アイコニック' in t.get('name',''):
        d['extra'].append({'n':t['name'],'p':pts(nd)})
json.dump(d,open('osm.json','w'),ensure_ascii=False,separators=(',',':'))
print([b['n'] for b in d['bridgeAreas']], d['extra'])
