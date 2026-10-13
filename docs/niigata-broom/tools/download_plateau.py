# PLATEAU 新潟市 2023年度 CityGML（約4.3GB の zip）から、中央区を覆う 3 次メッシュの建物 GML だけを HTTP Range で取り出す
import re, os
from hf import open_zip
os.makedirs('plateau', exist_ok=True)
z = open_zip()
for i in z.infolist():
    m = re.match(r'udx/bldg/(\d{8})_bldg_\d+_op\.gml$', i.filename)
    if not m: continue
    c = m.group(1); r = int(c[6])
    if (c[:6] == '563960' and r >= 3) or (c[:6] == '563970' and r <= 4) or (c[:6] == '563961' and r >= 3 and int(c[7]) <= 0):
        p = 'plateau/' + os.path.basename(i.filename)
        if not os.path.exists(p): open(p, 'wb').write(z.read(i.filename)); print('got', p)
