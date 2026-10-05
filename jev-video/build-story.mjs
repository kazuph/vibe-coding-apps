import {readFile,writeFile} from 'node:fs/promises';
import {topics,events} from './story-source.mjs';
import {parseTranscript,fingerprint,VIDEO_ID,VIDEO_DURATION} from './core.mjs';
const source=await readFile(`data/${VIDEO_ID}.en.txt`,'utf8');
const cues=parseTranscript(source);
const compiled=events.map((event,id)=>({...event,id,at:Math.max(...event.refs.map(ref=>cues[ref].end)),sourceRange:{start:Math.min(...event.refs.map(ref=>cues[ref].start)),end:Math.max(...event.refs.map(ref=>cues[ref].end))}}));
for(let i=1;i<compiled.length;i++)if(compiled[i].at<compiled[i-1].at)throw new Error(`事件順序: ${i}`);
await writeFile('public/story.json',JSON.stringify({videoId:VIDEO_ID,duration:VIDEO_DURATION,sourceFingerprint:fingerprint(source),author:'Codex',topics,events:compiled},null,2)+'\n');
console.log(`${topics.length} topics / ${compiled.length} timed explanations compiled from ${cues.length} source cues`);
