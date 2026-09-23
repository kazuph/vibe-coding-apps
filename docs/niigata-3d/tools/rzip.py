import zipfile, urllib.request, io, sys, os, re
URL="https://assets.cms.plateau.reearth.io/assets/b0/abb9a1-3696-4802-bfad-edd83fe99e93/15100_niigata-shi_city_2023_citygml_2_op.zip"
class HF(io.RawIOBase):
    def __init__(s,url):
        s.url=url; r=urllib.request.urlopen(urllib.request.Request(url,method='HEAD')); s.size=int(r.headers['Content-Length']); s.pos=0
    def seekable(s): return True
    def readable(s): return True
    def seek(s,o,w=0):
        s.pos = o if w==0 else (s.pos+o if w==1 else s.size+o); return s.pos
    def tell(s): return s.pos
    def read(s,n=-1):
        if n<0: n=s.size-s.pos
        if n==0 or s.pos>=s.size: return b''
        end=min(s.pos+n,s.size)-1
        r=urllib.request.urlopen(urllib.request.Request(s.url,headers={'Range':f'bytes={s.pos}-{end}'}))
        d=r.read(); s.pos+=len(d); return d
    def readinto(s,b):
        d=s.read(len(b)); b[:len(d)]=d; return len(d)
f=io.BufferedReader(HF(URL),buffer_size=1<<20)
z=zipfile.ZipFile(f)
names=z.namelist()
open('/tmp/claude-0/work/zipnames.txt','w').write('\n'.join(names))
print(len(names))
pat=re.compile(sys.argv[1]) if len(sys.argv)>1 else None
if pat:
    os.makedirs('/tmp/claude-0/plateau',exist_ok=True)
    for n in names:
        if pat.search(n):
            print('extract',n,z.getinfo(n).file_size)
            with open('/tmp/claude-0/plateau/'+os.path.basename(n),'wb') as o: o.write(z.read(n))
