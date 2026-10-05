import { createHash } from 'node:crypto';

export const VIDEO_ID = 'MN9dGgmLyso';
export const VIDEO_TITLE = "Poteto × Matt Pocock — AIエージェントとソフトウェア開発";
export const VIDEO_DURATION = 3936; // YouTube videoDetails.lengthSeconds
export const MAX_CHOICES = 255; // https://docs.typesafe.ai/api
export function parseTranscript(text) {
  const rows = [...text.matchAll(/^\[(\d+:\d+(?::\d+)?)\]\s+(.+)$/gm)].map(m => ({
    start: m[1].split(':').reduce((s, n) => s * 60 + Number(n), 0),
    text: m[2].replace(/>>\s*/g, '').trim(),
  }));
  if (!rows.length) throw new Error('時刻付きのYouTube文字起こしが見つかりません。');
  if (rows.some((r, i) => i && r.start < rows[i - 1].start)) throw new Error('字幕の時刻が逆順です。');
  // Join caption fragments before sentence segmentation; retain the original time mapping.
  let joined = '';
  const spans = rows.map((r, i) => {
    const offset = joined.length;
    joined += `${r.text} `;
    return { ...r, offset, end: joined.length, spokenEnd: rows[i + 1]?.start ?? VIDEO_DURATION };
  });
  return [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(joined)].map((s, id) => {
    const first = spans.find(r => r.end > s.index);
    const last = spans.findLast(r => r.offset < s.index + s.segment.trimEnd().length);
    return { id, start: first.start, end: last.spokenEnd, text: s.segment.trim() };
  }).filter(s => s.text);
}

export function fingerprint(text) { return createHash('sha256').update(text).digest('hex'); }
export async function askJev(state, questions) {
  if (!process.env.JEV_API_KEY) throw new Error('サーバーの .env に JEV_API_KEY を設定してください。');
  const started = performance.now();
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.JEV_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-1.13.0', state, questions }),
  });
  if (!response.ok) throw new Error(`jev が HTTP ${response.status} を返しました。解析を停止しました。時間を置いて再開してください。`);
  const result = await response.json();
  for (const [name, question] of Object.entries(questions)) {
    if (!Object.hasOwn(question.criteria, result.answers?.[name]?.choice)) throw new Error('jev の応答が指定した選択肢に一致しません。');
  }
  return { ...result, latencyMs: Math.round(performance.now() - started) };
}
