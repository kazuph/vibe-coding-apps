require(process.env.ASTRO_SOURCE || '../../docs/hoshizora/astro.js');
const ref = require('./reference.json');
const A = globalThis.Astro;
const rad = Math.PI / 180;
const vector = (alt, az) => [Math.cos(alt*rad)*Math.sin(az*rad), Math.cos(alt*rad)*Math.cos(az*rad), Math.sin(alt*rad)];
const separation = (a,b) => 2*Math.asin(Math.min(1,Math.hypot(...a.map((v,i)=>v-b[i]))/2))/rad*60;
const max = {}, cache = new Map();
for (const [date,place,key,alt,az,refracted] of ref.rows) {
  const id = `${date}/${place}`;
  if (!cache.has(id)) {
    const [,lat,lon] = ref.locations.find(l=>l[0]===place);
    const modes={};
    for(const [kind,refracted] of [['geometric',false],['refracted',true]]){
      const sky=A.skyAt(new Date(date),lat,lon,refracted);
      modes[kind]=Object.fromEntries([...sky.stars.map(x=>[x.s.id,x.v]),...sky.bodies.map(x=>[x.key,x.v])]);
    }
    cache.set(id,modes);
  }
  const group = A.stars.some(s=>s.id===key) ? 'stars' : key;
  for (const [kind,h] of [['geometric',alt],['refracted',refracted]]) {
    if(kind==='refracted' && alt < -1) continue;
    const v=cache.get(id)[kind][key];
    const err = separation(v,vector(h,az));
    for (const category of [kind, ...(date.startsWith('2026') ? [`${kind}2026`] : [])]) {
      const name=`${category}/${group}`;
      if (!max[name] || max[name].arcmin < err) max[name] = {arcmin:err,date,place,key,alt,az,app:A.altAz(v)};
    }
  }
}
for (const [years,id,ra,dec] of ref.precession) {
  const star=A.stars.find(s=>s.id===id), actual=A.precess(star.ra,star.dec,years);
  const err=separation(vector(actual[1],actual[0]),vector(dec,ra));
  const name=`precession/${years}`;
  if (!max[name] || max[name].arcmin<err) max[name]={arcmin:err,key:id};
}
if (require.main === module) console.log(JSON.stringify({comparisons:ref.rows.length,max},null,2));
module.exports={max,separation,vector,ref};
