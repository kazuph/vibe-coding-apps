import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { VIDEO_ID, parseTranscript } from './core.mjs';
const path=process.argv[2];
if(!path) throw new Error('使い方: node import-transcript.mjs <時刻付き英語字幕.txt または .json3>');
let text=await readFile(path,'utf8');
if(path.endsWith('.json3')) {
  const data=JSON.parse(text);
  text=`YouTube transcript\nVideo ID: ${VIDEO_ID}\nLanguage: en\n\n`+(data.events??[]).filter(e=>e.segs?.some(s=>s.utf8.trim())).map(e=>{
    const time=Math.floor(e.tStartMs/1000);
    return `[${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}] ${e.segs.map(s=>s.utf8).join('').replace(/\n/g,' ')}`;
  }).join('\n');
}
if(!text.includes(`Video ID: ${VIDEO_ID}`)) throw new Error('対象動画のIDが字幕ヘッダーと一致しません。');
if(!text.includes('Language: en')) throw new Error('英語字幕を指定してください。');
const cues=parseTranscript(text);
await mkdir(new URL('./data/',import.meta.url),{recursive:true});
await writeFile(new URL(`./data/${VIDEO_ID}.en.txt`,import.meta.url),text);
console.log(`${VIDEO_ID}: ${cues.length}文を取り込みました。サーバーを起動してください。`);
