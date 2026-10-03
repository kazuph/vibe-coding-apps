const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {max,separation,vector,ref}=require('./compare.cjs');
require('../../docs/hoshizora/vendor/compass.js');
const A=globalThis.Astro;
const near=(a,b,t=1e-9)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const nearVector=(a,b)=>a.forEach((v,i)=>near(v,b[i]));

test('JPL DE421: 33,048 independent sky directions; original 2026 PR accuracy budgets',()=>{
  assert.equal(ref.rows.length,33048);
  // PR47 advertised 1.2 arcmin stars, 4.8 Moon, 1.5 planets (no refraction).
  for(const kind of ['geometric2026','refracted2026'])for(const body of ['stars','sun','moon','mercury','venus','mars','jupiter','saturn']){
    const bound=body==='stars'?1.2:body==='moon'?4.8:1.5;
    assert.ok(max[`${kind}/${body}`].arcmin<bound,JSON.stringify(max[`${kind}/${body}`]));
  }
  // Expanded 2000–2050 sample: record low-precision ephemeris's limits, not a new accuracy promise.
  assert.ok(max['geometric/stars'].arcmin<1.2);
  assert.ok(max['refracted/moon'].arcmin<4.8);
  assert.ok(max['geometric/jupiter'].arcmin<3);
});

test('IAU 1976 precession agrees with 730 ERFA vectors, including Polaris and ±100 years',()=>{
  for(const years of [-100,0,26.75,50,100]) assert.ok(max[`precession/${years}`].arcmin<1e-7);
  for(const dec of [-90,90])for(const years of [-100,26.75,100])assert.ok(A.precess(0,dec,years).every(Number.isFinite));
});

test('UTC/JST represent the same instant; Julian day, east longitude and sidereal wrap',()=>{
  near(A.jd(new Date('2000-01-01T12:00:00Z')),2451545);
  near(A.jd(new Date('2026-10-03T21:00:00+09:00')),A.jd(new Date('2026-10-03T12:00:00Z')));
  near(A.lstDeg(2451545,0),280.46061837);
  near(A.rev(A.lstDeg(2451545,139)-A.lstDeg(2451545,0)),139);
  near(A.lstDeg(2451545,180),A.lstDeg(2451545,-180));
  near(A.jd(new Date('2024-03-01T00:00:00Z'))-A.jd(new Date('2024-02-29T00:00:00Z')),1);
  for(const lat of [-90,-33.86,0,37.916,90])for(const ra of [0,90,180,359.999])near(Math.hypot(...A.enu(ra,23,355,lat)),1);
  nearVector(A.enu(90,0,0,0),[1,0,0]); // rising east
  nearVector(A.enu(270,0,0,0),[-1,0,0]); // setting west
  nearVector(A.enu(0,0,0,0),[0,0,1]); // equatorial transit
});

test('refraction raises near-horizon objects, preserves azimuth/unit vectors and stays continuous',()=>{
  near(A.altAz(A.refract(vector(0,90))).alt,0.483032123074,1e-9);
  for(const alt of [-90,-1.000001,-1,-0.999999,0,1,45,89.9,90]){
    const v=A.refract(vector(alt,127));
    near(Math.hypot(...v),1);
    assert.ok(v.every(Number.isFinite));
    if(Math.abs(alt)<90)near(A.altAz(v).az,127);
  }
  assert.ok(separation(A.refract(vector(-1.000001,0)),A.refract(vector(-0.999999,0)))<0.001);
});

test('Moon topocentric correction is necessary and remains bounded by its parallax',()=>{
  const d=new Date('2026-06-21T12:00:00Z'),s=A.skyAt(d,-90,0,false);
  const b=s.bodies.find(b=>b.key==='moon');
  const geo=A.enu(b.ra,b.dec,s.lst,-90);
  const delta=separation(geo,b.v)/60;
  assert.ok(delta>0.8 && delta<1.1,`parallax ${delta}`);
});

