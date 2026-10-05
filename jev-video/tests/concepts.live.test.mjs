import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { analyzeConcepts } from '../concepts.mjs';
import { conceptGraph, CATEGORIES } from '../public/model.js';

test('実Jev: 冒頭と最後の同義概念・同じ関係を重複追加せず根拠だけ補強する',async()=>{
  const first=await analyzeConcepts({id:0,start:0,end:10,text:'AI agents improve software quality.'},'AIエージェントはソフトウェアの品質を高めます。',[]);
  const middle=await analyzeConcepts({id:200,start:2000,end:2010,text:'Automated tests detect bugs.'},'自動テストは不具合を検出します。',[first]);
  const last=await analyzeConcepts({id:496,start:3900,end:3910,text:'Software quality improves thanks to agents.'},'エージェントによってソフトウェアの品質が高まります。',[first,middle]);
  const before=conceptGraph([first,middle]);const after=conceptGraph([first,middle,last]);
  await mkdir('.data',{recursive:true});await writeFile('.data/concept-live-evidence.json',JSON.stringify({first,middle,last,before,after},null,2));
  assert.ok(after.nodes.every(n=>Object.hasOwn(CATEGORIES,n.category)),'すべての概念をカテゴリへ分類する');
  assert.ok(first.concepts.length>=2,'具体的な主語と対象を概念として抽出する');
  assert.ok(first.edges.length>0,'発言で示された改善関係を抽出する');
  assert.equal(after.nodes.length,before.nodes.length,'再言及で概念を増やさない');
  assert.equal(after.edges.length,before.edges.length,'同じ主張で線を増やさない');
  assert.ok(after.nodes.filter(n=>n.evidence.includes(496)).every(n=>n.evidence.includes(0)),'最後の発言は冒頭の概念を補強する');
  assert.ok(after.edges.some(e=>e.evidence.includes(0)&&e.evidence.includes(496)),'同じ関係の根拠を補強する');
  assert.deepEqual(conceptGraph([first,middle,last],2010),before,'巻き戻しで将来の補強も取り除く');
  console.log(JSON.stringify({beforeNodes:before.nodes.length,afterNodes:after.nodes.length,beforeEdges:before.edges.length,afterEdges:after.edges.length,nodes:after.nodes.map(n=>({label:n.label,evidence:n.evidence})),edges:after.edges}));
});
