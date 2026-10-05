import { test, expect } from '@playwright/test';
import { conceptGraph, CATEGORIES } from '../../public/model.js';

async function seek(page:any,time:number,commit=true) {
  await page.getByRole('slider',{name:'再生位置',exact:true}).evaluate((element:HTMLInputElement,{time,commit}:{time:number,commit:boolean})=>{
    element.value=String(time);element.dispatchEvent(new Event('input',{bubbles:true}));if(commit)element.dispatchEvent(new Event('change',{bubbles:true}));
  },{time,commit});
}

test('実字幕・実Jevのカテゴリ概念図、シーク往復、保存、再生、画面幅',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    (window as any).playerEvents=[];
    window.addEventListener('message',event=>{
      if(!event.origin.includes('youtube'))return;
      try { const data=JSON.parse(event.data);if(data.event!=='infoDelivery') (window as any).playerEvents.push(data); }catch{}
    });
  });
  await page.goto('/');
  const video=await(await page.request.get('/api/video')).json();
  test.setTimeout(video.duration*1000);
  const end=45;
  const expected=video.cues.filter((c:any)=>c.end<=end).length;
  await expect(page.getByRole('button',{name:'再生',exact:true})).toBeEnabled();
  await seek(page,end);
  await expect(page.locator('#time')).toHaveText('0:45 / 65:36');
  if(video.records.length<video.cues.length)await page.locator('#start').click();
  await expect(page.locator('#start')).toHaveText('全編解析済み',{timeout:video.duration*1000});
  const analysisRequests:string[]=[];page.on('request',request=>{if(request.url().endsWith('/api/diagram'))analysisRequests.push(request.url())});
  await expect(page.locator('#error')).toBeHidden();
  const current=await(await page.request.get('/api/video')).json();
  expect(current.records.filter((r:any)=>r.end<=end)).toHaveLength(expected);
  const model=conceptGraph(current.records,end);
  expect(model.nodes.length).toBeGreaterThan(0);
  expect(model.nodes.every((n:any)=>Object.hasOwn(CATEGORIES,n.category))).toBeTruthy();
  expect(model.nodes.every((n:any)=>!/^\d+:\d+/.test(n.label))).toBeTruthy();
  await expect(page.locator('#graph')).toHaveAttribute('data-nodes',String(model.nodes.length));
  const topology=await page.locator('#graph').getAttribute('data-topology');
  await page.locator('#fit').click();
  const geometry=JSON.parse((await page.locator('#graph').getAttribute('data-layout'))!);
  expect(geometry.rendered.x1).toBeGreaterThanOrEqual(0);expect(geometry.rendered.y1).toBeGreaterThanOrEqual(0);
  expect(geometry.rendered.x2).toBeLessThanOrEqual(geometry.viewport.width);expect(geometry.rendered.y2).toBeLessThanOrEqual(geometry.viewport.height);
  await page.screenshot({path:'/tmp/jev-video-desktop.png',fullPage:true});
  console.log('diagram',JSON.stringify({sentences:expected,nodes:model.nodes,edges:model.edges,aspect:await page.locator('#graph').getAttribute('data-aspect')}));
  await seek(page,1);
  await expect(page.locator('#graph')).toHaveAttribute('data-nodes','0');
  await seek(page,end);
  await expect(page.locator('#graph')).toHaveAttribute('data-topology',topology!);
  await page.locator('#readable').click();
  const stable=JSON.parse((await page.locator('#graph').getAttribute('data-layout'))!);
  for(const cue of current.cues) {
    await seek(page,cue.end,false);
    const frame=JSON.parse((await page.locator('#graph').getAttribute('data-layout'))!);
    expect(frame.categories).toEqual(stable.categories);
    expect(frame.pan).toEqual(stable.pan);expect(frame.zoom).toEqual(stable.zoom);
    for(const node of stable.concepts) {
      const visible=frame.concepts.find((n:any)=>n.id===node.id);
      if(visible)expect(visible.position).toEqual(node.position);
    }
  }
  await seek(page,end);
  await page.reload();
  await expect(page.getByRole('button',{name:'再生',exact:true})).toBeEnabled();
  await seek(page,end);
  await expect(page.locator('#graph')).toHaveAttribute('data-topology',topology!);
  expect(JSON.parse((await page.locator('#graph').getAttribute('data-layout'))!).concepts).toEqual(stable.concepts);
  await page.getByRole('button',{name:'再生',exact:true}).click();
  try { await expect(page.locator('#toggle')).toHaveText('一時停止'); }
  catch(error) { console.log('player-diagnostic',JSON.stringify(await page.evaluate(()=>({events:(window as any).playerEvents,iframe:document.querySelector('iframe')?.getAttribute('allow')}))));throw error; }
  await expect(page.locator('#time')).toHaveText(/0:4[6-9] \/ 65:36/);
  await page.getByRole('button',{name:'一時停止',exact:true}).click();
  await expect(page.locator('#toggle')).toHaveText('再生');
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:'/tmp/jev-video-mobile.png',fullPage:true});
  expect(analysisRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('APIキーを画面に返さず、別サイトと不正な字幕の要求を拒否する',async({request})=>{
  const response=await request.get('/api/video');const body=await response.text();
  expect(body).not.toContain('apikey_');
  const blocked=await request.post('/api/diagram',{headers:{Origin:'https://example.com','Content-Type':'application/json'},data:{}});
  expect(blocked.status()).toBe(403);
  const video=JSON.parse(body);
  const invalid=await request.post('/api/diagram',{headers:{Origin:process.env.BASE_URL!,'Content-Type':'application/json'},data:{revision:video.revision,id:-1,japanese:'不正な字幕'}});
  expect(invalid.status()).toBe(400);
});

test('図を画面の主領域にし、補助パネルを開閉しても解析と再配置をしない',async({page})=>{
  const requests:string[]=[];page.on('request',r=>{if(r.url().endsWith('/api/diagram'))requests.push(r.url())});
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('/');
  await expect(page.locator('#start')).toHaveText('全編解析済み');
  await expect(page.locator('#toggle')).toBeEnabled();
  await seek(page,3936,false);
  await expect(page.locator('#graph')).toHaveAttribute('data-nodes',/^[1-9]\d*$/);
  const initial=JSON.parse((await page.locator('#graph').getAttribute('data-layout'))!);
  const overlaps:string[]=[];
  for(let i=0;i<initial.concepts.length;i++)for(let j=i+1;j<initial.concepts.length;j++) {
    const a=initial.concepts[i],b=initial.concepts[j];
    const separateX=Math.abs(a.position.x-b.position.x)>=(a.width+b.width)/2;
    const separateY=Math.abs(a.position.y-b.position.y)>=(a.height+b.height)/2;
    if(!separateX&&!separateY)overlaps.push(`${a.label} / ${b.label}`);
  }
  expect(overlaps).toEqual([]);
  const bounds=await page.locator('#graph').boundingBox();
  const main=await page.locator('main').boundingBox();
  expect(JSON.parse((await page.locator('#graph').getAttribute('data-readability'))!).fontPixels).toBe(16);
  expect(bounds!.width).toBe(1600);
  expect(bounds!.height).toBeGreaterThan(1000-bounds!.height);
  expect(bounds!.x).toBe(0);expect(bounds!.y+bounds!.height).toBe(main!.y+main!.height);
  await expect(page.locator('#video-panel')).toBeHidden();await expect(page.locator('#detail-panel')).toBeHidden();
  await page.getByRole('combobox',{name:'カテゴリへ移動',exact:true}).selectOption('tools');
  await page.getByRole('combobox',{name:'概念へ移動',exact:true}).selectOption({label:'エージェント'});
  const readable=JSON.parse((await page.locator('#graph').getAttribute('data-readability'))!);
  expect(readable.fontPixels).toBe(16);expect(readable.directEdges).toBeGreaterThan(0);
  await page.screenshot({path:'/tmp/jev-video-graph-primary.png'});
  await page.locator('#show-video').click();await expect(page.locator('#video-panel')).toBeVisible();
  await page.locator('#show-video').click();await expect(page.locator('#video-panel')).toBeHidden();
  await seek(page,45,false);await seek(page,3936,false);
  const after=JSON.parse((await page.locator('#graph').getAttribute('data-layout'))!);
  expect(after.concepts).toEqual(initial.concepts);expect(after.categories).toEqual(initial.categories);
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  const mobile=await page.locator('#graph').boundingBox();expect(mobile!.width).toBe(390);expect(mobile!.height).toBeGreaterThan(844-mobile!.height);
  await page.screenshot({path:'/tmp/jev-video-graph-primary-mobile.png'});
  expect(requests).toEqual([]);
});
