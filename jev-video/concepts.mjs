import kuromoji from 'kuromoji';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { askJev, MAX_CHOICES } from './core.mjs';
import { conceptGraph, CATEGORIES } from './public/model.js';
const require=createRequire(import.meta.url);
const tokenizer=await new Promise((resolve,reject)=>kuromoji.builder({dicPath:join(dirname(require.resolve('kuromoji/package.json')),'dict')}).build((error,value)=>error?reject(error):resolve(value)));
export function candidates(text) {
  const result=new Set();let phrase='';
  const flush=()=>{if(phrase)result.add(phrase.trim());phrase=''};
  for(const token of tokenizer.tokenize(text)) {
    if(token.pos==='名詞' && !['非自立','代名詞','数','接尾','形容動詞語幹'].includes(token.pos_detail_1)) phrase+=token.surface_form;
    else if(token.pos_detail_1==='空白' && phrase) continue;
    else if(token.surface_form==='の' && phrase) phrase+='の';
    else {phrase=phrase.replace(/の$/,'');flush()}
  }
  phrase=phrase.replace(/の$/,'');flush();
  return [...result].filter(Boolean);
}
export const EDGE_LABELS={
  improves:'高める', requires:'必要とする', enables:'可能にする', part:'一部である',
  contrasts:'対比', uses:'使う', limits:'制約する', produces:'生み出す', detects:'検出する', validates:'検証する', automates:'自動化する', manages:'管理する',
};
export async function analyzeConcepts(cue,japanese,previous) {
  const graph=conceptGraph(previous);
  const extracted=candidates(japanese);
  const concepts=[], edges=[];
  let latencyMs=0,inputTokens=0,model='jev-1.13.0';
  const ask=async(state,questions)=>{
    const r=await askJev(state,questions);latencyMs+=r.latencyMs;inputTokens+=r.usage.input_tokens;model=r.model;return r.answers;
  };
  const context={previous:previous.at(-1)?.japanese??'',current:japanese};
  if(!extracted.length) return {...cue,japanese,concepts,edges,latencyMs,inputTokens,model};
  const selected=await ask(context,Object.fromEntries(extracted.map((label,i)=>[`p${i}`,{
    type:'choice',instructions:`「${label}」は、この説明を理解するために図の独立した概念にする必要がありますか。技術・方法・品質・目標・問題などの意味のある概念を残してください。挨拶、相づち、漠然とした代名詞や一般語、単なる登場人物・SNS名は省いてください。「検出」「改善」など単独の動作は線の意味であり概念ノードではありません。発言そのものをノードにしないでください。指定した語句の採用・省略だけを判定してください。`,criteria:{keep:'エージェント活用・ソフトウェア開発の内容を説明する重要な技術概念。主題の理解に必要な用語。',omit:'前置き、挨拶、会話の紹介、ポッドキャスト自体、付随情報、単独の動作や抽象的すぎる語。図には載せない。'}
  }])));
  for(const [i,label] of extracted.entries()) {
    if(selected[`p${i}`].choice!=='keep') continue;
    let match;
    const known=[...graph.nodes,...concepts.filter(c=>!graph.nodes.some(n=>n.id===c.id))];
    // Search every existing concept, including the opening, in API-sized batches.
    const exact=known.find(n=>n.label===label);
    if(exact) match={choice:exact.id,confidence:1};
    for(let offset=0;!exact && offset<known.length;offset+=MAX_CHOICES-1) {
      const batch=known.slice(offset,offset+MAX_CHOICES-1);
      const answer=(await ask({...context,phrase:label},{match:{type:'choice',instructions:'state.phraseが表す概念と同じ意味の既存概念を選んでください。state.previousの話題を選ぶのではありません。言い換え、略称、英語と日本語、文脈上同じものは既存概念へ統合します。単なる関連概念や上位下位概念は同一ではありません。noneは本当に新しい概念のときだけ。',criteria:{none:'同じ概念はない',...Object.fromEntries(batch.map(n=>[n.id,n.label]))}}})).match;
      if(answer.choice!=='none' && (!match || answer.confidence>match.confidence)) match=answer;
    }
    const category=match?null:(await ask({...context,phrase:label},{category:{type:'choice',instructions:'phraseが表す概念は、話を整理するときどのカテゴリに分類しますか。current全体ではなく指定した概念を分類してください。',criteria:CATEGORIES}})).category.choice;
    const concept=match?known.find(n=>n.id===match.choice):{id:`c${cue.id}_${i}`,label,category};
    if(!concepts.some(c=>c.id===concept.id)) concepts.push({id:concept.id,label:concept.label,category:concept.category});
  }
  const questions={};const pairs={};
  for(let i=0;i<concepts.length;i++)for(let j=i+1;j<concepts.length;j++) {
    const a=concepts[i],b=concepts[j],id=`pair${i}_${j}`;pairs[id]=[a,b];
    questions[id]={type:'choice',instructions:`今の発言は「${a.label}」と「${b.label}」の間にどの直接的な関係を述べていますか。同じ文に出ただけでは線を引きません。既存知識から補完せず、発言で主張されたものだけ。fは${a.label}から${b.label}、rは逆向き。`,criteria:{none:'直接の関係は述べていない',...Object.fromEntries(Object.entries(EDGE_LABELS).flatMap(([key,value])=>[[`f_${key}`,`${a.label}が${b.label}を${value}`],[`r_${key}`,`${b.label}が${a.label}を${value}`]]))}};
  }
  if(Object.keys(questions).length) {
    const direct=await ask(context,Object.fromEntries(Object.entries(pairs).map(([id,[a,b]])=>[id,{type:'choice',instructions:`currentは「${a.label}」と「${b.label}」の間の因果・使用・必要条件・包含などの直接的関係を実際に主張していますか。単に話題を列挙したり同じ発言に登場するだけならno。一般常識での補完は禁止。`,criteria:{yes:'発言が両者の関係を明示している',no:'両者の直接的な関係はこの発言で説明されていない'}}])));
    const grounded=Object.fromEntries(Object.entries(questions).filter(([id])=>direct[id].choice==='yes'));
    const answers=Object.keys(grounded).length?await ask(context,grounded):{};
    for(const [key,answer] of Object.entries(answers)) {
      if(answer.choice==='none')continue;
      const [direction,relation]=answer.choice.split('_');
      let [source,target]=pairs[key];if(direction==='r')[source,target]=[target,source];
      if(relation==='contrasts' && source.id>target.id)[source,target]=[target,source];
      const id=`${source.id}:${relation}:${target.id}`;
      edges.push({id,source:source.id,target:target.id,relation,label:EDGE_LABELS[relation],confidence:answer.confidence});
    }
  }
  return {...cue,japanese,concepts,edges,latencyMs,inputTokens,model};
}
