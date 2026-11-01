import * as THREE from 'three';
import {heldKeys} from './input.js';
import {loadRealWorld,worldTick} from './real-world.js';
import './style.css';
import {startAudio,updateEngine,speak,explosion,warning} from './sound.js';
import {nextSpeed} from './ground-motion.js';
import {landingIsSafe} from './landing.js';

const listeners = new AbortController();
const listenerOptions = { signal: listeners.signal };
const savedGame = import.meta.hot?.data.game;
const mapCredit=document.createElement('div');mapCredit.className='map-credit';mapCredit.innerHTML='地図: <a href="https://www.mlit.go.jp/plateau/" target="_blank" rel="noopener">PLATEAU</a>・<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>・<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a>';document.querySelector('#app').append(mapCredit);
const takeoffHint=document.createElement('div');takeoffHint.className='takeoff-hint hidden';takeoffHint.innerHTML='<strong>とべるよ！</strong><span>W または スペースで しゅっぱつ</span>';document.querySelector('#app').append(takeoffHint);
const altitudeTape=document.createElement('div');altitudeTape.className='altitude-tape';altitudeTape.setAttribute('aria-label','高度メーター');altitudeTape.innerHTML='<div class="altitude-title">たかさ m</div><div class="altitude-window"><div class="altitude-ticks"></div><div class="altitude-pointer">▶</div></div>';document.querySelector('#app').append(altitudeTape);const altitudeTicks=altitudeTape.querySelector('.altitude-ticks');
const compass=document.createElement('div');compass.className='compass';compass.setAttribute('aria-label','赤い針が北を指すコンパス');compass.innerHTML='<div class="compass-needle"><span class="needle-north"></span><span class="needle-south"></span></div><div class="compass-center"></div>';document.querySelector('#app').append(compass);const compassNeedle=compass.querySelector('.compass-needle');
const miniMap=document.createElement('canvas');miniMap.className='minimap';miniMap.width=440;miniMap.height=440;miniMap.setAttribute('aria-label','飛行機の向きに合わせて回る地図');document.querySelector('#app').append(miniMap);const mapContext=miniMap.getContext('2d');
const safetyHud=document.createElement('div');safetyHud.className='safety-hud';document.querySelector('#app').append(safetyHud);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9edff3);
scene.fog = new THREE.Fog(0xafe4ee, 3200, 5500);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 6000);
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.querySelector('#scene').append(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xe6f9ff, 0x88b277, 2.1));
const sun = new THREE.DirectionalLight(0xfff0c8, 2.4); sun.position.set(-35, 80, 30); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -65; sun.shadow.camera.right = 65; sun.shadow.camera.top = 65; sun.shadow.camera.bottom = -65; sun.shadow.bias = -.0003; scene.add(sun); scene.add(sun.target);
const mat = color => new THREE.MeshStandardMaterial({color, roughness: 1});
const grass = mat(0x8dca6c), grassLight = mat(0xa0d77c), dirt = mat(0xb58354), road = mat(0x667c7d), white = mat(0xf9f3d9), yellow = mat(0xfad476), green = mat(0x66ae62), green2 = mat(0x79bf6b), trunk = mat(0x99704c), cloudMat = mat(0xffffff);
const unitBox=new THREE.BoxGeometry(1,1,1);
function box(w,h,d, material,x,y,z,parent=scene, shadow=true){const m=new THREE.Mesh(unitBox,material);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=shadow;m.receiveShadow=true;parent.add(m);return m}
const obstacles=[];
function obstacle(x,z,w,d,height=8){obstacles.push({x,z,w,d,height})}
// Airport local -Z follows runway 10's approximately 092.7° true bearing.
const airportAngle=-THREE.MathUtils.degToRad(92.69), airportCos=Math.cos(airportAngle), airportSin=Math.sin(airportAngle);
function airportToWorld(x,z){return {x:airportCos*x+airportSin*z,z:-airportSin*x+airportCos*z}};
function worldToAirport(x,z){return {x:airportCos*x-airportSin*z,z:airportSin*x+airportCos*z}};
const airport=new THREE.Group();airport.rotation.y=airportAngle;scene.add(airport);

function airportObstacle(x,z,w,d,height=8,minHeight=0){obstacles.push({x,z,w,d,height,minHeight,airportLocal:true})}
let realMap=null,sceneIsDisposed=false;
const startButton=document.querySelector('#start');startButton.disabled=true;startButton.textContent='ちずを よみこみ中…';
loadRealWorld(airportToWorld(0,-201)).then(map=>{if(sceneIsDisposed)return;realMap=map;scene.add(map.world.group);startButton.disabled=false;startButton.innerHTML='しゅっぱつ！ <span>➜</span>';if(import.meta.env.DEV)window.__todoWorld=map}).catch(error=>{console.error('新潟地図の読み込みに失敗しました',error);startButton.textContent='ちずを よみこめません'});

