import {test,expect} from '@playwright/test';
test('authored story: real data, all timed frames, stable positions, readable canvas and reload',async({page,request})=>{
 const story=await (await request.get('/api/story')).json();
 const posts:string[]=[];page.on('request',r=>{if(r.method()==='POST')posts.push(r.url())});
 await page.setViewportSize({width:1440,height:1000});await page.goto('/story?t=1115');
 await expect(page.locator('#story-graph')).toHaveAttribute('data-frame',/.+/);
 let positions:any=null;let camera:any=null;let previousNodes:string[]=[];
 for(const event of story.events){
  await page.locator('#position').evaluate((el:any,time)=>{el.value=time;el.dispatchEvent(new Event('input',{bubbles:true}))},event.at);
  const frame=JSON.parse(await page.locator('#story-graph').getAttribute('data-frame')||'{}');
  const cards=frame.positions.filter((p:any)=>!p.id.startsWith('title:'));for(let a=0;a<cards.length;a++)for(let b=a+1;b<cards.length;b++)expect(Math.abs(cards[a].x-cards[b].x)>=210||Math.abs(cards[a].y-cards[b].y)>=80).toBe(true);
  expect(frame.topic).toBe(event.topic);expect(frame.event).toBe(event.id);expect(frame.fontPixels).toBeGreaterThanOrEqual(16);
  const previous=story.events.filter((e:any)=>e.at<=event.at);
  expect(new Set(frame.nodes)).toEqual(new Set(previous.flatMap((e:any)=>e.show.map((id:string)=>e.topic+':'+id))));for(const id of previousNodes)expect(frame.nodes).toContain(id);previousNodes=frame.nodes;
  expect(new Set(frame.edges.filter((id:string)=>!id.startsWith('bridge:')))).toEqual(new Set(previous.flatMap((e:any)=>e.connect.map((id:string)=>e.topic+':'+id))));
  if(positions){expect(frame.positions).toEqual(positions);expect({pan:frame.pan,zoom:frame.zoom}).toEqual(camera)}else {positions=frame.positions;camera={pan:frame.pan,zoom:frame.zoom}}
 }
 for(const at of [1115,3700,1115]){await page.locator('#position').evaluate((el:any,time)=>{el.value=time;el.dispatchEvent(new Event('input',{bubbles:true}))},at)}
 await page.screenshot({path:'/tmp/authored-story-verification.png'});
 await page.locator('#evidence-toggle').click();await expect(page.locator('#source-content section')).not.toHaveCount(0);await page.locator('#source-close').click();
 await page.goto('/story');await expect(page.locator('#clock')).toContainText('18:35');
 expect(posts.filter(url=>url.includes('/api/'))).toEqual([]);
 await page.setViewportSize({width:900,height:850});
 await page.screenshot({path:'/tmp/authored-story-medium.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/authored-story-mobile.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.locator('#story-graph')).toBeVisible();expect(await page.locator('#story-graph canvas').count()).toBeGreaterThan(0);
 await page.setViewportSize({width:1440,height:1000});await page.locator('#position').evaluate((el:any)=>{el.value=3936;el.dispatchEvent(new Event('input',{bubbles:true}))});await page.locator('#overview').click();await page.screenshot({path:'/tmp/authored-story-one-canvas.png'});
 await page.locator('[data-topic=verification]').click();await page.locator('#readable').click();await page.screenshot({path:'/tmp/authored-story-canvas-detail.png'});
});
test('actual YouTube muted playback advances and pauses',async({page})=>{
 await page.goto('/story?t=1115');await expect(page.locator('#play')).toBeEnabled();
 await page.locator('#play').click();await expect(page.locator('#play')).toHaveText('一時停止');
 await expect.poll(async()=>Number(await page.locator('#position').inputValue())).toBeGreaterThan(1116);
 await page.locator('#play').click();await expect(page.locator('#play')).toHaveText('再生');
});
