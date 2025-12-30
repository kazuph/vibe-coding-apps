/**
 * ストレージ層 - DuckDB-wasm with OPFS を使用
 * 互換性のためにlocalStorageフォールバックも用意
 */

import {
  initDatabase,
  getKanjiProgress as duckdbGetProgress,
  updateKanjiProgress as duckdbUpdateProgress,
  getAllKanjiWithProgress as duckdbGetAllProgress,
  getGradeGroupProgress as duckdbGetGradeProgress,
  resetProgress as duckdbResetProgress,
  isUsingOpfsPersistence,
  type KanjiProgress,
} from './duckdb';

export type { KanjiProgress };

// 初期化状態
let initialized = false;
let initError: Error | null = null;

/**
 * ストレージを初期化
 */
export async function initStorage(): Promise<void> {
  if (initialized) return;

  try {
    await initDatabase();
    initialized = true;
    console.log('[Storage] Initialized with DuckDB, OPFS:', isUsingOpfsPersistence());
  } catch (error) {
    console.error('[Storage] DuckDB init failed:', error);
    initError = error as Error;
    throw error;
  }
}

/**
 * 初期化済みかどうか
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * 初期化エラーがあるかどうか
 */
export function getInitError(): Error | null {
  return initError;
}

/**
 * OPFSで永続化されているかどうか
 */
export function isPersistent(): boolean {
  return isUsingOpfsPersistence();
}

/**
 * 漢字の進捗を取得
 */
export async function getKanjiProgress(
  gradeGroup: string,
  kanji: string
): Promise<KanjiProgress | null> {
  await initStorage();
  return duckdbGetProgress(gradeGroup, kanji);
}

/**
 * 漢字の進捗を更新
 */
export async function updateKanjiProgress(
  kanji: string,
  gradeGroup: string,
  isCorrect: boolean
): Promise<void> {
  await initStorage();
  return duckdbUpdateProgress(kanji, gradeGroup, isCorrect);
}

/**
 * 学年グループの全漢字進捗を取得
 */
export async function getAllKanjiWithProgress(
  gradeGroup: string
): Promise<Map<string, KanjiProgress>> {
  await initStorage();
  return duckdbGetAllProgress(gradeGroup);
}

/**
 * 学年グループの進捗サマリーを取得
 */
export async function getGradeGroupProgress(gradeGroup: string): Promise<{
  completedKanji: number;
  totalStars: number;
}> {
  await initStorage();
  return duckdbGetGradeProgress(gradeGroup);
}

/**
 * 進捗をリセット
 */
export async function resetProgress(): Promise<void> {
  await initStorage();
  return duckdbResetProgress();
}
