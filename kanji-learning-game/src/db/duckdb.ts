/**
 * DuckDB-wasm with OPFS persistence
 * 公式の定石に従った実装
 */
import * as duckdb from '@duckdb/duckdb-wasm';

// シングルトンインスタンス
let db: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;
let isUsingOpfs = false;

/**
 * OPFSがサポートされているかチェック
 */
export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'storage' in navigator &&
    'getDirectory' in navigator.storage
  );
}

/**
 * DuckDBを初期化（シングルトン）
 */
export async function initDatabase(): Promise<duckdb.AsyncDuckDB> {
  // 既に初期化済みならそれを返す
  if (db) return db;

  // 初期化中なら待機
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log('[DuckDB] Initializing...');

    const opfsSupported = isOpfsSupported();
    console.log('[DuckDB] OPFS supported:', opfsSupported);

    try {
      // バンドル設定
      const basePath = import.meta.env.BASE_URL || '/';
      const mainModuleURL = `${basePath}duckdb-eh.wasm`;
      const mainWorkerURL = `${basePath}duckdb-browser-eh.worker.js`;

      // Worker作成
      const worker = new Worker(mainWorkerURL);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);

      // AsyncDuckDB インスタンス作成
      db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(mainModuleURL);
      console.log('[DuckDB] Instantiated');

      // OPFSで永続化を試みる
      if (opfsSupported) {
        try {
          console.log('[DuckDB] Attempting OPFS persistence...');
          await db.open({
            path: 'opfs://kanji-game.db',
            accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
          });
          isUsingOpfs = true;
          console.log('[DuckDB] OPFS database opened successfully');
        } catch (opfsError) {
          console.warn('[DuckDB] OPFS failed, falling back to in-memory:', opfsError);
          await db.open({ path: ':memory:' });
          isUsingOpfs = false;
        }
      } else {
        console.log('[DuckDB] OPFS not supported, using in-memory');
        await db.open({ path: ':memory:' });
        isUsingOpfs = false;
      }

      // スキーマ作成
      await createSchema();
      console.log('[DuckDB] Schema created');

      return db;
    } catch (error) {
      console.error('[DuckDB] Initialization failed:', error);
      db = null;
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * 現在OPFSを使用しているかどうか
 */
export function isUsingOpfsPersistence(): boolean {
  return isUsingOpfs;
}

/**
 * スキーマ作成
 */
async function createSchema(): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  const conn = await db.connect();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS kanji_progress (
        grade_group VARCHAR NOT NULL,
        kanji VARCHAR NOT NULL,
        correct_count INTEGER DEFAULT 0,
        star_count INTEGER DEFAULT 0,
        completed BOOLEAN DEFAULT FALSE,
        attempt_count INTEGER DEFAULT 0,
        last_attempted TIMESTAMP,
        PRIMARY KEY (grade_group, kanji)
      )
    `);
  } finally {
    await conn.close();
  }
}

/**
 * 漢字の進捗を取得
 */
export async function getKanjiProgress(
  gradeGroup: string,
  kanji: string
): Promise<KanjiProgress | null> {
  const database = await initDatabase();
  const conn = await database.connect();

  try {
    // Prepared statementを使用
    const stmt = await conn.prepare(`
      SELECT correct_count, star_count, completed, attempt_count, last_attempted
      FROM kanji_progress
      WHERE grade_group = ? AND kanji = ?
    `);
    const result = await stmt.query(gradeGroup, kanji);
    await stmt.close();

    const rows = result.toArray();
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      correctCount: Number(row.correct_count),
      starCount: Number(row.star_count),
      completed: Boolean(row.completed),
      attemptCount: Number(row.attempt_count),
      lastAttempted: row.last_attempted ? String(row.last_attempted) : undefined,
    };
  } finally {
    await conn.close();
  }
}

/**
 * 漢字の進捗を更新
 */
export async function updateKanjiProgress(
  kanji: string,
  gradeGroup: string,
  isCorrect: boolean
): Promise<void> {
  const database = await initDatabase();
  const conn = await database.connect();

  try {
    // 既存データを取得
    const existing = await getKanjiProgress(gradeGroup, kanji);

    const currentCorrect = existing?.correctCount ?? 0;
    const currentStar = existing?.starCount ?? 0;
    const currentAttempt = existing?.attemptCount ?? 0;

    const newCorrectCount = currentCorrect + (isCorrect ? 1 : 0);
    const newCompleted = newCorrectCount >= 3;
    const newStarCount = newCompleted && isCorrect
      ? Math.min(currentStar + 1, 10)
      : currentStar;
    const newAttemptCount = currentAttempt + 1;

    // UPSERT with prepared statement
    const stmt = await conn.prepare(`
      INSERT INTO kanji_progress (grade_group, kanji, correct_count, star_count, completed, attempt_count, last_attempted)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT (grade_group, kanji) DO UPDATE SET
        correct_count = EXCLUDED.correct_count,
        star_count = EXCLUDED.star_count,
        completed = EXCLUDED.completed,
        attempt_count = EXCLUDED.attempt_count,
        last_attempted = EXCLUDED.last_attempted
    `);
    await stmt.query(gradeGroup, kanji, newCorrectCount, newStarCount, newCompleted, newAttemptCount);
    await stmt.close();

  } finally {
    await conn.close();
  }
}

/**
 * 学年グループの全漢字進捗を取得
 */
export async function getAllKanjiWithProgress(
  gradeGroup: string
): Promise<Map<string, KanjiProgress>> {
  const database = await initDatabase();
  const conn = await database.connect();

  try {
    const stmt = await conn.prepare(`
      SELECT kanji, correct_count, star_count, completed, attempt_count, last_attempted
      FROM kanji_progress
      WHERE grade_group = ?
    `);
    const result = await stmt.query(gradeGroup);
    await stmt.close();

    const map = new Map<string, KanjiProgress>();
    const rows = result.toArray();

    for (const row of rows) {
      map.set(String(row.kanji), {
        correctCount: Number(row.correct_count),
        starCount: Number(row.star_count),
        completed: Boolean(row.completed),
        attemptCount: Number(row.attempt_count),
        lastAttempted: row.last_attempted ? String(row.last_attempted) : undefined,
      });
    }

    return map;
  } finally {
    await conn.close();
  }
}

/**
 * 学年グループの進捗サマリーを取得
 */
export async function getGradeGroupProgress(gradeGroup: string): Promise<{
  completedKanji: number;
  totalStars: number;
}> {
  const database = await initDatabase();
  const conn = await database.connect();

  try {
    const stmt = await conn.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE completed = TRUE) as completed_count,
        COALESCE(SUM(star_count), 0) as total_stars
      FROM kanji_progress
      WHERE grade_group = ?
    `);
    const result = await stmt.query(gradeGroup);
    await stmt.close();

    const rows = result.toArray();
    if (rows.length === 0) {
      return { completedKanji: 0, totalStars: 0 };
    }

    const row = rows[0];
    return {
      completedKanji: Number(row.completed_count) || 0,
      totalStars: Number(row.total_stars) || 0,
    };
  } finally {
    await conn.close();
  }
}

/**
 * 進捗をリセット
 */
export async function resetProgress(): Promise<void> {
  const database = await initDatabase();
  const conn = await database.connect();

  try {
    await conn.query('DELETE FROM kanji_progress');
  } finally {
    await conn.close();
  }
}

// 型定義
export interface KanjiProgress {
  correctCount: number;
  starCount: number;
  completed: boolean;
  attemptCount: number;
  lastAttempted?: string;
}
