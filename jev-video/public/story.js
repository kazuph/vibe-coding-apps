import {storyAt} from './story-model.js';
import {clock} from './timeline.js';
const $=id=>document.getElementById(id);
const story=await fetch('/api/story').then(r=>{if(!r.ok)throw Error('図解データを読み込めませんでした');return r.json()});
const savedKey='authored-story:'+story.sourceFingerprint;
const requested=new URL(location.href).searchParams.get('t');
let seconds=Math.max(0,Math.min(story.duration,Number(requested??localStorage.getItem(savedKey)??0)||0));
let player,ready=false,cued=true,scrubbing=false,ended=false,topicId=story.topics[0].id,shown='',selectedEvent=null;
const graph=cytoscape({container:$('story-graph'),userZoomingEnabled:true,userPanningEnabled:true,boxSelectionEnabled:false,autoungrabify:true,style:[
 {selector:'node',style:{label:'data(label)',width:210,height:80,'background-color':'#fff','border-width':2,'border-color':'#b7cbd0','shape':'round-rectangle','text-wrap':'wrap','text-max-width':195,'font-size':20,'font-family':'sans-serif','text-valign':'center','color':'#173847'}},
 {selector:'edge',style:{label:'data(label)','curve-style':'bezier','target-arrow-shape':'triangle','width':2,'line-color':'#819aa4','target-arrow-color':'#819aa4','font-size':14,'color':'#385f6e','text-background-opacity':1,'text-background-color':'#f6f5f1','text-background-padding':5}},
 {selector:'.category',style:{'background-opacity':0,'border-width':0,'font-size':24,'font-weight':'bold',width:810,height:50,'text-max-width':810}},
 {selector:'.bridge',style:{'line-style':'dashed','font-size':16}},
 {selector:'.future',style:{visibility:'hidden'}},
 {selector:'.fresh',style:{'border-color':'#117b85','background-color':'#e5f4f1','line-color':'#117b85','target-arrow-color':'#117b85'}},
]});
// All categories share one permanent coordinate system; playback never changes the camera.
const nid=(topic,id)=>`${topic}:${id}`;
const origins=Object.fromEntries(story.topics.map((t,i)=>[t.id,{x:(i%2)*1040,y:Math.floor(i/2)*620}]));
for(const topic of story.topics){
 const origin=origins[topic.id];
 graph.add({data:{id:`title:${topic.id}`,label:topic.name,topic:topic.id},position:{x:origin.x+450,y:origin.y+35},classes:'category'});
 graph.add(topic.nodes.map(n=>({data:{id:nid(topic.id,n.id),localId:n.id,topic:topic.id,label:n.label},position:{x:origin.x+n.x,y:origin.y+n.y}})));
 graph.add(topic.edges.map(e=>({data:{...e,id:nid(topic.id,e.id),source:nid(topic.id,e.source),target:nid(topic.id,e.target),localId:e.id,topic:topic.id}})));
}
const bridges=[
 ['intent:intent','kitchen:human','人が完成像を決める'],
 ['kitchen:craft','verification:observe','品質を実動作で確かめる'],
 ['intent:skill','determinism:work','手順の中身を分ける'],
 ['verification:correct','constraints:failure','繰り返す失敗を環境へ戻す'],
 ['constraints:capacity','loops:workers','任せられる仕事を広げる'],
 ['loops:result','review:sample','成果を観測する'],
 ['review:verify','limits:checkable','任せ方の境界を決める'],
];
graph.add(bridges.map(([source,target,label],i)=>({data:{id:`bridge:${i}`,source,target,label},classes:'bridge'})));
function sizeGraph(){graph.resize()}
new ResizeObserver(sizeGraph).observe($('story-graph'));
graph.zoom(1);graph.pan({x:24,y:24});
function moveToTopic(id){const o=origins[id];graph.pan({x:graph.width()/2-(o.x+450)*graph.zoom(),y:graph.height()/2-(o.y+250)*graph.zoom()})}
$('overview').onclick=()=>graph.fit(graph.elements().filter(e=>!e.hasClass('future')),32);
$('readable').onclick=()=>{graph.zoom(1);moveToTopic(topicId)};
const navHeading=document.createElement('p');navHeading.textContent='話の構造';$('topics').append(navHeading);
for(const [index,topic] of story.topics.entries()){
 const button=document.createElement('button');button.dataset.topic=topic.id;button.innerHTML='<span></span><small></small>';button.firstChild.textContent=topic.name;
 button.onclick=()=>{topicId=topic.id;$('follow-story').checked=false;shown='';render();moveToTopic(topic.id)};$('topics').append(button);
}
function render(){
 $('position').value=seconds;$('clock').textContent=`${clock(seconds)} / ${clock(story.duration)}`;
 const state=storyAt(story,seconds);
 const key=`${state.current?.id??-1}:${topicId}:${$('follow-story').checked}`;
 if(key===shown)return;
 if($('follow-story').checked&&state.current)topicId=state.current.topic;
 const topic=story.topics.find(t=>t.id===topicId),visible=state.topics[topicId];
 selectedEvent=visible.events.at(-1)??null;
 graph.batch(()=>{
  graph.nodes().forEach(n=>{const t=state.topics[n.data('topic')];n.toggleClass('future',n.hasClass('category')?t.nodes.size===0:!t.nodes.has(n.data('localId')))});
  graph.edges().not('.bridge').forEach(e=>e.toggleClass('future',!state.topics[e.data('topic')].edges.has(e.data('localId'))));
  graph.edges('.bridge').forEach(e=>e.toggleClass('future',e.source().hasClass('future')||e.target().hasClass('future')));
  graph.elements().removeClass('fresh');
  for(const id of [...selectedEvent?.show??[],...selectedEvent?.connect??[]])graph.getElementById(nid(topicId,id)).addClass('fresh');
 });
 $('topics').querySelectorAll('button').forEach(button=>{const t=state.topics[button.dataset.topic];button.classList.toggle('active',button.dataset.topic===topicId);button.setAttribute('aria-current',button.dataset.topic===topicId?'true':'false');button.lastChild.textContent=t.events.length?`${t.events.length} 回の説明`:'これから登場'});
 $('topic-number').textContent=`${story.topics.indexOf(topic)+1} / ${story.topics.length}　${topic.name}`;
 $('topic-title').textContent='任せられる開発の条件';$('question').textContent='1枚の図に知識を積み重ねる · ドラッグで移動／ホイールで拡大縮小';
 $('summary').textContent=selectedEvent?.summary??'再生すると、発言に合わせてこの図に要素が加わります。';
 $('note').textContent=selectedEvent?.note??'';$('note').hidden=!selectedEvent?.note;
 $('change-kind').textContent=selectedEvent?`${clock(selectedEvent.at)}　${selectedEvent.show.length?'図に追加':selectedEvent.connect.length?'関係を追加':'同じ図を補強'}`:'導入';
 $('waiting').hidden=Object.values(state.topics).some(t=>t.nodes.size>0);$('evidence-toggle').disabled=!selectedEvent;
 $('milestone-count').textContent=`${state.current?state.current.id+1:0} / ${story.events.length} の説明`;
 $('previous').disabled=!state.current;$('next').disabled=state.current?.id===story.events.at(-1).id;
 $('story-graph').setAttribute('aria-label',`再生位置までの累積図解：${Object.values(state.topics).reduce((n,t)=>n+t.nodes.size,0)}要素`);
 $('story-graph').dataset.frame=JSON.stringify({topic:topicId,event:selectedEvent?.id??null,nodes:graph.nodes().not('.category').filter(n=>!n.hasClass('future')).map(n=>n.id()),edges:graph.edges().filter(e=>!e.hasClass('future')).map(e=>e.id()),positions:graph.nodes().map(n=>({id:n.id(),...n.position()})),fontPixels:20*graph.zoom(),pan:graph.pan(),zoom:graph.zoom()});
 if(!$('source-panel').hidden)renderSource();
 localStorage.setItem(savedKey,String(Math.floor(seconds)));
 shown=`${state.current?.id??-1}:${topicId}:${$('follow-story').checked}`;
}
function renderSource(){
 const container=$('source-content');container.replaceChildren();if(!selectedEvent)return;
 const lead=document.createElement('p');lead.textContent='英語自動字幕を基に、日本語の説明と図を事前編集しています。固有名詞には字幕の誤認識が含まれます。';container.append(lead);
 for(const id of selectedEvent.refs){const cue=story.sources[id];if(!cue)continue;const section=document.createElement('section'),button=document.createElement('button'),text=document.createElement('p');button.textContent=`${clock(cue.start)} の発言から再生位置を合わせる`;button.onclick=()=>seek(cue.start);text.textContent=cue.text;section.append(button,text);container.append(section)}
}
function seek(time){seconds=Math.max(0,Math.min(story.duration,time));ended=false;scrubbing=false;if(ready){if(cued){$('play').disabled=true;player.cueVideoById({videoId:story.videoId,startSeconds:seconds})}else player.seekTo(seconds,true)}render();localStorage.setItem(savedKey,String(seconds))}
$('position').max=story.duration;
$('position').oninput=()=>{scrubbing=true;seconds=Number($('position').value);render()};$('position').onchange=()=>seek(Number($('position').value));
$('previous').onclick=()=>{const candidates=story.events.filter(e=>e.at<seconds);seek(candidates.at(-1)?.at??0)};
$('next').onclick=()=>seek(story.events.find(e=>e.at>seconds)?.at??story.duration);
$('follow-story').onchange=()=>{shown='';render()};
$('play').onclick=()=>{if(ready){if(player.getPlayerState()===YT.PlayerState.PLAYING)player.pauseVideo();else player.playVideo()}};
$('speed').onchange=()=>{if(ready)player.setPlaybackRate(Number($('speed').value))};
$('video-toggle').onclick=()=>{const open=$('video-panel').hidden;$('video-panel').hidden=!open;$('video-toggle').textContent=open?'動画を閉じる':'動画を表示';$('video-toggle').setAttribute('aria-expanded',String(open))};
$('evidence-toggle').onclick=()=>{$('source-panel').hidden=false;$('evidence-toggle').setAttribute('aria-expanded','true');renderSource()};
$('source-close').onclick=()=>{$('source-panel').hidden=true;$('evidence-toggle').setAttribute('aria-expanded','false')};
graph.on('tap','node',event=>{const node=event.target;if(node.hasClass('category'))return;const related=storyAt(story,seconds).topics[node.data('topic')].events.filter(e=>e.show.includes(node.data('localId')));if(related.length){selectedEvent=related.at(-1);$('source-panel').hidden=false;renderSource()}});
window.onYouTubeIframeAPIReady=()=>{player=new YT.Player('player',{videoId:story.videoId,host:'https://www.youtube-nocookie.com',playerVars:{origin:location.origin,autoplay:0,playsinline:1,start:Math.floor(seconds)},events:{
 onReady(){player.mute();ready=true;$('play').disabled=false;render()},
 onStateChange(e){if(e.data===YT.PlayerState.CUED)$('play').disabled=false;if(e.data===YT.PlayerState.PLAYING)cued=false;ended=e.data===YT.PlayerState.ENDED;$('play').textContent=e.data===YT.PlayerState.PLAYING?'一時停止':'再生'},
 onError(e){$('error').hidden=false;$('error').textContent=`動画の再生エラー（${e.data}）。図解はバーや前後ボタンで閲覧できます。`}
}})};
const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';document.head.append(script);
function tick(){if(ready&&!cued&&!scrubbing){seconds=ended?story.duration:player.getCurrentTime()}render();requestAnimationFrame(tick)}
render();requestAnimationFrame(tick);
