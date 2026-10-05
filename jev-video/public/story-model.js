export function storyAt(story,seconds) {
  const events=story.events.filter(e=>e.at<=seconds);
  const topics=Object.fromEntries(story.topics.map(t=>[t.id,{nodes:new Set(),edges:new Set(),events:[]}]));
  for(const event of events){const t=topics[event.topic];event.show.forEach(id=>t.nodes.add(id));event.connect.forEach(id=>t.edges.add(id));t.events.push(event)}
  return {topics,current:events.at(-1)??null};
}
