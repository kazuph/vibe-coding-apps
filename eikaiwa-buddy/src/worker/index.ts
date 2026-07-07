import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { cors } from "hono/cors";
import { alignWords } from "../shared/alignment";
import { average, decideNextStep, nextLevel } from "../shared/levels";
import type { AttemptEvaluation, ChatMessage, EnglishVariant, InterviewCoachResponse, InterviewState, Phrase, ProgressPayload, ScriptPayload, ScriptSentencePayload, SessionPayload, UserContextFact } from "../shared/types";
import { evaluatePronunciation, interviewCoach, synthesizeSpeech, type GeminiEnv } from "./gemini";

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
    const history: ChatMessage[] = [{ role: "coach", text: "今日はどんな場面の英語を一緒に作ろう？左のボタンから選んでね。", created_at: now }];
    await c.env.DB.prepare(
      "INSERT INTO sessions (id, user_id, topic, state, phase, current_phrase_json, chat_history_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(id, user.id, null, "topic", "topic", null, JSON.stringify(history), now, now).run();
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
  const phase = session.phase ?? session.state;
  if ((phase === "topic" || phase === "propose") && !session.script_id) {
    const result = await startInterview(c, user, session, message, history);
    return c.json(result);
  }
  if (phase === "interview" && session.script_id) {
    const result = await continueInterview(c, user, session, message, history);
    return c.json(result);
  }
  return c.json({ error: "いまはチャットで進めるフェーズではありません。" }, 400);
});

