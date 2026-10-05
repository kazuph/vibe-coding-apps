export const CATEGORIES = { tools:'技術・ツール', quality:'品質・検証', workflow:'開発フロー', organization:'組織・役割', outcomes:'目標・成果', principles:'考え方・原則', constraints:'課題・制約' };
export function conceptGraph(records, seconds = Infinity) {
  const nodes = new Map(), edges = new Map();
  for (const record of [...records].sort((a,b)=>a.id-b.id)) {
    if(record.end > seconds) continue;
    for(const concept of record.concepts) {
      if(!nodes.has(concept.id)) nodes.set(concept.id,{...concept,evidence:[]});
      nodes.get(concept.id).evidence.push(record.id);
    }
    for(const edge of record.edges) {
      if(!edges.has(edge.id)) edges.set(edge.id,{...edge,evidence:[]});
      edges.get(edge.id).evidence.push(record.id);
    }
  }
  return {nodes:[...nodes.values()],edges:[...edges.values()]};
}