// The runway runs towards local negative Z.
box(8.1,.12,450,road,0,.44,-201,airport,false);
for(let z=18;z>-423;z-=13) box(.18,.14,7,white,0,.52,z,airport,false);
for(let x of [-3.7,3.7]) box(.22,.14,450,white,x,.52,-201,airport,false);
for(let x=-3;x<=3;x+=1.5) box(.28,.15,5,white,x,.53,14,airport,false);
for(let z=14;z>-425;z-=15) for(let x of [-5.2,5.2]) {const a=THREE.MathUtils.degToRad(60.78),cx=x*Math.cos(a)-(z+201)*Math.sin(a),cz=x*Math.sin(a)+(z+201)*Math.cos(a);if((Math.abs(cx)<6 && Math.abs(cz)<125)||(x>0&&Math.abs(z+1)<8))continue;box(.6,.45,.6,white,x,.45,z,airport);box(.35,.28,.35,yellow,x,.8,z,airport);airportObstacle(x,z,.6,.6,1)}
// A second intersecting runway, inspired by Niigata's two-runway layout.
const crossRunway=new THREE.Group();crossRunway.position.set(0,0,-201);crossRunway.rotation.y=THREE.MathUtils.degToRad(60.78);airport.add(crossRunway);
// Stop the crossing pavement at the main runway edge so neither runway stacks on the other.
const crossingGap=4.05/Math.sin(THREE.MathUtils.degToRad(60.78))+.4;
const crossingLength=120-crossingGap;
for(const side of [-1,1]){
 const angle=THREE.MathUtils.degToRad(60.78), edge=x=>(side*4.05-Math.cos(angle)*x)/Math.sin(angle);
 const polygon=new THREE.Shape(), points=side>0?[[-4.05,edge(-4.05)],[4.05,edge(4.05)],[4.05,120],[-4.05,120]]:[[-4.05,-120],[4.05,-120],[4.05,edge(4.05)],[-4.05,edge(-4.05)]];
 points.forEach(([x,z],i)=>i?polygon.lineTo(x,-z):polygon.moveTo(x,-z));polygon.closePath();
 const pavementPart=new THREE.Mesh(new THREE.ShapeGeometry(polygon),road);pavementPart.rotation.x=-Math.PI/2;pavementPart.position.y=.501;pavementPart.receiveShadow=true;crossRunway.add(pavementPart);
 for(const x of [-3.7,3.7]){const end=edge(x),length=120-Math.abs(end),center=side*(120+Math.abs(end))/2;box(.22,.14,length,white,x,.52,center,crossRunway,false)}
}
for(let z=-108;z<=108;z+=13)if(Math.abs(z)>crossingGap+4)box(.18,.14,7,white,0,.52,z,crossRunway,false);
// Deterministic random numbers for effects and scenery details.
let seed=72;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
const sea=mat(0x69bbd1),coast=mat(0xd9d0a9);
// Airport apron, taxiway, terminal and control tower.
const pavement=mat(0x9daeb0), terminalWall=mat(0xf3ead5), terminalGlass=mat(0x78bdd2), roof=mat(0x688ea3), towerWall=mat(0xe8e1c9), cityRoad=mat(0x899b9b);
box(88,.13,165,pavement,65,.44,-84,airport,false);
box(7,.15,180,road,22,.44,-90,airport,false);
box(22,.14,12,pavement,11,.45,-1,airport,false);
box(43,.14,12,pavement,43,.45,-1,airport,false);
for(let z=-175;z<0;z+=12)box(.3,.12,6,yellow,22,.55,z,airport,false);
box(18,9,82,terminalWall,100,4.8,-87,airport); airportObstacle(100,-87,18,82,11);
box(18.8,1,83,roof,100,9.8,-87,airport);
box(.25,5,72,terminalGlass,90.9,5,-87,airport);
for(let z=-121;z<=-53;z+=8)box(.5,5.2,.55,terminalWall,90.7,5,z,airport);
for(let z of [-116,-88,-60]) {box(14,1.7,3.5,terminalWall,83,4,z,airport);box(2,4,4,terminalGlass,76,2.5,z,airport);airportObstacle(83,z,14,3.5,4.85,3.15);airportObstacle(76,z,2,4,4.5)}
// The player's boarding bridge is deliberately not a collision obstacle.
box(19,1.7,3.5,terminalWall,81.5,4,-40,airport);box(2,4,4,terminalGlass,72,2.5,-40,airport);
box(18,9,12,terminalWall,100,4.8,-40,airport);airportObstacle(100,-40,18,12,11);
box(5,24,5,towerWall,118,12.3,-27,airport); airportObstacle(118,-27,10,10,34);
box(9,5,9,terminalGlass,118,26.5,-27,airport);
box(10,1,10,roof,118,29.5,-27,airport);
box(.6,4,.6,roof,118,32,-27,airport);
// Buildings come from PLATEAU rather than invented blocks.
const street=mat(0x95a49f);
// Bias layered surfaces toward the camera to avoid distant depth-buffer flicker.
for(const [surface,bias] of [[sea,-1],[coast,-4],[pavement,-2],[road,-3],[street,-3],[white,-5],[yellow,-5]]){surface.polygonOffset=true;surface.polygonOffsetFactor=bias;surface.polygonOffsetUnits=bias}
// Combine static boxes by material and spatial cell to reduce draw calls while retaining culling.
function instanceStaticScenery(){
  const groups=new Map();
  for(const mesh of [...scene.children]){
    if(!mesh.isMesh || mesh.geometry!==unitBox)continue;
    const cellX=Math.floor(mesh.position.x/300),cellZ=Math.floor(mesh.position.z/300);
    const key=`${mesh.material.uuid}:${mesh.castShadow}:${cellX}:${cellZ}`;
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
  }
  for(const meshes of groups.values()){
    if(meshes.length<2)continue;
    const instanced=new THREE.InstancedMesh(unitBox,meshes[0].material,meshes.length);
    instanced.castShadow=meshes[0].castShadow;instanced.receiveShadow=true;
    meshes.forEach((mesh,i)=>{mesh.updateMatrix();instanced.setMatrixAt(i,mesh.matrix);scene.remove(mesh)});
    instanced.instanceMatrix.needsUpdate=true;instanced.computeBoundingSphere();scene.add(instanced);
  }
}
instanceStaticScenery();
// A white passenger jet with swept, centrally mounted wings and a red tail.
const plane = new THREE.Group();plane.rotation.order='YXZ';plane.scale.setScalar(.45);scene.add(plane);
const fuselage=mat(0xf8f9f2), red=mat(0xc92335), darkRed=mat(0x9d2332), glass=mat(0x759dac), dark=mat(0x435d62), tire=mat(0x3e5556), engine=mat(0xe3e9e7);
// A rounded, tapered fuselage based on the proportions of a passenger jet.
const profile=[new THREE.Vector2(0,-6.01),new THREE.Vector2(.15,-6),new THREE.Vector2(.7,-5.5),new THREE.Vector2(1.12,-4.5),new THREE.Vector2(1.3,-3),new THREE.Vector2(1.3,5),new THREE.Vector2(1.2,6.2),new THREE.Vector2(.9,7.4),new THREE.Vector2(.5,8.2),new THREE.Vector2(.08,8.55),new THREE.Vector2(0,8.56)];
const hull=new THREE.Mesh(new THREE.LatheGeometry(profile,20),fuselage);hull.rotation.x=-Math.PI/2;hull.position.y=2;hull.castShadow=true;hull.receiveShadow=true;plane.add(hull);
for(const x of [-.48,.48]){const windshield=box(.7,.38,.1,glass,x,2.55,-7.6,plane);windshield.rotation.x=-.38}
for (const x of [-1.31,1.31]) for(let z=-4.6;z<=3.8;z+=.8) box(.08,.27,.36,glass,x,2.2,z,plane);
// The two swept wings meet beneath the middle of the fuselage.
function wing(side){const vertices=new Float32Array([0,1.7,-1.3,side*7.5,1.7,1.5,side*7.5,1.7,2.1,0,1.7,2.1]);const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));geometry.setIndex([0,1,2,0,2,3]);geometry.computeVertexNormals();const material=new THREE.MeshStandardMaterial({color:0xe9efeb,roughness:1,side:THREE.DoubleSide});const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;plane.add(mesh);box(.35,.65,.8,fuselage,side*7.3,2,1.75,plane)}
wing(-1);wing(1);
for (const x of [-3.2,3.2]) {box(1.25,1.05,2.4,engine,x,1.25,.2,plane);box(.9,.75,.12,dark,x,1.25,-1.03,plane)}
box(4.9,.23,1.5,fuselage,0,2.25,3.9,plane);
box(.38,2.7,2.15,fuselage,0,3.45,4.05,plane);
// Red roundel on each side of the otherwise white fin.
for(const side of [-1,1]){const emblem=new THREE.Mesh(new THREE.CircleGeometry(.68,32),new THREE.MeshBasicMaterial({color:0xc92335,side:THREE.DoubleSide}));emblem.rotation.y=Math.PI/2;emblem.position.set(side*.2,3.65,4.05);plane.add(emblem)}
const landingGear=new THREE.Group();plane.add(landingGear);
for (const x of [-1.05,1.05]) {box(.2,.65,.2,dark,x,.7,1.8,landingGear);box(.42,.65,.75,tire,x,.36,1.8,landingGear)}
box(.2,.65,.2,dark,0,.7,-3.8,landingGear);box(.4,.65,.65,tire,0,.36,-3.8,landingGear);
// Parked aircraft at the terminal use the same block-built model as the player's jet.
for(const z of [-115,-87,-59]) {const parked=plane.clone();parked.position.set(60,.3,z);parked.rotation.y=Math.PI/2;airport.add(parked);airportObstacle(60,z,7.2,7.2,3.5);}
const state={started:false,speed:0,height:0,verticalSpeed:0,heading:airportAngle,x:airportToWorld(0,8).x,z:airportToWorld(0,8).z,airborne:false,crashed:false,stalled:false,readyAnnounced:false};if(savedGame) Object.assign(state,savedGame.state);const keys=heldKeys;const intro=document.querySelector('#intro'), message=document.querySelector('#message'), touch=document.querySelector('#touch');let messageTimer, crashTimer;const crashScreen=document.querySelector('#crash');const sparks=[], blastClouds=[],missiles=[];const blastGeometry=new THREE.IcosahedronGeometry(1,1);const sparkMaterials=[mat(0xffcf48),mat(0xff873d),mat(0xef5c3e),mat(0x9b9b90)];
let gearRetracted=state.airborne&&state.speed>250,gearExtension=gearRetracted?0:1;
const fireworks=[],fireworkParticles=[];
const fireworkColors=[0xffe066,0xff6da7,0x72dfff,0x9cff91,0xcc95ff,0xffffff].map(color=>new THREE.MeshBasicMaterial({color}));
function clearFireworks(){for(const p of [...fireworks,...fireworkParticles])scene.remove(p.mesh);fireworks.length=0;fireworkParticles.length=0}
function launchFirework(x,z){const color=fireworkColors[Math.floor(Math.random()*fireworkColors.length)];const mesh=box(.45,.9,.45,color,x,realGroundHeight(x,z)+.8,z,scene,false);fireworks.push({mesh,color,life:1.4,trail:0})}
function burstFirework(f){
// Evenly spaced stars make the round chrysanthemum shape of a Japanese firework.
for(const [count,speed,color] of [[100,19,fireworkColors[0]],[52,12,f.color]])for(let i=0;i<count;i++){
const vertical=1-2*(i+.5)/count,angle=i*Math.PI*(3-Math.sqrt(5)),ring=Math.sqrt(1-vertical*vertical),life=2.7;
const mesh=box(.48,.48,.48,color,f.mesh.position.x,f.mesh.position.y,f.mesh.position.z,scene,false);
fireworkParticles.push({mesh,vx:Math.cos(angle)*ring*speed,vy:vertical*speed,vz:Math.sin(angle)*ring*speed,life,maxLife:life,trail:.05,isStar:true,color})
}}
function showMessage(text,time=3500){message.textContent=text;message.classList.remove('hidden');clearTimeout(messageTimer);messageTimer=setTimeout(()=>message.classList.add('hidden'),time)}
function reset(){Object.assign(state,{started:false,speed:0,height:0,verticalSpeed:0,heading:airportAngle,x:airportToWorld(0,8).x,z:airportToWorld(0,8).z,airborne:false,crashed:false,stalled:false,readyAnnounced:false});keys.clear();clearTimeout(crashTimer);for(const missile of missiles)scene.remove(missile.mesh);missiles.length=0;clearFireworks();plane.visible=true;crashScreen.classList.add('hidden');for(const spark of sparks)scene.remove(spark.mesh);sparks.length=0;for(const cloud of blastClouds){scene.remove(cloud.mesh);cloud.mesh.material.dispose()}blastClouds.length=0;intro.classList.remove('hidden');message.classList.add('hidden');touch.classList.add('hidden');document.querySelector('#status').textContent='じゅんび OK!';}
function startFlight(){startAudio();state.started=true;document.documentElement.requestFullscreen?.().catch(() => {});intro.classList.add('hidden');if(matchMedia('(any-pointer: coarse)').matches)touch.classList.remove('hidden');document.querySelector('#status').textContent='しゅっぱつ！';showMessage(matchMedia('(any-pointer: coarse) and (min-width:600px) and (min-height:600px)').matches?'かそくして 240 km/hを こえたら 十字キーの「▲ とぶ」で しゅっぱつ！':matchMedia('(any-pointer: coarse)').matches?'かそくして 240 km/hを こえたら「とぶ！」で しゅっぱつ！':'Kで かそく！ 240 km/hを こえたら スペースで とびたとう！',6000)}
document.querySelector('#start').addEventListener('click',startFlight,listenerOptions);
document.querySelector('#reset').addEventListener('click',reset,listenerOptions);document.querySelector('#retry').addEventListener('click',()=>{reset();startFlight()},listenerOptions);
function toggleSafety(){const input=document.querySelector('#safe-mode');input.checked=!input.checked;showMessage(input.checked?'あんぜんモード ON！ ぶつかっても だいじょうぶ':'あんぜんモード OFF！ ぶつかると ばくはつするよ',3000)}
addEventListener('keydown',e=>{if((state.started||state.crashed)&&e.code==='KeyR'){e.preventDefault();if(!e.repeat&&!startButton.disabled){reset();startFlight()}return}if(!state.started&&!state.crashed&&!intro.classList.contains('hidden')&&(e.code==='Space'||e.code==='KeyK')){e.preventDefault();keys.delete(e.code);if(!e.repeat&&!startButton.disabled)startFlight();return}if(state.started)startAudio();if(state.started&&e.code==='KeyQ'){e.preventDefault();if(!e.repeat)toggleSafety();return}if(state.started && e.code==='KeyL' && !e.repeat){e.preventDefault();fireMissile();return}if(state.crashed && !crashScreen.classList.contains('hidden') && (e.code==='Space'||e.code==='KeyK')){e.preventDefault();keys.delete(e.code);if(!e.repeat){reset();startFlight()}return}if(['KeyW','KeyA','KeyS','KeyD','KeyJ','KeyK','Space','ShiftLeft','ShiftRight'].includes(e.code)){e.preventDefault();keys.add(e.code)}},listenerOptions);
document.querySelectorAll('[data-key]').forEach(b=>{const key=b.dataset.key;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);if(key==='KeyL'){if(state.started)fireMissile();return}keys.add(key)},listenerOptions);for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>keys.delete(key),listenerOptions)});
const dpad=document.querySelector('#dpad');let dpadPointer=null;const dpadKeys=['KeyW','KeyS','KeyA','KeyD'],dpadHeld=new Set(),physicalHeld=new Set();
addEventListener('keydown',e=>{if(dpadKeys.includes(e.code))physicalHeld.add(e.code)},listenerOptions);
addEventListener('keyup',e=>{physicalHeld.delete(e.code);if(dpadHeld.has(e.code))keys.add(e.code)},listenerOptions);
function clearDpad(){for(const key of dpadHeld)if(!physicalHeld.has(key))keys.delete(key);dpadHeld.clear();dpadPointer=null}
function updateDpad(e){const r=dpad.getBoundingClientRect();const x=(e.clientX-r.left-r.width/2)/(r.width/2),y=(e.clientY-r.top-r.height/2)/(r.height/2);for(const key of dpadHeld)if(!physicalHeld.has(key))keys.delete(key);dpadHeld.clear();for(const [on,key] of [[x< -1/3,'KeyA'],[x>1/3,'KeyD'],[y< -1/3,'KeyW'],[y>1/3,'KeyS']])if(on){dpadHeld.add(key);keys.add(key)}}
dpad.addEventListener('pointerdown',e=>{if(dpadPointer!==null)return;e.preventDefault();dpadPointer=e.pointerId;dpad.setPointerCapture(e.pointerId);updateDpad(e)},listenerOptions);
dpad.addEventListener('pointermove',e=>{if(e.pointerId===dpadPointer)updateDpad(e)},listenerOptions);
for(const event of ['pointerup','pointercancel','lostpointercapture'])dpad.addEventListener(event,e=>{if(e.pointerId===dpadPointer)clearDpad()},listenerOptions);
addEventListener('blur',()=>{physicalHeld.clear();clearDpad()},listenerOptions);
// Sweep the plane's path against expanded building bounds so fast movement cannot skip a collision.
function segmentHitsBuilding(x0,z0,x1,z1,o){if(o.airportLocal){const a=worldToAirport(x0,z0),b=worldToAirport(x1,z1);x0=a.x;z0=a.z;x1=b.x;z1=b.z}let min=0,max=1;for(const [p,d,lo,hi] of [[x0,x1-x0,o.x-o.w/2-.6,o.x+o.w/2+.6],[z0,z1-z0,o.z-o.d/2-.6,o.z+o.d/2+.6]]){if(Math.abs(d)<1e-9){if(p<lo||p>hi)return false;continue}let a=(lo-p)/d,b=(hi-p)/d;if(a>b)[a,b]=[b,a];min=Math.max(min,a);max=Math.min(max,b);if(min>max)return false}return true}
function overlapsObstacleHeight(o,y0,y1,clearance=0){return Math.min(y0,y1)<=o.height&&Math.max(y0,y1)+clearance>=(o.minHeight||0)}
function spawnBlast(bx,by,bz){for(let i=0;i<60;i++){const mesh=box(1+random()*2,1+random()*2,1+random()*2,sparkMaterials[Math.floor(random()*sparkMaterials.length)],bx,by,bz);sparks.push({mesh,vx:(random()-.5)*20,vy:5+random()*18,vz:(random()-.5)*20,life:1+random()})}
// A bright fireball expands first; darker smoke keeps rising as the flames fade.
for(let i=0;i<48;i++){const smoke=i>=25, life=smoke?2.4+random()*1.4:.65+random()*.65;const colors=smoke?[0x4c4b48,0x77736d,0x9b9487]:[0xffe382,0xffb432,0xf77927,0xe95320];const material=new THREE.MeshBasicMaterial({color:colors[Math.floor(random()*colors.length)],transparent:true,opacity:smoke?.8:.95,depthWrite:false});const mesh=new THREE.Mesh(blastGeometry,material);mesh.position.set(bx+(random()-.5)*3,by+random()*2,bz+(random()-.5)*3);const size=smoke?1.4+random()*2:1+random()*1.5;mesh.scale.setScalar(size);scene.add(mesh);blastClouds.push({mesh,life,maxLife:life,size,smoke,vx:(random()-.5)*(smoke?8:18),vy:smoke?5+random()*5:2+random()*9,vz:(random()-.5)*(smoke?8:18)})}}
function drawMap(){
 const c=mapContext, size=miniMap.width, scale=.18;
 c.clearRect(0,0,size,size);c.save();c.beginPath();c.arc(size/2,size/2,size/2-4,0,Math.PI*2);c.clip();
 c.fillStyle='#77bfd1';c.fillRect(0,0,size,size);c.translate(size/2,size/2);c.rotate(state.heading);c.scale(scale,scale);c.translate(-state.x,-state.z);
 if(realMap){const w=realMap.world;c.drawImage(realMap.map,realMap.offsetX+w.X0*.18,realMap.offsetZ+w.Z0*.18,w.W*w.B*.18,w.H*w.B*.18)}
 c.fillStyle='#566c70';c.save();c.rotate(-airportAngle);c.fillRect(-4.05,-426,8.1,450);c.save();c.translate(0,-201);c.rotate(-THREE.MathUtils.degToRad(60.78));c.fillRect(-4.05,-120,8.1,240);c.restore();
 c.strokeStyle='#f5f3df';c.lineWidth=2;c.setLineDash([10,10]);c.beginPath();c.moveTo(0,20);c.lineTo(0,-420);c.stroke();c.restore();c.restore();
 c.save();c.translate(size/2,size/2);c.fillStyle='#ffffff';c.strokeStyle='#314d5e';c.lineWidth=4;c.beginPath();c.moveTo(0,-19);c.lineTo(12,13);c.lineTo(0,8);c.lineTo(-12,13);c.closePath();c.fill();c.stroke();c.restore();
 c.beginPath();c.arc(size/2,size/2,size/2-4,0,Math.PI*2);c.strokeStyle='rgba(255,255,255,.9)';c.lineWidth=6;c.stroke();
}
function realCellAt(x,z){if(!realMap)return -1;return realMap.world.cellAt((x-realMap.offsetX)/.18,(z-realMap.offsetZ)/.18)}
function realGroundHeight(x,z){const i=realCellAt(x,z);if(i<0)return 0;return Math.max(0,realMap.world.L[i]*realMap.world.B*.18-1.44)}
function hitsRealBuilding(x0,z0,y0,x1,z1,y1){if(!realMap)return false;const steps=Math.max(1,Math.ceil(Math.hypot(x1-x0,z1-z0)/.65));for(let n=0;n<=steps;n++){const t=n/steps,x=x0+(x1-x0)*t,z=z0+(z1-z0)*t,y=y0+(y1-y0)*t,i=realCellAt(x,z);if(i>=0&&realMap.world.bh[i]>0){const top=realMap.world.top[i]*realMap.world.B*.18-1.14;if(y<=top)return true}}return false}
function explode(reason){if(state.crashed)return;crashScreen.querySelector('p').textContent=reason||'しょうがいぶつに きをつけて、かっそうろに おりようね。';explosion();speak('crash');state.crashed=true;state.started=false;plane.visible=false;keys.clear();document.querySelector('#status').textContent='ぶつかった！';message.classList.add('hidden');touch.classList.add('hidden');crashTimer=setTimeout(()=>{if(state.crashed)crashScreen.classList.remove('hidden')},2200);spawnBlast(state.x,state.height+2,state.z)}
let lastMissile=0;
function fireMissile(){const now=performance.now();if(now-lastMissile<500)return;lastMissile=now;const pitch=plane.rotation.x,forward=new THREE.Vector3(-Math.sin(state.heading)*Math.cos(pitch),Math.sin(pitch),-Math.cos(state.heading)*Math.cos(pitch));const mesh=new THREE.Group();box(.35,.35,2.5,fuselage,0,0,0,mesh);box(.4,.4,.45,red,0,0,-1.2,mesh);mesh.rotation.y=state.heading;mesh.rotation.x=pitch;mesh.position.set(state.x+forward.x*9,state.height+2+forward.y*9,state.z+forward.z*9);scene.add(mesh);missiles.push({mesh,velocity:forward.multiplyScalar(60+state.speed/3.6*.18),life:12})}
if(import.meta.env.DEV)window.__todoFlight={state,plane,camera,keys,obstacles,segmentHitsBuilding,airportToWorld};
const targetCam=new THREE.Vector3(), look=new THREE.Vector3();let last=performance.now(), animationFrame, lastDangerCheck=0, lastDangerVoice=0;
function animate(now){animationFrame=requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.05);last=now;
if(state.started){
const ascending=keys.has('Space')||keys.has('KeyW');
const descending=keys.has('ShiftLeft')||keys.has('ShiftRight')||keys.has('KeyS');
const braking=keys.has('KeyJ');
// J first brakes, then pushes the aircraft backwards while on the ground.
state.speed=nextSpeed(state.speed,dt,keys.has('KeyK'),braking,state.airborne);
const turn=(keys.has('KeyA')?1:0)-(keys.has('KeyD')?1:0);
const steeringGrip=Math.min(Math.abs(state.speed)/45,1);
const speedTurnFactor=THREE.MathUtils.clamp(1.15-state.speed/1100,.35,1);
const accelerationTurnFactor=keys.has('KeyK')?.72:1;
state.heading+=turn*dt*(state.airborne?.70:.65)*steeringGrip*speedTurnFactor*accelerationTurnFactor*(state.speed<0?-1:1);
// A simple lift model: lift grows with speed squared; below flying speed the plane sinks.
const liftRatio=(state.speed/240)**2;
if(!state.airborne && ascending && liftRatio>=1){state.airborne=true;state.verticalSpeed=.18;document.querySelector('#status').textContent='ひこうちゅう！';showMessage(matchMedia('(any-pointer: coarse) and (min-width:600px) and (min-height:600px)').matches?'とびたった！ 十字キーの下で ゆっくり おりよう ☁':'とびたった！ Shiftで ゆっくり おりよう ☁',5000)}
const previousHeight=state.height; let touchedDown=false, safeTouchdown=false;
if(state.airborne){
  if(state.speed<220 && !state.stalled){state.stalled=true;warning();speak('stall');document.querySelector('#status').textContent='しっそく！';showMessage('スピードが たりない！ Kで かそくしよう',5000)}
  if(state.stalled && state.speed>=240){state.stalled=false;document.querySelector('#status').textContent='ひこうちゅう！';showMessage('スピードが もどったよ！',3000)}
  const verticalInput=(ascending?1:0)-(descending?1:0);
  const targetVertical = state.stalled ? -Math.max(4, (1-liftRatio)*15) : THREE.MathUtils.clamp((liftRatio-1)*8, -12, 5) + verticalInput*(state.speed/3.6)*.58;
  state.verticalSpeed += (targetVertical*.18-state.verticalSpeed)*Math.min(1,dt*3.5);
  state.height += state.verticalSpeed*dt;
  if(state.height<=realGroundHeight(state.x,state.z)){safeTouchdown=landingIsSafe(state.speed,state.verticalSpeed);state.height=realGroundHeight(state.x,state.z);state.verticalSpeed=0;state.airborne=false;state.stalled=false;touchedDown=true}
}
const previousX=state.x, previousZ=state.z;const velocity=state.speed/3.6*.18*dt;state.x-=Math.sin(state.heading)*velocity;state.z-=Math.cos(state.heading)*velocity;
// Keep the young pilot safely over the generated world.
if(Math.abs(state.x)>2100||state.z < -2250||state.z>1950){state.x=THREE.MathUtils.clamp(state.x,-2099,2099);state.z=THREE.MathUtils.clamp(state.z,-2249,1949);const runwayCenter=airportToWorld(0,-201);state.heading=Math.atan2(state.x-runwayCenter.x,state.z-runwayCenter.z);showMessage('かっそうろの ほうへ もどるよ！',3000)}
const local=worldToAirport(state.x,state.z),crossAngle=THREE.MathUtils.degToRad(60.78);
const crossX=local.x*Math.cos(crossAngle)-(local.z+201)*Math.sin(crossAngle),crossZ=local.x*Math.sin(crossAngle)+(local.z+201)*Math.cos(crossAngle);
const onRunway=(Math.abs(local.x)<=4.05&&local.z>=-426&&local.z<=24)||(Math.abs(crossX)<=4.05&&Math.abs(crossZ)<=120);
if(touchedDown){if(!document.querySelector('#safe-mode').checked&&(!onRunway||!safeTouchdown))explode(!onRunway?'かっそうろに おりようね。':'スピードを おとして、ゆるやかに おりようね。');else {document.querySelector('#status').textContent='ちゃくりく！';showMessage(matchMedia('(any-pointer: coarse) and (min-width:600px) and (min-height:600px)').matches?'ちゃくりく！ げんそくボタンで とまろう':'ちゃくりく！ Jで ブレーキを かけよう',5000);speak('land')}}
if(!document.querySelector('#safe-mode').checked && !state.crashed && (obstacles.some(o=>overlapsObstacleHeight(o,previousHeight,state.height,1.5) && segmentHitsBuilding(previousX,previousZ,state.x,state.z,o)) || hitsRealBuilding(previousX,previousZ,previousHeight, state.x,state.z,state.height)))explode();
}
for(let i=missiles.length-1;i>=0;i--){const m=missiles[i],previous=m.mesh.position.clone();m.life-=dt;m.velocity.y-=18*dt;m.mesh.position.addScaledVector(m.velocity,dt);m.mesh.rotation.x=Math.atan2(m.velocity.y,Math.hypot(m.velocity.x,m.velocity.z));const pos=m.mesh.position;const hit=pos.y<=realGroundHeight(pos.x,pos.z)+.3||obstacles.some(o=>overlapsObstacleHeight(o,previous.y,pos.y)&&segmentHitsBuilding(previous.x,previous.z,pos.x,pos.z,o))||hitsRealBuilding(previous.x,previous.z,previous.y,pos.x,pos.z,pos.y);if(hit){launchFirework(pos.x,pos.z);scene.remove(m.mesh);missiles.splice(i,1)}else if(m.life<=0){scene.remove(m.mesh);missiles.splice(i,1)}}
for(let i=fireworks.length-1;i>=0;i--){const f=fireworks[i];f.life-=dt;f.mesh.position.y+=28*dt;f.trail-=dt;if(f.trail<=0){f.trail=.08;const mesh=box(.22,.22,.22,fireworkColors[5],f.mesh.position.x,f.mesh.position.y,f.mesh.position.z,scene,false);fireworkParticles.push({mesh,vx:0,vy:-2,vz:0,life:.45,maxLife:.45})}if(f.life<=0){burstFirework(f);scene.remove(f.mesh);fireworks.splice(i,1)}}
for(let i=fireworkParticles.length-1;i>=0;i--){const p=fireworkParticles[i];p.life-=dt;p.vy-=(p.isStar?3:7)*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;if(p.isStar){p.trail-=dt;if(p.trail<=0&&p.life>.25){p.trail=.12;const mesh=box(.22,.22,.22,p.color,p.mesh.position.x,p.mesh.position.y,p.mesh.position.z,scene,false);fireworkParticles.push({mesh,vx:0,vy:-1,vz:0,life:.55,maxLife:.55})}}p.mesh.scale.setScalar(Math.max(0,(p.isStar?.48:.22)*p.life/p.maxLife));if(p.life<=0){scene.remove(p.mesh);fireworkParticles.splice(i,1)}}
for(let i=sparks.length-1;i>=0;i--){const p=sparks[i];p.life-=dt;p.vy-=18*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.mesh.rotation.x+=dt*3;p.mesh.rotation.y+=dt*2;if(p.life<=0){scene.remove(p.mesh);sparks.splice(i,1)}}
for(let i=blastClouds.length-1;i>=0;i--){const p=blastClouds[i];p.life-=dt;const age=1-p.life/p.maxLife;p.mesh.position.x+=p.vx*dt;p.mesh.position.y+=p.vy*dt;p.mesh.position.z+=p.vz*dt;p.vx*=Math.exp(-dt*1.2);p.vz*=Math.exp(-dt*1.2);p.mesh.scale.setScalar(p.size*(1+age*(p.smoke?2.4:3.2)));p.mesh.material.opacity=(p.smoke?.8:.95)*Math.min(1,Math.max(0,p.life/(p.smoke?1.1:.45)));if(p.life<=0){scene.remove(p.mesh);p.mesh.material.dispose();blastClouds.splice(i,1)}}
if(!state.airborne||state.speed<235)gearRetracted=false;else if(state.speed>250&&state.height>4)gearRetracted=true;
gearExtension=THREE.MathUtils.lerp(gearExtension,gearRetracted?0:1,1-Math.exp(-3*dt));landingGear.visible=gearExtension>.02;landingGear.scale.y=Math.max(.001,gearExtension);landingGear.position.y=(1-gearExtension)*1.1;
plane.position.set(state.x, state.height+.35, state.z);plane.rotation.y=state.heading;plane.rotation.z=THREE.MathUtils.lerp(plane.rotation.z,((keys.has('KeyA')?1:0)-(keys.has('KeyD')?1:0))*(state.airborne?.78:.08),1-Math.exp(-5*dt));const flightPitch=state.airborne?THREE.MathUtils.clamp(Math.atan2(state.verticalSpeed,Math.max(state.speed/3.6*.18,.18)),-.52,.52):0;plane.rotation.x=THREE.MathUtils.lerp(plane.rotation.x,flightPitch,1-Math.exp(-5*dt));
const behind=new THREE.Vector3(Math.sin(state.heading)*8.55,4.5,Math.cos(state.heading)*8.55);targetCam.set(state.x+behind.x,state.height+behind.y,state.z+behind.z);camera.position.lerp(targetCam,1-Math.exp(-10*dt));const viewAhead=12;look.set(state.x-Math.sin(state.heading)*viewAhead,state.height+.9+Math.tan(plane.rotation.x)*viewAhead,state.z-Math.cos(state.heading)*viewAhead);camera.lookAt(look);sun.position.set(state.x-35,state.height+80,state.z+30);sun.target.position.set(state.x,0,state.z);sun.target.updateMatrixWorld();
updateEngine(state.started,state.speed);
if(state.started&&!state.airborne&&state.speed>=240&&!state.readyAnnounced){state.readyAnnounced=true;speak('ready')}
if(!state.airborne&&state.speed<220)state.readyAnnounced=false;
if(state.started&&!document.querySelector('#safe-mode').checked&&state.speed>50&&now-lastDangerCheck>400){lastDangerCheck=now;const lookAhead=Math.max(30,state.speed/3.6*2.2),endX=state.x-Math.sin(state.heading)*lookAhead,endZ=state.z-Math.cos(state.heading)*lookAhead;if(now-lastDangerVoice>5000&&(obstacles.some(o=>overlapsObstacleHeight(o,state.height,state.height,1.5)&&segmentHitsBuilding(state.x,state.z,endX,endZ,o))||hitsRealBuilding(state.x,state.z,state.height,endX,endZ,state.height))){lastDangerVoice=now;speak('danger')}}
takeoffHint.classList.toggle('hidden',!(state.started&&!state.airborne&&state.speed>=240));takeoffHint.querySelector('span').textContent=matchMedia('(any-pointer: coarse) and (min-width:600px) and (min-height:600px)').matches?'十字キーの「▲ とぶ」で しゅっぱつ':matchMedia('(any-pointer: coarse)').matches?'「とぶ！」で しゅっぱつ':'W または スペースで しゅっぱつ';
const altitudeMeters=state.height/.18;const altitudeBase=Math.floor(altitudeMeters/20)*20;const tapeHeight=altitudeTicks.clientHeight;const tickRange=Math.ceil(tapeHeight/80)+1;altitudeTicks.innerHTML=Array.from({length:tickRange*2+1},(_,i)=>{const value=altitudeBase+(i-tickRange)*20;if(value<0)return '';const y=tapeHeight/2-(value-altitudeMeters)*2;return `<div class="altitude-tick" style="top:${y}px"><span>${value}</span><i></i></div>`}).join('');
compassNeedle.style.transform=`rotate(${state.heading}rad)`;drawMap();
safetyHud.hidden=!state.started;safetyHud.textContent=matchMedia('(any-pointer: coarse) and (min-width:600px) and (min-height:600px)').matches?(document.querySelector('#safe-mode').checked?'あんぜん ON':'あんぜん OFF'):(document.querySelector('#safe-mode').checked?'あんぜん ON　Qで切替・Rでやりなおし':'あんぜん OFF　Qで切替・Rでやりなおし');
const degrees=((Math.round(-state.heading*180/Math.PI)%360)+360)%360;document.querySelector('#heading').textContent=['北','北東','東','南東','南','南西','西','北西'][Math.round(degrees/45)%8];document.querySelector('#degrees').textContent=`${degrees}°`;document.querySelector('#speed').textContent=Math.round(Math.abs(state.speed));document.querySelector('#height').textContent=Math.round(altitudeMeters);document.querySelector('#meter').style.width=`${Math.abs(state.speed)/900*100}%`;worldTick(now/1000);renderer.render(scene,camera)}
if(savedGame){camera.position.fromArray(savedGame.camera);plane.visible=!state.crashed;if(state.crashed)crashScreen.classList.remove('hidden')}else camera.position.set(state.x+Math.sin(state.heading)*8.55,state.height+4.5,state.z+Math.cos(state.heading)*8.55);animationFrame=requestAnimationFrame(animate);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)},listenerOptions);

// Vite replaces this module without reloading the page or losing the flight.
if(import.meta.hot){
  import.meta.hot.accept();
  import.meta.hot.dispose(data=>{
    data.game={state:{...state},camera:camera.position.toArray(),keys:[...keys]};
    sceneIsDisposed=true;if(realMap)scene.remove(realMap.world.group);listeners.abort();cancelAnimationFrame(animationFrame);clearTimeout(messageTimer);clearTimeout(crashTimer);
    scene.traverse(object=>{if(object.geometry)object.geometry.dispose();if(object.material){for(const material of (Array.isArray(object.material)?object.material:[object.material]))material.dispose()}});
    renderer.dispose();renderer.domElement.remove();takeoffHint.remove();altitudeTape.remove();compass.remove();miniMap.remove();mapCredit.remove();safetyHud.remove();
  });
}
