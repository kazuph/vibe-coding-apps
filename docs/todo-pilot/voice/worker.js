import factory from './saan_web_w8a32.mjs';
const lines={ready:'飛べるよ',danger:'危ない',crash:'ぶつかっちゃった',land:'着陸成功',stall:'スピードが足りない、加速しよう'};
async function cachedAsset(url){
 const cache=await caches.open('todo-pilot-voice-v2');const cached=await cache.match(url);if(cached)return cached;
 const response=await fetch(url);if(response.ok)await cache.put(url,response.clone());return response;
}
async function init(){
 const [mod,modelResponse,dictResponse]=await Promise.all([factory(),cachedAsset('./student_i8.bin'),cachedAsset('./k1_dict.dat')]);
 if(!modelResponse.ok||!dictResponse.ok)throw Error('voice assets unavailable');
 const model=new Uint8Array(await modelResponse.arrayBuffer());
 const dict=new Uint8Array(await new Response(dictResponse.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 function copy(bytes){const ptr=mod._saan_web_alloc(bytes.length);if(!ptr)throw Error('voice memory unavailable');mod.HEAPU8.set(bytes,ptr);return ptr}
 const mp=copy(model),dp=copy(dict);if(mod._saan_web_init(mp,model.length,dp,dict.length)<0)throw Error('voice init failed');
 const ptr=mod._saan_web_alloc(4096),encoder=new TextEncoder();
 for(const [key,text] of Object.entries(lines)){
  const bytes=encoder.encode(text);mod.HEAPU8.set(bytes,ptr);mod.HEAPU8[ptr+bytes.length]=0;
  if(mod._saan_web_synth(ptr,bytes.length)<0){postMessage({key,error:'synthesis failed'});continue}
  const n=mod._saan_web_n_samples(),p=mod._saan_web_pcm(),rate=mod._saan_web_sample_rate();
  const pcm=mod.HEAPF32.slice(p>>2,(p>>2)+n);postMessage({key,rate,pcm},[pcm.buffer]);
 }
}
init().catch(e=>postMessage({error:String(e)}));
