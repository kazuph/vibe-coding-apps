// Web Audio is started only after the player presses the start button.
let ctx, engineGain, engineFilter, engineTone, voices=new Map(), voiceWorker, activeVoice;
export function startAudio(){
 if(!ctx){
  ctx=new AudioContext();
  const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
  const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;
  engineFilter=ctx.createBiquadFilter();engineFilter.type='lowpass';engineFilter.frequency.value=450;
  engineGain=ctx.createGain();engineGain.gain.value=0;noise.connect(engineFilter).connect(engineGain).connect(ctx.destination);noise.start();
  engineTone=ctx.createOscillator();const toneGain=ctx.createGain();engineTone.type='sawtooth';engineTone.frequency.value=55;toneGain.gain.value=.12;engineTone.connect(toneGain).connect(engineGain);engineTone.start();
 }
 ctx.resume();
 if(!voiceWorker){voiceWorker=new Worker('./voice/worker.js',{type:'module'});voiceWorker.onmessage=({data})=>{if(data.key&&data.pcm){const b=ctx.createBuffer(1,data.pcm.length,data.rate);b.copyToChannel(data.pcm,0);voices.set(data.key,b)}else if(data.error)console.warn('音声合成:',data.key||'',data.error)};voiceWorker.onerror=e=>console.warn('音声合成の読み込みに失敗しました',e.message)}
}
export function updateEngine(active,speed){if(!ctx)return;const t=ctx.currentTime;engineGain.gain.setTargetAtTime(active?.018+Math.min(speed/900,1)*.035:0,t,.25);engineFilter.frequency.setTargetAtTime(350+speed*1.3,t,.3);engineTone.frequency.setTargetAtTime(45+speed*.12,t,.3)}
export function speak(key){if(!ctx)return;const buffer=voices.get(key);if(!buffer)return;if(activeVoice){try{activeVoice.stop()}catch{}}const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=1;source.connect(gain).connect(ctx.destination);source.start();activeVoice=source;source.onended=()=>{if(activeVoice===source)activeVoice=null}}
export function explosion(){if(!ctx)return;const t=ctx.currentTime,duration=2.4,buffer=ctx.createBuffer(1,ctx.sampleRate*duration,ctx.sampleRate),data=buffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
 for(const [delay,volume,cutoff] of [[0,.55,1200],[.13,.28,520],[.32,.2,260]]){const start=t+delay,noise=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();noise.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(cutoff,start);filter.frequency.exponentialRampToValueAtTime(65,start+1.6);gain.gain.setValueAtTime(volume,start);gain.gain.exponentialRampToValueAtTime(.001,start+1.8);noise.connect(filter).connect(gain).connect(ctx.destination);noise.start(start);noise.stop(start+1.8)}
 const thump=ctx.createOscillator(),bass=ctx.createGain();thump.type='sine';thump.frequency.setValueAtTime(125,t);thump.frequency.exponentialRampToValueAtTime(32,t+.45);bass.gain.setValueAtTime(.55,t);bass.gain.exponentialRampToValueAtTime(.001,t+1);thump.connect(bass).connect(ctx.destination);thump.start(t);thump.stop(t+1);
}
export function warning(){if(!ctx)return;const t=ctx.currentTime;for(let i=0;i<2;i++){const osc=ctx.createOscillator(),gain=ctx.createGain(),start=t+i*.22;osc.type='sine';osc.frequency.value=740;gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.09,start+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+.16);osc.connect(gain).connect(ctx.destination);osc.start(start);osc.stop(start+.17)}}
