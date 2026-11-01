import { World, ll, U } from './voxel-world.js';
let promise;
const SCALE=.18;
const airportLat=37+57/60+21/3600,airportLon=139+6/60+42/3600;
const [airportX,airportZ]=ll(airportLat,airportLon);
export function loadRealWorld(anchor,onProgress){
 if(!promise)promise=(async()=>{
  const grid=await World.loadFiles();grid.noTrees=new Uint8Array(grid.W*grid.H);
  // Clear only the custom airfield's runway corridor in the voxel building layer.
  const angle=-92.69*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  for(let iz=0;iz<grid.H;iz++)for(let ix=0;ix<grid.W;ix++){
   const x=(grid.X0+(ix+.5)*grid.B-airportX)*SCALE+anchor.x,z=(grid.Z0+(iz+.5)*grid.B-airportZ)*SCALE+anchor.z;
   const localX=c*x-s*z,localZ=s*x+c*z;
   const i=iz*grid.W+ix;if(localX>-45&&localX<135&&localZ>-445&&localZ<35)grid.noTrees[i]=1;
   const crossAngle=60.78*Math.PI/180,cx=localX*Math.cos(crossAngle)-(localZ+201)*Math.sin(crossAngle),cz=localX*Math.sin(crossAngle)+(localZ+201)*Math.cos(crossAngle);
   if((Math.abs(localX)<6 && localZ>-430 && localZ<30)||(Math.abs(cx)<6 && Math.abs(cz)<122)||(localX>18&&localX<90&&localZ>-170&&localZ<6)||(localX>0&&localX<22&&localZ>-8&&localZ<6)){grid.bh[i]=0;grid.L[i]=1;grid.mat[i]=12}
  }
  const world=new World();await world.build(grid,onProgress);world.group.scale.setScalar(SCALE);world.group.position.set(anchor.x-airportX*SCALE,-1.14,anchor.z-airportZ*SCALE);
  return {world,map:world.mapImage(),offsetX:world.group.position.x,offsetZ:world.group.position.z};
 })().catch(e=>{promise=null;throw e});
 return promise;
}
export function worldTick(t){U.uTime.value=t}
