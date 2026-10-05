import { visibleAt, nextPending, clock } from './timeline.js';
import { conceptGraph, CATEGORIES } from './model.js';
const $ = id => document.getElementById(id);
const video = await fetch('/api/video').then(r => r.json());
const records = new Map(video.records.map(r => [r.id,r]));
let player, translator, enabled = false, working = false, seconds = 0, shown = '', ready = false, cued = true, scrubbing = false, selectedConceptId = null, ended = false, prepared = false, focusId = null;
const graph = cytoscape({
  container: $('graph'),
  style: [
    { selector:'node:child', style:{'label':'data(label)','text-wrap':'wrap','text-overflow-wrap':'anywhere','text-max-width':140,'font-size':16,'font-family':'sans-serif','text-valign':'center','text-halign':'center','width':160,'height':70,'shape':'round-rectangle','background-color':'#e2eee9','border-width':3,'border-color':'#96b8ac','color':'#193a34','padding':12}},
    { selector:':parent',style:{'label':'data(label)','text-valign':'top','text-halign':'center','font-size':15,'font-weight':'bold','padding':16,'background-opacity':0.12,'background-color':'data(color)','border-color':'data(color)','border-width':1,'color':'#354c55'}},
    { selector:'edge', style:{'label':'data(label)','font-size':12,'curve-style':'bezier','target-arrow-shape':'triangle','line-color':'#93a6b1','target-arrow-color':'#93a6b1','text-background-color':'#fafaf7','text-background-opacity':1,'text-background-padding':4,'color':'#375367'}},
    { selector:'node.current',style:{'border-width':3,'border-color':'#c7832e','background-color':'#fff0d7'}},
    { selector:'edge.focus-muted',style:{'opacity':0.12,'text-opacity':0}},
    { selector:'edge.focus-direct',style:{'width':3,'line-color':'#225c59','target-arrow-color':'#225c59'}},
    { selector:'.future',style:{'visibility':'hidden'}},
    { selector:':selected',style:{'border-width':3,'border-color':'#367b97'}},
  ],
});
new ResizeObserver(()=>{graph.resize();if($('follow').checked)graph.fit(undefined,30)}).observe($('graph'));
$('title').textContent = video.title;
$('seek').max = video.duration;
$('connection').textContent = video.configured ? 'Jev 接続設定済み' : 'Jev キー未設定';
function error(message) { $('error').textContent = message; $('error').hidden = !message; }
function detail(concept,reveal=true) {
  if(reveal)$('detail-panel').hidden=false;
  selectedConceptId = concept.id;
  $('detail').replaceChildren();
  const title = document.createElement('h3'); title.textContent = concept.label;
  const info = document.createElement('p'); info.textContent = `${CATEGORIES[concept.category]} · 根拠 ${concept.evidence.length}件。同じ概念への言及をここにまとめています。`;
  $('detail').append(title,info);
  for(const id of concept.evidence) {
    const r=records.get(id);
    const button=document.createElement('button');button.textContent=`${clock(r.start)} の場面へ`;button.onclick=()=>seek(r.end);
    const ja=document.createElement('p');ja.textContent=r.japanese;
    const source=document.createElement('small');source.textContent=`${r.text} — ${r.model} / ${r.latencyMs}ms`;
    $('detail').append(button,ja,source);
  }
}
function seek(time) {
  if (!ready) return;
  seconds = time;ended=false;
  if(cued) { $('toggle').disabled=true;player.cueVideoById({videoId:video.videoId,startSeconds:time}); }
  else { player.seekTo(time,true);  }
  render();
}
graph.on('tap','node:child',event => {
  const concept=conceptGraph(records.values(),seconds).nodes.find(n=>n.id===event.target.id());
  if(concept){focusId=concept.id;highlight();detail(concept)}
});
function separateOverlaps() {
  const placed=[];
  for(const node of graph.nodes(':child')) {
    const origin={...node.position()},halfWidth=node.outerWidth()/2,halfHeight=node.outerHeight()/2;
    const gap=Number(node.style('padding').replace('px',''));
    const bounds=p=>({x1:p.x-halfWidth-gap/2,x2:p.x+halfWidth+gap/2,y1:p.y-halfHeight-gap/2,y2:p.y+halfHeight+gap/2});
    const clear=p=>{const b=bounds(p);return placed.every(a=>b.x1>=a.x2||b.x2<=a.x1||b.y1>=a.y2||b.y2<=a.y1)};
    if(!clear(origin)) {
      const options=placed.flatMap(b=>[
        {x:b.x2+halfWidth+gap/2,y:origin.y},{x:b.x1-halfWidth-gap/2,y:origin.y},
        {x:origin.x,y:b.y2+halfHeight+gap/2},{x:origin.x,y:b.y1-halfHeight-gap/2}
      ]);
      options.sort((a,b)=>Math.hypot(a.x-origin.x,a.y-origin.y)-Math.hypot(b.x-origin.x,b.y-origin.y));
      node.position(options.find(clear));
    }
    placed.push(bounds(node.position()));
  }
}
function prepareGraph() {
  if(prepared || nextPending(video.cues,records,Infinity)) return;
  const model=conceptGraph(records.values());
  const palette={tools:'#6a91b4',quality:'#75a38b',workflow:'#b39964',organization:'#a08bb9',outcomes:'#bc936a',principles:'#809bac',constraints:'#b27f7f'};
  graph.add([...new Set(model.nodes.map(n=>n.category))].map(category=>({data:{id:'category:'+category,label:CATEGORIES[category],color:palette[category]}})));
  graph.add(model.nodes.map(n=>({data:{id:n.id,parent:'category:'+n.category,label:n.label+'\n根拠 0件'}})));
  graph.add(model.edges.map(e=>({data:{...e,label:e.label}})));
  const layoutKey='jev-layout:'+video.revision;
  const saved=JSON.parse(localStorage.getItem(layoutKey)??'null');
  if(saved && model.nodes.every(n=>saved[n.id])) graph.nodes(':child').positions(n=>saved[n.id()]);
  else {
    graph.layout({name:'fcose',animate:false,fit:false,packComponents:false}).run();
    localStorage.setItem(layoutKey,JSON.stringify(Object.fromEntries(graph.nodes(':child').map(n=>[n.id(),n.position()]))));
  }
  separateOverlaps();
  localStorage.setItem(layoutKey,JSON.stringify(Object.fromEntries(graph.nodes(':child').map(n=>[n.id(),n.position()]))));
  graph.on('dragfree','node',()=>localStorage.setItem(layoutKey,JSON.stringify(Object.fromEntries(graph.nodes(':child').map(n=>[n.id(),n.position()])))));
  prepared=true;shown=null;
  focusId=model.nodes[0]?.id??null;
  if(focusId){graph.zoom(1);graph.center(graph.getElementById(focusId))}
  $('start').textContent='全編解析済み';$('start').disabled=true;
  $('status').textContent='保存済みの図を再生します。再生・シークでJevは実行しません。';
}
function highlight() {
  graph.edges().removeClass('focus-muted focus-direct');
  if(focusId){graph.edges().addClass('focus-muted');graph.getElementById(focusId).connectedEdges().removeClass('focus-muted').addClass('focus-direct')}
}
function focusConcept(id) {
  if(!id)return;
  focusId=id;$('follow').checked=false;
  graph.zoom(1);graph.center(graph.getElementById(id));
  shown=null;render();
}
$('focus-concept').onchange=()=>focusConcept($('focus-concept').value);
$('focus-category').onchange=()=>{
  const nodes=conceptGraph(records.values(),seconds).nodes.filter(n=>n.category===$('focus-category').value);
  nodes.sort((a,b)=>b.evidence.length-a.evidence.length);
  focusConcept(nodes[0]?.id);
};
$('readable').onclick=()=>focusConcept(focusId??conceptGraph(records.values(),seconds).nodes[0]?.id);
function render() {
  $('seek').value = seconds;
  $('time').textContent = `${clock(seconds)} / ${clock(video.duration)}`;
  if(!prepared) return;
  const list = visibleAt([...records.values()], seconds).sort((a,b) => a.id-b.id);
  const key = list.map(r=>r.id).join(',');
  if (key === shown) return;
  shown = key;
  const model=conceptGraph(list);
  const topology=model.nodes.map(n=>n.id).join(',')+'|'+model.edges.map(e=>e.id).join(',');
  const categoryIds=[...new Set(model.nodes.map(n=>n.category))];
  const ids=new Set([...model.nodes,...model.edges].map(n=>n.id).concat(categoryIds.map(c=>'category:'+c)));
  graph.batch(() => {
    graph.elements().forEach(e=>e.toggleClass('future',!ids.has(e.id())));
    for(const node of model.nodes) graph.getElementById(node.id).data('label',`${node.label}\n根拠 ${node.evidence.length}件`);
    for(const edge of model.edges) graph.getElementById(edge.id).data('label',`${edge.label} · ${edge.evidence.length}`);
    graph.nodes(':child').removeClass('current');
    for(const c of list.at(-1)?.concepts??[])graph.getElementById(c.id).addClass('current');
  });
  highlight();
  const categoryValue=$('focus-category').value;
  $('focus-category').replaceChildren(new Option('カテゴリへ移動',''),...categoryIds.map(id=>new Option(CATEGORIES[id],id)));
  $('focus-category').value=categoryValue;
  $('focus-concept').replaceChildren(new Option('概念へ移動',''),...model.nodes.map(n=>new Option(n.label,n.id)));
  $('focus-concept').value=model.nodes.some(n=>n.id===focusId)?focusId:'';
  $('graph').dataset.readability=JSON.stringify({zoom:graph.zoom(),fontPixels:16*graph.zoom(),focusId,directEdges:graph.edges('.focus-direct').not('.future').length});
  $('graph').dataset.topology=topology;
  $('graph').dataset.nodes=String(model.nodes.length);
  $('graph').dataset.edges=String(model.edges.length);
  const box=graph.elements().boundingBox();
  $('graph').dataset.aspect=String(box.w/box.h);
  const rendered=graph.elements().renderedBoundingBox();
  $('graph').dataset.layout=JSON.stringify({width:box.w,height:box.h,rendered,viewport:{width:graph.width(),height:graph.height()},zoom:graph.zoom(),pan:graph.pan(),categories:graph.nodes(':parent').map(n=>({id:n.id(),position:n.position(),width:n.width(),height:n.height()})),concepts:model.nodes.map(n=>({id:n.id,label:n.label,position:graph.getElementById(n.id).position(),width:graph.getElementById(n.id).outerWidth(),height:graph.getElementById(n.id).outerHeight()}))});
  if(selectedConceptId) {
    const selected=model.nodes.find(n=>n.id===selectedConceptId);
    if(selected)detail(selected,false);
    else {$('detail').textContent='この時点ではまだ登場していない概念です。';selectedConceptId=null}
  }
  $('count').textContent = `${categoryIds.length} カテゴリ · ${model.nodes.length} 概念 · ${model.edges.length} 関係`;
  $('graph').setAttribute('aria-label',`再生位置までの概念図：${model.nodes.length}概念、${model.edges.length}関係`);
  $('empty').hidden = model.nodes.length > 0;
  $('transcript').replaceChildren();$('relations').replaceChildren();
  for(const node of model.nodes) {
    const li=document.createElement('li');li.textContent=`${CATEGORIES[node.category]} / ${node.label}：根拠${node.evidence.length}件`;
    $('relations').append(li);
  }
  for(const edge of model.edges) {
    const li=document.createElement('li');li.textContent=`${model.nodes.find(n=>n.id===edge.source).label} → ${edge.label} → ${model.nodes.find(n=>n.id===edge.target).label}：根拠${edge.evidence.length}件`;
    $('relations').append(li);
  }
  for (const r of list) {
    const li=document.createElement('li'),button=document.createElement('button'),time=document.createElement('time'),text=document.createElement('span'),source=document.createElement('small');
    button.dataset.cueId=r.id;time.textContent=clock(r.start);text.textContent=r.japanese;source.textContent=r.text;
    button.append(time,text,source);button.onclick=()=>seek(r.end);li.append(button);$('transcript').append(li);
  }
}
async function processNext() {
  if (!enabled || working) return;
  working = true;
  try {
    let cue;
    while (enabled && (cue=nextPending(video.cues,records,Infinity))) {
      $('status').textContent = `${clock(cue.start)} の発言を日本語に翻訳しています…`;
      const japanese = video.translations[cue.id] ?? await translator.translate(cue.text);
      if (!enabled) break;
      $('status').textContent = `${clock(cue.start)} の発言をJevが図にしています…`;
      const response = await fetch('/api/diagram',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:cue.id,japanese,revision:video.revision})});
      const result=await response.json();
      if (!response.ok) throw new Error(result.error);
      records.set(cue.id,result);
      $('progress').textContent = `解析済み ${records.size} / ${video.cues.length}`;
      render();
    }
    if(enabled) { enabled=false;prepareGraph();render(); }
  } catch(e) {
    enabled=false; $('start').textContent='残りの全編解析を再開';error(e.message);
    $('status').textContent='解析を停止しました。保存済みの文章を再解析せず、残りから再開できます。';
  } finally { working=false; }
}
$('start').onclick=async()=>{
  if(enabled) {enabled=false;$('start').textContent='残りの全編解析を再開';$('status').textContent='解析を停止しました。保存済みの文章は再実行しません。残りから再開できます。';return}
  try {
    error('');$('start').disabled=true;
    if(!translator) {
      if(!('Translator' in window)) throw new Error('Chromeのデスクトップ版で開いてください。このブラウザは内蔵翻訳に対応していません。');
      $('status').textContent='日本語翻訳を準備しています…';
      translator=await Translator.create({sourceLanguage:'en',targetLanguage:'ja',monitor(m){m.addEventListener('downloadprogress',e=>{$('status').textContent=`翻訳モデルを準備しています ${Math.round(e.loaded*100)}%`;})}});
    }
    enabled=true;$('start').textContent='全編解析を停止';processNext();
  } catch(e) {error(e.message);$('status').textContent='翻訳を開始できませんでした。'}
  finally {$('start').disabled=prepared}
};
$('toggle').onclick=()=>{if(player.getPlayerState()===YT.PlayerState.PLAYING)player.pauseVideo();else player.playVideo()};
$('speed').onchange=()=>{if(ready)player.setPlaybackRate(Number($('speed').value))};
$('seek').oninput=()=>{scrubbing=true;seconds=Number($('seek').value);render()};
$('seek').onchange=()=>{scrubbing=false;seek(Number($('seek').value))};
$('show-video').onclick=()=>{const open=$('video-panel').hidden;$('video-panel').hidden=!open;$('show-video').setAttribute('aria-expanded',String(open));$('show-video').textContent=open?'動画・字幕を閉じる':'動画・字幕を開く'};
$('close-detail').onclick=()=>{$('detail-panel').hidden=true};
$('fit').onclick=()=>{$('follow').checked=false;graph.fit(undefined,30);shown=null;render()};
$('follow').onchange=()=>{if($('follow').checked)graph.fit(undefined,30)};
if(video.error) error(video.error);
if(!video.configured) error('Jev APIキーが設定されていません。サーバーの .env を確認してください。');
$('progress').textContent=`解析済み ${records.size} / ${video.cues.length}`;
prepareGraph();
window.onYouTubeIframeAPIReady=()=>{
  player=new YT.Player('player',{
    videoId:video.videoId,
    host:'https://www.youtube-nocookie.com',
    playerVars:{origin:location.origin,playsinline:1,autoplay:0,start:0},
    events:{
      onReady(){player.mute();ready=true;$('toggle').disabled=false;$('start').disabled=prepared||!video.configured||!video.cues.length;if(!prepared)$('status').textContent='最初に全編を一度解析します。完了後は保存結果だけで閲覧できます。';render();},
      onStateChange(e){if(e.data===YT.PlayerState.CUED)$('toggle').disabled=false;ended=e.data===YT.PlayerState.ENDED;if(e.data===YT.PlayerState.PLAYING)cued=false;$('toggle').textContent=e.data===YT.PlayerState.PLAYING?'一時停止':'再生'},
      onError(e){error(`YouTubeの再生エラー（${e.data}）。動画を再読み込みしてください。`);},
    },
  });
};
const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>error('YouTubeプレーヤーを読み込めませんでした。ネットワーク接続を確認してください。');document.head.append(script);
function tick(){if(ready){if(!cued&&!scrubbing)seconds=ended?video.duration:player.getCurrentTime();render()}requestAnimationFrame(tick)}
requestAnimationFrame(tick);
