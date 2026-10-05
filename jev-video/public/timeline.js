export function visibleAt(records, seconds) { return records.filter(r => r.end <= seconds); }
export function nextPending(cues, records, seconds) { return cues.find(c => c.end <= seconds && !records.has(c.id)); }
export function clock(seconds) {
  const n = Math.max(0, Math.floor(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
