import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {storyAt} from '../public/story-model.js';
const story=JSON.parse(fs.readFileSync(new URL('../public/story.json',import.meta.url)));
test('every authored relation has visible endpoints and every timestamp follows its evidence',()=>{
 let previous=0;
 for(const event of story.events){
  assert.ok(event.at>=previous);previous=event.at;assert.equal(event.at,event.sourceRange.end);
  const topic=story.topics.find(t=>t.id===event.topic),state=storyAt(story,event.at).topics[event.topic];
  for(const id of event.show)assert.ok(topic.nodes.some(n=>n.id===id));
  for(const id of state.edges){const edge=topic.edges.find(e=>e.id===id);assert.ok(edge);assert.ok(state.nodes.has(edge.source));assert.ok(state.nodes.has(edge.target))}
  assert.ok(event.refs.length>0);assert.ok(event.summary.length>0);
 }
});
test('rewinding is independent of history and repeated topics retain authored identities',()=>{
 const snapshots=story.events.map(e=>storyAt(story,e.at));
 for(let i=story.events.length-1;i>=0;i--)assert.deepEqual(storyAt(story,story.events[i].at),snapshots[i]);
 for(const topic of story.topics){const final=storyAt(story,story.duration).topics[topic.id];assert.equal(final.nodes.size,topic.nodes.length);assert.equal(final.edges.size,topic.edges.length)}
 assert.equal(storyAt(story,0).current,null);
});
