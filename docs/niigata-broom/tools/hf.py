import zipfile, urllib.request, io, re
URL="https://assets.cms.plateau.reearth.io/assets/b0/abb9a1-3696-4802-bfad-edd83fe99e93/15100_niigata-shi_city_2023_citygml_2_op.zip"
class HF(io.RawIOBase):
    def __init__(s,url):
        s.url=url; r=urllib.request.urlopen(urllib.request.Request(url,method='HEAD')); s.size=int(r.headers['Content-Length']); s.pos=0
    def seekable(s): return True
    def readable(s): return True
    def seek(s,o,w=0):
        s.pos = o if w==0 else (s.pos+o if w==1 else s.size+o); return s.pos
    def tell(s): return s.pos
    def readinto(s,b):
        n=len(b)
        if s.pos>=s.size: return 0
        end=min(s.pos+n,s.size)-1
        d=urllib.request.urlopen(urllib.request.Request(s.url,headers={'Range':f'bytes={s.pos}-{end}'})).read()
        b[:len(d)]=d; s.pos+=len(d); return len(d)
def open_zip(): return zipfile.ZipFile(io.BufferedReader(HF(URL),buffer_size=1<<22))
