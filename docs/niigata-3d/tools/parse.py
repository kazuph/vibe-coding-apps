import glob, xml.etree.ElementTree as ET, pickle
nodes={}; ways={}; rels={}
for f in glob.glob('/tmp/claude-0/osm/*.osm'):
    for ev,el in ET.iterparse(f):
        if el.tag=='node':
            nodes[int(el.get('id'))]=(float(el.get('lat')),float(el.get('lon')))
        elif el.tag=='way':
            ways[int(el.get('id'))]=( [int(n.get('ref')) for n in el.findall('nd')], {t.get('k'):t.get('v') for t in el.findall('tag')})
            el.clear()
        elif el.tag=='relation':
            rels[int(el.get('id'))]=( [(m.get('type'),int(m.get('ref')),m.get('role')) for m in el.findall('member')], {t.get('k'):t.get('v') for t in el.findall('tag')})
            el.clear()
pickle.dump((nodes,ways,rels),open('/tmp/claude-0/work/osm.pkl','wb'))
print(len(nodes),len(ways),len(rels))
