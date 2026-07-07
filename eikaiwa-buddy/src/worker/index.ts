import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { alignWords } from "../shared/alignment";
import { average, decideNextStep, nextLevel } from "../shared/levels";
import type { AttemptEvaluation, ChatMessage, Phrase, ProgressPayload, SessionPayload } from "../shared/types";
import { coach, evaluatePronunciation, regenerateTopic, synthesizeSpeech, type GeminiEnv } from "./gemini";

type Bindings = GeminiEnv & {
  DB: D1Database;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/api/*", cors({ origin: (origin) => origin || "", credentials: true }));

app.post("/api/session/start", async (c) => {
  const user = await ensureUser(c);
  let session = await getOpenSession(c.env.DB, user.id);
  if (!session) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const initial = await regenerateTopic(c.env, user.level);
    const history: ChatMessage[] = [{ role: "coach", text: initial.message_ja, created_at: now }];
    await c.env.DB.prepare(
      "INSERT INTO sessions (id, user_id, topic, state, current_phrase_json, chat_history_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, user.id, null, initial.state, jsonOrNull(initial.phrase), JSON.stringify(history), now, now).run();
    session = await getSession(c.env.DB, id);
  }
  return c.json(await buildSessionPayload(c.env.DB, user, session));
});

app.post("/api/chat", async (c) => {
  const user = await ensureUser(c);
  const body = await c.req.json<{ message: string }>();
  const message = body.message?.trim();
  if (!message) return c.json({ error: "メッセージを入力してください。" }, 400);
  const session = await getOpenSession(c.env.DB, user.id);
  if (!session) return c.json({ error: "セッションが見つかりません。" }, 404);

  const history = parseHistory(session.chat_history_json);
  history.push({ role: "learner", text: message, created_at: new Date().toISOString() });
  const result = await coach(c.env, user.level, message, JSON.stringify(history.slice(-12)));
  history.push({ role: "coach", text: result.message_ja, created_at: new Date().toISOString() });
  const topic = result.state === "propose" ? message : session.topic;
  const state = result.phrase ? "practice" : result.state;
  await c.env.DB.prepare(
    "UPDATE sessions SET topic = ?, state = ?, current_phrase_json = ?, chat_history_json = ?, updated_at = ? WHERE id = ?"
  ).bind(topic, state, jsonOrNull(result.phrase), JSON.stringify(history), new Date().toISOString(), session.id).run();
  return c.json({ coach: result, session: await buildSessionPayload(c.env.DB, user, await getSession(c.env.DB, session.id)) });
});

app.post("/api/attempt", async (c) => {
  const user = await ensureUser(c);
  const session = await getOpenSession(c.env.DB, user.id);
  if (!session) return c.json({ error: "セッションが見つかりません。" }, 404);
  const form = await c.req.formData();
  const phrase = String(form.get("phrase") ?? "");
  const audio = form.get("audio");
  if (!phrase || !(audio instanceof File)) return c.json({ error: "WAV音声と英文が必要です。" }, 400);
  if (audio.type !== "audio/wav" && audio.type !== "audio/x-wav") return c.json({ error: "録音は16kHz mono WAVに変換してから送信してください。" }, 400);

  const scores = await recentScores(c.env.DB, session.id, 5);
  const gemini = await evaluatePronunciation(c.env, phrase, user.level, scores.length ? average(scores) : null, await audio.arrayBuffer());
  const next = decideNextStep(gemini.pronunciation_score, scores);
  const evaluation: AttemptEvaluation = {
    ...gemini,
    words: alignWords(phrase, gemini.verbatim, gemini.words),
    next_step: next
  };
  await c.env.DB.prepare(
    "INSERT INTO attempts (session_id, phrase_en, verbatim, words_json, pronunciation_score, fluency_score, next_step) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(session.id, phrase, evaluation.verbatim, JSON.stringify(evaluation.words), evaluation.pronunciation_score, evaluation.fluency_score, evaluation.next_step).run();

  if (next === "level_up" && user.level < 5) {
    const upgraded = nextLevel(user.level);
    await c.env.DB.prepare("UPDATE users SET level = ? WHERE id = ?").bind(upgraded, user.id).run();
    await c.env.DB.prepare("INSERT INTO level_history (user_id, from_level, to_level, reason) VALUES (?, ?, ?, ?)")
      .bind(user.id, user.level, upgraded, "直近5回の平均発音スコアが80点以上").run();
  }
  await c.env.DB.prepare("UPDATE sessions SET state = ?, updated_at = ? WHERE id = ?").bind("feedback", new Date().toISOString(), session.id).run();
  return c.json({ evaluation, progress: await progress(c.env.DB, user.id) });
});

app.post("/api/tts", async (c) => {
  const body = await c.req.json<{ phrase: string; slow?: boolean }>();
  if (!body.phrase) return c.json({ error: "英文が必要です。" }, 400);
  const audio = await synthesizeSpeech(c.env, body.phrase, Boolean(body.slow));
  return new Response(audio.bytes, {
    headers: {
      "content-type": audio.mimeType,
      "cache-control": "no-store"
    }
  });
});

app.get("/api/progress", async (c) => {
  const user = await ensureUser(c);
  return c.json(await progress(c.env.DB, user.id));
});

app.onError((err, c) => {
  return c.json({ error: err.message || "処理に失敗しました。" }, 500);
});

app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

async function ensureUser(c: Context<{ Bindings: Bindings }>): Promise<{ id: string; level: number }> {
  const existing = getCookie(c, "eb_uid");
  if (existing) {
    const row = await c.env.DB.prepare("SELECT id, level FROM users WHERE id = ?").bind(existing).first<{ id: string; level: number }>();
    if (row) return row;
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO users (id, level) VALUES (?, ?)").bind(id, 1).run();
  setCookie(c, "eb_uid", id, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return { id, level: 1 };
}

async function getOpenSession(db: D1Database, userId: string): Promise<any | null> {
  return db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").bind(userId).first();
}

async function getSession(db: D1Database, id: string): Promise<any> {
  return db.prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first();
}

async function buildSessionPayload(db: D1Database, user: { id: string; level: number }, row: any): Promise<SessionPayload> {
  const freshUser = await db.prepare("SELECT id, level FROM users WHERE id = ?").bind(user.id).first<{ id: string; level: number }>();
  return {
    user: freshUser ?? user,
    session: {
      id: row.id,
      state: row.state,
      topic: row.topic,
      current_phrase: parsePhrase(row.current_phrase_json),
      chat_history: parseHistory(row.chat_history_json)
    },
    progress: await progress(db, user.id)
  };
}

async function progress(db: D1Database, userId: string): Promise<ProgressPayload> {
  const user = await db.prepare("SELECT level FROM users WHERE id = ?").bind(userId).first<{ level: number }>();
  const rows = await db.prepare(
    "SELECT a.phrase_en, a.pronunciation_score AS score, a.next_step, a.created_at FROM attempts a JOIN sessions s ON s.id = a.session_id WHERE s.user_id = ? ORDER BY a.created_at DESC LIMIT 10"
  ).bind(userId).all<{ phrase_en: string; score: number; next_step: any; created_at: string }>();
  const scores = rows.results.map((row) => row.score).filter((score): score is number => typeof score === "number");
  return {
    level: user?.level ?? 1,
    attempts: scores.length,
    average_score: scores.length ? average(scores) : null,
    best_score: scores.length ? Math.max(...scores) : null,
    recent: rows.results
  };
}

async function recentScores(db: D1Database, sessionId: string, limit: number): Promise<number[]> {
  const rows = await db.prepare("SELECT pronunciation_score FROM attempts WHERE session_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(sessionId, limit).all<{ pronunciation_score: number }>();
  return rows.results.map((row) => row.pronunciation_score).reverse();
}

function parseHistory(value: string | null): ChatMessage[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as ChatMessage[];
  } catch {
    return [];
  }
}

function parsePhrase(value: string | null): Phrase | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Phrase;
  } catch {
    return null;
  }
}

function jsonOrNull(value: unknown): string | null {
  return value ? JSON.stringify(value) : null;
}