test('device orientation follows independent cardinal poses in portrait and both landscapes',()=>{
  for(const [a,b,g,screen,r,u,f] of [
    [0,90,0,0,[1,0,0],[0,0,1],[0,1,0]],
    [270,90,0,0,[0,-1,0],[0,0,1],[1,0,0]],
    [0,0,-90,90,[0,-1,0],[0,0,1],[1,0,0]],
    [0,0,90,270,[0,1,0],[0,0,1],[-1,0,0]],
    [0,0,0,0,[1,0,0],[0,1,0],[0,0,-1]]]){
    const v=A.deviceView(a,b,g,screen);nearVector(v.r,r);nearVector(v.u,u);nearVector(v.f,f);
  }
  for(const a of [0,37,180,359])for(const b of [-175,-45,0,89,120])for(const g of [-89,0,89])for(const s of [0,90,180,270]){
    const {r,u,f}=A.deviceView(a,b,g,s);
    for(const v of [r,u,f])near(Math.hypot(...v),1);
    near(r.reduce((n,x,i)=>n+x*u[i],0),0);
    nearVector([r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]],u);
  }
});

test('iOS calibration only uses the horizontal top edge, never guesses from the camera',()=>{
  near(A.iosAlphaOffset(37,0,0,10),313);
  for(const [b,g] of [[90,0],[120,0],[0,90],[-90,0],[NaN,0]])assert.equal(A.iosAlphaOffset(37,b,g,10),null);
  assert.equal(A.iosAlphaOffset(null,0,0,10),null);
});

test('bundled WMM2025 matches all 12 NOAA official vectors to their published rounding',()=>{
  const rows=fs.readFileSync(require.resolve('./WMM2025_TEST_VALUES.txt'),'utf8').split('\n').filter(l=>l.trim()&&!l.startsWith('#'));
  assert.equal(rows.length,12);
  for(const row of rows){
    const [year,km,lat,lon,x,y,z,h,f,incl,decl]=row.trim().split(/\s+/).map(Number);
    const y0=Math.floor(year),start=Date.UTC(y0,0,1),end=Date.UTC(y0+1,0,1);
    const got=Compass.field(new Date(start+(year-y0)*(end-start)),lat,lon,km);
    for(const key of ['x','y','z','h','f'])near(got[key],{x,y,z,h,f}[key],0.051);
    near(got.incl,incl,0.0051);near(got.decl,decl,0.0051);
  }
  assert.equal(Compass.declination(new Date('2030-01-01'),37,139),null);
  assert.equal(Compass.declination(new Date('2024-12-31'),37,139),null);
  assert.ok(Number.isFinite(Compass.declination(new Date('2029-12-31'),37,139)));
  assert.equal(Compass.declination(new Date('invalid'),37,139),null);
});

test('time selector uses device-local 21:00 through UTC/JST/date and DST boundaries',()=>{
  const html=fs.readFileSync(require.resolve('../../docs/hoshizora/index.html'),'utf8');
  const nowDate=html.match(/function nowDate\(\)\{[^\n]+/)[0];
  for(const [tz,instant,want] of [
    ['Asia/Tokyo','2026-10-03T15:00:00Z','2026-10-04T12:00:00.000Z'],
    ['UTC','2026-10-03T15:00:00Z','2026-10-03T21:00:00.000Z'],
    ['America/New_York','2026-03-08T06:59:59Z','2026-03-09T01:00:00.000Z'],
    ['America/New_York','2026-11-01T05:59:59Z','2026-11-02T02:00:00.000Z']]){
    const script=`const Native=Date;global.Date=class extends Native{constructor(...args){super(...(args.length?args:['${instant}']))}};let timeMode='tonight';${nowDate};console.log(nowDate().toISOString());`;
    const got=execFileSync(process.execPath,['-e',script],{env:{...process.env,TZ:tz},encoding:'utf8'}).trim();
    assert.equal(got,want);
  }
});
