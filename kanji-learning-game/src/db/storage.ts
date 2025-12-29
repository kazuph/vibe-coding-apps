// LocalStorage ベースのシンプルな永続化

const STORAGE_KEY = 'kanji-game-progress';

export interface KanjiProgress {
  correctCount: number;
  starCount: number;
  completed: boolean;
  attemptCount: number;
  lastAttempted?: string;
}

export interface StorageData {
  progress: Record<string, Record<string, KanjiProgress>>; // gradeGroup -> kanji -> progress
  achievements: Record<string, { completedAt?: string; totalStars: number }>;
}

function loadData(): StorageData {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load data:', e);
  }
  return { progress: {}, achievements: {} };
}

function saveData(data: StorageData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save data:', e);
  }
}

export function getKanjiProgress(gradeGroup: string, kanji: string): KanjiProgress | null {
  const data = loadData();
  return data.progress[gradeGroup]?.[kanji] || null;
}

export function updateKanjiProgress(
  kanji: string,
  gradeGroup: string,
  isCorrect: boolean
): void {
  const data = loadData();

  if (!data.progress[gradeGroup]) {
    data.progress[gradeGroup] = {};
  }

  const existing = data.progress[gradeGroup][kanji] || {
    correctCount: 0,
    starCount: 0,
    completed: false,
    attemptCount: 0,
  };

  const newCorrectCount = existing.correctCount + (isCorrect ? 1 : 0);
  const newCompleted = newCorrectCount >= 3;
  const newStarCount = newCompleted && isCorrect
    ? Math.min(existing.starCount + 1, 10)
    : existing.starCount;

  data.progress[gradeGroup][kanji] = {
    correctCount: newCorrectCount,
    starCount: newStarCount,
    completed: newCompleted,
    attemptCount: (existing.attemptCount || 0) + 1,
    lastAttempted: new Date().toISOString(),
  };

  saveData(data);
}

export function getAllKanjiWithProgress(gradeGroup: string): Map<string, KanjiProgress> {
  const data = loadData();
  const map = new Map<string, KanjiProgress>();

  const gradeProgress = data.progress[gradeGroup] || {};
  for (const [kanji, progress] of Object.entries(gradeProgress)) {
    map.set(kanji, progress);
  }

  return map;
}

export function getGradeGroupProgress(gradeGroup: string): {
  completedKanji: number;
  totalStars: number;
} {
  const data = loadData();
  const gradeProgress = data.progress[gradeGroup] || {};

  let completedKanji = 0;
  let totalStars = 0;

  for (const progress of Object.values(gradeProgress)) {
    if (progress.completed) completedKanji++;
    totalStars += progress.starCount;
  }

  return { completedKanji, totalStars };
}

export function resetProgress(): void {
  localStorage.removeItem(STORAGE_KEY);
}
