import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseTranscript, fingerprint } from '../core.mjs';
import { visibleAt, nextPending } from '../public/timeline.js';
const source = await readFile(new URL('../data/MN9dGgmLyso.en.txt', import.meta.url), 'utf8');
const cues = parseTranscript(source);

test('実動画の字幕を文単位に分割し、原文と時刻を保持する', () => {
  assert.equal(cues.length,497);
  assert.equal(cues[0].text,'So, hello folks.');
  assert.equal(cues[0].start,0);
  assert.equal(cues[0].end,2);
  for (const [i,c] of cues.entries()) {
    assert.equal(c.id,i); assert.ok(c.start<=c.end);
    if(i) assert.ok(c.start>=cues[i-1].start);
  }
  const original = [...source.matchAll(/^\[.*?\]\s+(.+)$/gm)].map(m=>m[1].replace(/>>\s*/g,'')).join(' ').replace(/\s+/g,' ').trim();
  assert.equal(cues.map(c=>c.text).join(' ').replace(/\s+/g,' ').trim(),original);
});
test('全時刻のシークで未来の文章を表示せず、往復して同じ集合に戻る',()=>{
  for(const c of cues) {
    const at=visibleAt(cues,c.end);
    assert.ok(at.every(r=>r.end<=c.end));
    assert.ok(at.some(r=>r.id===c.id));
    assert.ok(!visibleAt(cues,c.end-Number.EPSILON*c.end*2).some(r=>r.id===c.id));
    const saved=new Map(at.map(r=>[r.id,r]));
    assert.equal(nextPending(cues,saved,c.end),undefined);
    assert.deepEqual(visibleAt(cues,c.end),at);
  }
});
test('字幕改訂で保存キーが変わる',()=>{
  assert.notEqual(fingerprint(source),fingerprint(source+'changed'));

});
test('壊れた字幕を受け付けない',()=>{
  assert.throws(()=>parseTranscript('invalid'));
  assert.throws(()=>parseTranscript('[1:00] Later.\n[0:00] Earlier.'));
});
