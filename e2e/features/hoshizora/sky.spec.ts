import {test,expect} from '../../../tests/hoshizora/playwright';
import path from 'node:path';
const evidence=path.resolve(__dirname,'../../../.artifacts/hoshizora');
test.beforeEach(async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.clock.setFixedTime(new Date('2026-10-03T12:00:00Z'));
  await page.goto('/hoshizora/');
});
test('normal interaction, local time, layout and screenshot',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await expect(page.getByRole('button',{name:'空を見上げる'})).toBeInViewport();
  await page.screenshot({path:`${evidence}/${info.project.name}-intro.png`});
  await page.getByRole('button',{name:'空を見上げる'}).click();
  await expect(page.locator('#where')).toContainText('いまいる場所');
  await page.getByRole('button',{name:'🕰 いま',exact:true}).click();
  await expect(page.locator('#when')).toContainText('21:00');
  await expect(page.locator('#when')).toContainText('端末の時刻');
  const iso=await page.evaluate('sky.date.toISOString()');
  expect(iso).toBe(info.project.name==='desktop-utc'?'2026-10-03T21:00:00.000Z':info.project.name==='iphone-newyork'?'2026-10-04T01:00:00.000Z':'2026-10-03T12:00:00.000Z');
  await page.getByRole('button',{name:'📱 かざす'}).click();
  await expect(page.locator('#hint')).toContainText('指でなぞって');
  await page.getByRole('button',{name:'✦ 星座線'}).click();expect(await page.evaluate('showLines')).toBe(false);
  await page.getByRole('button',{name:'✦ 星座線'}).click();expect(await page.evaluate('showLines')).toBe(true);
  const old=await page.evaluate('yaw');
  await page.mouse.move(170,210);await page.mouse.down();await page.mouse.move(280,240,{steps:10});await page.mouse.up();
  expect(await page.evaluate('yaw')).not.toBe(old);
  for(const id of ['bSensor','bTime','bLines'])await expect(page.locator(`#${id}`)).toBeInViewport();
  expect(await page.evaluate('document.documentElement.scrollWidth<=innerWidth')).toBe(true);
  await expect(page.locator('#intro')).toHaveCSS('opacity','0');
  await page.screenshot({path:`${evidence}/${info.project.name}-sky.png`});expect(errors).toEqual([]);
});
test('synthetic absolute orientation: landscape screen up and compass north',async({page},info)=>{
  await page.getByRole('button',{name:'空を見上げる'}).click();
  await expect.poll(()=>page.evaluate('sensorState')).not.toBe('asking');
  const landscape=info.project.name==='landscape-tokyo';
  await page.evaluate(({landscape})=>{
    Object.defineProperty(screen.orientation,'angle',{configurable:true,value:landscape?90:0});
    const event=new Event('deviceorientationabsolute');
    Object.assign(event,{alpha:0,beta:landscape?0:90,gamma:landscape?-90:0,absolute:true});window.dispatchEvent(event);
  },{landscape});
  const actual=await page.evaluate('({target,sensorState})');
  expect(actual.sensorState).toBe('ok');expect(actual.target.u[2]).toBeCloseTo(1,8);expect(actual.target.f[landscape?0:1]).toBeCloseTo(1,8);
  await expect(page.locator('#hint')).toContainText('センサー精度');
});
test('relative, missing gamma and invalid compass never become a north reference',async({page})=>{
  await page.getByRole('button',{name:'空を見上げる'}).click();
  await expect.poll(()=>page.evaluate('sensorState')).not.toBe('asking');
  for(const payload of [{alpha:111,beta:90,gamma:0},{alpha:111,beta:90,gamma:null,absolute:true},{alpha:111,beta:90,gamma:0,webkitCompassHeading:0,webkitCompassAccuracy:-1}])
    await page.evaluate(payload=>{const e=new Event('deviceorientation');Object.assign(e,payload);window.dispatchEvent(e)},payload);
  expect(await page.evaluate('target')).toBe(null);await expect(page.locator('#hint')).toContainText('北の方角を確認できません');
});
test('iOS synthetic magnetic heading requires flat calibration and then tracks tilt',async({page})=>{
  await page.getByRole('button',{name:'空を見上げる'}).click();await expect(page.locator('#where')).toContainText('いまいる場所');
  await expect.poll(()=>page.evaluate('sensorState')).not.toBe('asking');
  const send=async(beta:number)=>page.evaluate(beta=>{
    const e=new Event('deviceorientation');Object.assign(e,{alpha:37,beta,gamma:0,webkitCompassHeading:0,webkitCompassAccuracy:3});window.dispatchEvent(e);
  },beta);
  await send(90);expect(await page.evaluate('target')).toBe(null);await expect(page.locator('#hint')).toContainText('平らに');
  await send(0);await send(90);
  const actual=await page.evaluate('({az:Astro.altAz(target.f).az,dec:compassDeclination,off:headingOff})');
  expect(actual.dec).toBeCloseTo(-8.7473,3);expect(actual.az).toBeCloseTo(360+actual.dec,7);
  await send(120);expect(await page.evaluate('Astro.altAz(target.f).alt')).toBeCloseTo(30,7);
});
test('southern/western geolocation labels and rendering use signed coordinates',async({page,context})=>{
  await context.setGeolocation({latitude:-33.9,longitude:-70.7});await page.getByRole('button',{name:'空を見上げる'}).click();
  await expect(page.locator('#where')).toContainText('南緯33.9° 西経70.7°');expect(await page.evaluate('({lat,lon})')).toEqual({lat:-33.9,lon:-70.7});
  expect(await page.evaluate('sky.stars.every(x=>x.v.every(Number.isFinite))')).toBe(true);
});