app.post("/api/script/draft", async (c) => {
  const user = await ensureUser(c);
  const body = await c.req.json<{ sentences_ja: string[] }>();
  const sentences = normalizeDraftSentences(body.sentences_ja);
  if (sentences.length < 2 || sentences.length > 4) return c.json({ error: "ドラフトは2〜4文で入力してください。" }, 400);
  const session = await getOpenSession(c.env.DB, user.id);
  if (!session?.script_id) return c.json({ error: "編集中の台本が見つかりません。" }, 404);
  const script = await getScriptPayload(c.env.DB, session.script_id);
  if (!script?.interview) return c.json({ error: "インタビュー状態が見つかりません。" }, 404);
  const interview: InterviewState = { ...script.interview, draft_sentences_ja: sentences };
  await c.env.DB.prepare("UPDATE scripts SET status = ?, interview_json = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind("draft", JSON.stringify(interview), new Date().toISOString(), session.script_id, user.id).run();
  await c.env.DB.prepare("UPDATE sessions SET state = ?, phase = ?, updated_at = ? WHERE id = ?")
    .bind("draft", "draft", new Date().toISOString(), session.id).run();
  return c.json({ session: await buildSessionPayload(c.env.DB, user, await getSession(c.env.DB, session.id)) });
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

async function startInterview(
  c: Context<{ Bindings: Bindings }>,
  user: { id: string; level: number },
  session: any,
  topic: string,
  history: ChatMessage[]
) {
  const now = new Date().toISOString();
  const scriptId = crypto.randomUUID();
  const interview = initialInterviewState();
  await c.env.DB.prepare(
    "INSERT INTO scripts (id, user_id, topic, status, interview_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(scriptId, user.id, topic, "interview", JSON.stringify(interview), now, now).run();
  const facts = await userFacts(c.env.DB, user.id);
  const coachResult = await interviewCoach(c.env, {
    level: user.level,
    topic,
    facts,
    turnCount: interview.turn_count,
    maxTurns: interview.max_turns,
    mustDraft: false,
    forbidDraft: true,
    history: JSON.stringify(history.slice(-12)),
    learnerMessage: topic
  });
  if (coachResult.draft) return c.json({ error: "インタビュー開始時にドラフトが返りました。もう一度試してください。" }, 502);
  const nextInterview = mergeInterview(interview, coachResult, false);
  history.push({ role: "coach", text: coachResult.message_ja, created_at: new Date().toISOString() });
  await saveExtractedFacts(c.env.DB, user.id, coachResult);
  await c.env.DB.prepare("UPDATE scripts SET interview_json = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(nextInterview), new Date().toISOString(), scriptId).run();
  await c.env.DB.prepare(
    "UPDATE sessions SET topic = ?, state = ?, phase = ?, script_id = ?, active_sentence_position = ?, current_phrase_json = ?, chat_history_json = ?, updated_at = ? WHERE id = ?"
  ).bind(topic, "interview", "interview", scriptId, 1, null, JSON.stringify(history), new Date().toISOString(), session.id).run();
  return { coach: coachResult, session: await buildSessionPayload(c.env.DB, user, await getSession(c.env.DB, session.id)) };
}

async function continueInterview(
  c: Context<{ Bindings: Bindings }>,
  user: { id: string; level: number },
  session: any,
  message: string,
  history: ChatMessage[]
) {
  const script = await getScriptPayload(c.env.DB, session.script_id);
  if (!script?.interview) return c.json({ error: "インタビュー状態が見つかりません。" }, 404);
  const answeredTurns = script.interview.turn_count + 1;
  if (answeredTurns > script.interview.max_turns) return c.json({ error: "インタビューの上限に達しています。" }, 400);
  const mustDraft = answeredTurns >= script.interview.max_turns;
  const facts = await userFacts(c.env.DB, user.id);
  const coachResult = await interviewCoach(c.env, {
    level: user.level,
    topic: script.topic,
    facts,
    turnCount: answeredTurns,
    maxTurns: script.interview.max_turns,
    mustDraft,
    forbidDraft: false,
    history: JSON.stringify(history.slice(-12)),
    learnerMessage: message
  });
  if (mustDraft && !coachResult.draft) return c.json({ error: "ドラフト生成に失敗しました。もう一度送信してください。" }, 502);
  const nextInterview = mergeInterview({ ...script.interview, turn_count: answeredTurns }, coachResult, Boolean(coachResult.draft));
  const phase = coachResult.draft ? "draft" : "interview";
  history.push({ role: "coach", text: coachResult.message_ja, created_at: new Date().toISOString() });
  await saveExtractedFacts(c.env.DB, user.id, coachResult);
  await c.env.DB.prepare("UPDATE scripts SET status = ?, interview_json = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(coachResult.draft ? "draft" : "interview", JSON.stringify(nextInterview), new Date().toISOString(), session.script_id, user.id).run();
  await c.env.DB.prepare("UPDATE sessions SET state = ?, phase = ?, chat_history_json = ?, updated_at = ? WHERE id = ?")
    .bind(phase, phase, JSON.stringify(history), new Date().toISOString(), session.id).run();
  return { coach: coachResult, session: await buildSessionPayload(c.env.DB, user, await getSession(c.env.DB, session.id)) };
}

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
  const script = row.script_id ? await getScriptPayload(db, row.script_id) : null;
  const activePosition = Number(row.active_sentence_position ?? 1);
  return {
    user: freshUser ?? user,
    session: {
      id: row.id,
      state: row.state,
      phase: row.phase ?? row.state,
      topic: row.topic,
      script_id: row.script_id ?? null,
      active_sentence_position: activePosition,
      current_phrase: parsePhrase(row.current_phrase_json),
      script,
      active_sentence: script?.sentences.find((sentence) => sentence.position === activePosition) ?? null,
      chat_history: parseHistory(row.chat_history_json)
    },
    progress: await progress(db, user.id)
  };
}

async function getScriptPayload(db: D1Database, scriptId: string): Promise<ScriptPayload | null> {
  const script = await db.prepare("SELECT * FROM scripts WHERE id = ?").bind(scriptId).first<any>();
  if (!script) return null;
  const rows = await db.prepare("SELECT * FROM script_sentences WHERE script_id = ? ORDER BY position ASC")
    .bind(scriptId).all<any>();
  return {
    id: script.id,
    topic: script.topic,
    audience: script.audience ?? null,
    status: script.status,
    interview: parseInterview(script.interview_json),
    sentences: rows.results.map(toScriptSentencePayload)
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

function parseInterview(value: string | null): InterviewState | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as InterviewState;
  } catch {
    return null;
  }
}

function toScriptSentencePayload(row: any): ScriptSentencePayload {
  return {
    id: Number(row.id),
    position: Number(row.position),
    ja_text: row.ja_text,
    variants: parseVariants(row.en_variants_json),
    en_selected: row.en_selected ?? null,
    best_score: Number(row.best_score ?? 0),
    practice_count: Number(row.practice_count ?? 0)
  };
}

function parseVariants(value: string | null): EnglishVariant[] {
  if (!value) return [];
  try {
    return JSON.parse(value) as EnglishVariant[];
  } catch {
    return [];
  }
}

function jsonOrNull(value: unknown): string | null {
  return value ? JSON.stringify(value) : null;
}
