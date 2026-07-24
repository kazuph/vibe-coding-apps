import { Hono } from "hono";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { alignWords } from "../shared/alignment";
import { average, decideNextStep, nextLevel } from "../shared/levels";
import type { AttemptEvaluation, ChatMessage, EnglishVariant, InterviewCoachResponse, InterviewState, Phrase, ProgressPayload, ScriptPayload, ScriptSentencePayload, SessionPayload, SessionSummary, UsageCostSummary, UserContextFact, VariantStyle } from "../shared/types";
import { evaluatePronunciation, extractContextFacts, generateVariantBatch, interviewCoach, synthesizeSpeech, type GeminiEnv, type GeminiUsage } from "./gemini";

type Bindings = GeminiEnv & {
  DB: D1Database;
  ASSETS: Fetcher;
};

const app = new Hono<{ Bindings: Bindings }>();

const MODEL_PRICES: Record<string, { input: number; output: number; audioInput: number }> = {
  "gemini-3.5-flash": { input: 1.50, output: 9.00, audioInput: 1.50 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.50, audioInput: 0.50 },
  "gemini-3.1-flash-tts": { input: 1.00, output: 20.00, audioInput: 0 }
};
const MAX_ATTEMPT_WAV_BYTES = 44 + 16_000 * 2 * 30;

app.post("/api/session/start", async (c) => {
  const user = await ensureUser(c);
  let session = await getOpenSession(c.env.DB, user.id);
  if (!session) {
    session = await createSession(c.env.DB, user.id);
  } else if (!session.script_id && (session.state !== "topic" || session.current_phrase_json)) {
    const now = new Date().toISOString();
    const history: ChatMessage[] = [{ role: "coach", text: openingMessage(), created_at: now }];
    await c.env.DB.prepare("UPDATE sessions SET state = ?, phase = ?, topic = ?, current_phrase_json = ?, chat_history_json = ?, updated_at = ? WHERE id = ?")
      .bind("topic", "topic", null, null, JSON.stringify(history), now, session.id).run();
    session = await getSession(c.env.DB, session.id);
  }
  return c.json(await buildSessionPayload(c.env.DB, user, session));
});

app.get("/api/sessions", async (c) => {
  const user = await ensureUser(c);
  return c.json({ sessions: await sessionSummaries(c.env.DB, user.id), active_session_id: (await getOpenSession(c.env.DB, user.id))?.id ?? null });
});

app.post("/api/session/new", async (c) => {
  const user = await ensureUser(c);
  const session = await createSession(c.env.DB, user.id);
  return c.json({ session: await buildSessionPayload(c.env.DB, user, session), sessions: await sessionSummaries(c.env.DB, user.id) });
});

app.post("/api/session/switch", async (c) => {
  const user = await ensureUser(c);
  const body = await c.req.json<{ id: string }>();
  const session = await c.env.DB.prepare("SELECT * FROM sessions WHERE id = ? AND user_id = ?").bind(body.id, user.id).first<any>();
  if (!session) return c.json({ error: "セッションが見つかりません。" }, 404);
  await c.env.DB.prepare("UPDATE users SET active_session_id = ? WHERE id = ?").bind(session.id, user.id).run();
  return c.json({ session: await buildSessionPayload(c.env.DB, user, session), sessions: await sessionSummaries(c.env.DB, user.id) });
});

app.get("/api/context", async (c) => {
  const user = await ensureUser(c);
  return c.json({ facts: await userFacts(c.env.DB, user.id, 50) });
});

app.post("/api/context/ingest", async (c) => {
  const user = await ensureUser(c);
  const body = await c.req.json<{ text: string }>();
  const text = body.text?.trim();
  if (!text) return c.json({ error: "プロフィールや投稿文を入力してください。" }, 400);
  const extracted = await extractContextFacts(c.env, text);
  await recordUsage(c.env.DB, user.id, "context_ingest", extracted.model, extracted.usage);
  return c.json({ facts: normalizeContextFacts(extracted.data.facts), model: extracted.model });
});

app.put("/api/context", async (c) => {
  const user = await ensureUser(c);
  const body = await c.req.json<{ facts?: Array<{ key: string; value: string }> }>();
  const facts = normalizeContextFacts(body.facts ?? []);
  if (!facts.length) return c.json({ error: "保存するfactがありません。" }, 400);
  for (const fact of facts) {
    await upsertUserFact(c.env.DB, user.id, fact.key, fact.value, "manual");
  }
  return c.json({ facts: await userFacts(c.env.DB, user.id, 50) });
});

app.delete("/api/context", async (c) => {
  const user = await ensureUser(c);
  const body = await c.req.json<{ id: number }>().catch(() => ({ id: 0 }));
  if (!body.id) return c.json({ error: "削除するfact IDが必要です。" }, 400);
  await c.env.DB.prepare("DELETE FROM user_context WHERE id = ? AND user_id = ?").bind(body.id, user.id).run();
  return c.json({ facts: await userFacts(c.env.DB, user.id, 50) });
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
  if (!session.script_id) {
    const result = await startInterview(c, user, session, message, history);
    return c.json(result);
  }
  if (phase === "interview" && session.script_id) {
    const result = await continueInterview(c, user, session, message, history);
    return c.json(result);
  }
  history.push({ role: "coach", text: "受け取りました。下書きや練習内容に反映したいときは、中央のカードを編集・選択してください。", created_at: new Date().toISOString() });
  await c.env.DB.prepare("UPDATE sessions SET chat_history_json = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(history), new Date().toISOString(), session.id).run();
  return c.json({ session: await buildSessionPayload(c.env.DB, user, await getSession(c.env.DB, session.id)) });
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

app.post("/api/script/approve", async (c) => {
  const user = await ensureUser(c);
  const body: { sentences_ja?: string[] } = await c.req.json<{ sentences_ja?: string[] }>().catch(() => ({}));
  const session = await getOpenSession(c.env.DB, user.id);
  if (!session?.script_id) return c.json({ error: "承認する台本が見つかりません。" }, 404);
  const script = await getScriptPayload(c.env.DB, session.script_id);
  if (!script?.interview) return c.json({ error: "ドラフト状態が見つかりません。" }, 404);
  const sentences = normalizeDraftSentences(body.sentences_ja?.length ? body.sentences_ja : script.interview.draft_sentences_ja);
  if (sentences.length < 2 || sentences.length > 4) return c.json({ error: "ドラフトは2〜4文で承認してください。" }, 400);

  const batch = await generateVariantBatch(c.env, { level: user.level, topic: script.topic, sentences });
  await recordUsage(c.env.DB, user.id, "variants", batch.model, batch.usage);
  const normalized = normalizeVariantBatch(batch.data.sentences, sentences, batch.model);
  if (normalized.length !== sentences.length) return c.json({ error: "英語変種の生成結果が文数と一致しません。もう一度試してください。" }, 502);

  const now = new Date().toISOString();
  const interview: InterviewState = { ...script.interview, draft_sentences_ja: sentences, approved_at: now };
  await c.env.DB.prepare("DELETE FROM script_sentences WHERE script_id = ?").bind(session.script_id).run();
  for (const sentence of normalized) {
    await c.env.DB.prepare(
      "INSERT INTO script_sentences (script_id, position, ja_text, en_variants_json, en_selected, best_score, practice_count) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(session.script_id, sentence.position, sentence.ja_text, JSON.stringify(sentence.variants), null, 0, 0).run();
  }
  await c.env.DB.prepare("UPDATE scripts SET status = ?, interview_json = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind("practicing", JSON.stringify(interview), now, session.script_id, user.id).run();
  await c.env.DB.prepare("UPDATE sessions SET state = ?, phase = ?, active_sentence_position = ?, current_phrase_json = ?, updated_at = ? WHERE id = ?")
    .bind("variants", "variants", 1, null, now, session.id).run();
  return c.json({ session: await buildSessionPayload(c.env.DB, user, await getSession(c.env.DB, session.id)) });
});

app.post("/api/script/select-variant", async (c) => {
  const user = await ensureUser(c);
  const body = await c.req.json<{ sentence_id: number; style: VariantStyle }>();
  const session = await getOpenSession(c.env.DB, user.id);
  if (!session?.script_id) return c.json({ error: "練習する台本が見つかりません。" }, 404);
  const sentence = await c.env.DB.prepare(
    "SELECT ss.* FROM script_sentences ss JOIN scripts s ON s.id = ss.script_id WHERE ss.id = ? AND ss.script_id = ? AND s.user_id = ?"
  ).bind(body.sentence_id, session.script_id, user.id).first<any>();
  if (!sentence) return c.json({ error: "選択する文が見つかりません。" }, 404);
  const variants = parseVariants(sentence.en_variants_json);
  const selected = variants.find((variant) => variant.style === body.style);
  if (!selected) return c.json({ error: "選択した変種が見つかりません。" }, 400);
  const phrase = phraseFromVariant(sentence.ja_text, selected);
  await c.env.DB.prepare("UPDATE script_sentences SET en_selected = ? WHERE id = ?").bind(selected.en, sentence.id).run();
  await c.env.DB.prepare("UPDATE sessions SET state = ?, phase = ?, active_sentence_position = ?, current_phrase_json = ?, updated_at = ? WHERE id = ?")
    .bind("practice", "practice", sentence.position, JSON.stringify(phrase), new Date().toISOString(), session.id).run();
  return c.json({ session: await buildSessionPayload(c.env.DB, user, await getSession(c.env.DB, session.id)) });
});

app.post("/api/attempt", async (c) => {
  const user = await ensureUser(c);
  const session = await getOpenSession(c.env.DB, user.id);
  if (!session) return c.json({ error: "セッションが見つかりません。" }, 404);
  const form = await c.req.formData();
  const sentenceId = Number(form.get("sentence_id") ?? 0);
  const audio = form.get("audio");
  if (!sentenceId || !(audio instanceof File)) return c.json({ error: "WAV音声と練習文IDが必要です。" }, 400);
  if (audio.type !== "audio/wav" && audio.type !== "audio/x-wav") return c.json({ error: "録音は16kHz mono WAVに変換してから送信してください。" }, 400);
  if (audio.size > MAX_ATTEMPT_WAV_BYTES) return c.json({ error: "録音は30秒以内の16kHz mono WAVにしてください。" }, 400);
  const sentence = await c.env.DB.prepare(
    "SELECT ss.* FROM script_sentences ss JOIN scripts s ON s.id = ss.script_id WHERE ss.id = ? AND ss.script_id = ? AND s.user_id = ?"
  ).bind(sentenceId, session.script_id, user.id).first<any>();
  if (!sentence?.en_selected) return c.json({ error: "サーバー側で選択済み英文が見つかりません。" }, 400);
  const phrase = String(sentence.en_selected);

  const scores = await recentScores(c.env.DB, session.id, 5);
  const gemini = await evaluatePronunciation(c.env, phrase, user.level, scores.length ? average(scores) : null, await audio.arrayBuffer());
  await recordUsage(c.env.DB, user.id, "eval", gemini.model, gemini.usage);
  const next = decideNextStep(gemini.data.pronunciation_score, scores);
  const evaluation: AttemptEvaluation = {
    ...gemini.data,
    model: gemini.model,
    words: alignWords(phrase, gemini.data.verbatim, gemini.data.words),
    next_step: next
  };
  await c.env.DB.prepare(
    "INSERT INTO attempts (session_id, script_sentence_id, phrase_en, verbatim, words_json, pronunciation_score, fluency_score, next_step, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(session.id, sentenceId, phrase, evaluation.verbatim, JSON.stringify(evaluation.words), evaluation.pronunciation_score, evaluation.fluency_score, evaluation.next_step, evaluation.model).run();
  await c.env.DB.prepare(
    "UPDATE script_sentences SET best_score = MAX(best_score, ?), practice_count = practice_count + 1 WHERE id = ?"
  ).bind(evaluation.pronunciation_score, sentenceId).run();

  if (next === "level_up" && user.level < 5) {
    const upgraded = nextLevel(user.level);
    await c.env.DB.prepare("UPDATE users SET level = ? WHERE id = ?").bind(upgraded, user.id).run();
    await c.env.DB.prepare("INSERT INTO level_history (user_id, from_level, to_level, reason) VALUES (?, ?, ?, ?)")
      .bind(user.id, user.level, upgraded, "直近5回の平均発音スコアが80点以上").run();
  }
  await c.env.DB.prepare("UPDATE sessions SET state = ?, phase = ?, updated_at = ? WHERE id = ?").bind("feedback", "feedback", new Date().toISOString(), session.id).run();
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
  const coach = await interviewCoach(c.env, {
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
  await recordUsage(c.env.DB, user.id, "chat", coach.model, coach.usage);
  const coachResult = coach.data;
  if (coachResult.draft) return c.json({ error: "インタビュー開始時にドラフトが返りました。もう一度試してください。" }, 502);
  const nextInterview = mergeInterview(interview, coachResult, false);
  history.push({ role: "coach", text: coachResult.message_ja, model: coach.model, created_at: new Date().toISOString() });
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
  const coach = await interviewCoach(c.env, {
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
  await recordUsage(c.env.DB, user.id, "chat", coach.model, coach.usage);
  const coachResult = coach.data;
  if (mustDraft && !coachResult.draft) return c.json({ error: "ドラフト生成に失敗しました。もう一度送信してください。" }, 502);
  const nextInterview = mergeInterview({ ...script.interview, turn_count: answeredTurns }, coachResult, Boolean(coachResult.draft));
  const phase = coachResult.draft ? "draft" : "interview";
  history.push({ role: "coach", text: coachResult.message_ja, model: coach.model, created_at: new Date().toISOString() });
  await saveExtractedFacts(c.env.DB, user.id, coachResult);
  await c.env.DB.prepare("UPDATE scripts SET status = ?, interview_json = ?, updated_at = ? WHERE id = ? AND user_id = ?")
    .bind(coachResult.draft ? "draft" : "interview", JSON.stringify(nextInterview), new Date().toISOString(), session.script_id, user.id).run();
  await c.env.DB.prepare("UPDATE sessions SET state = ?, phase = ?, chat_history_json = ?, updated_at = ? WHERE id = ?")
    .bind(phase, phase, JSON.stringify(history), new Date().toISOString(), session.id).run();
  return { coach: coachResult, session: await buildSessionPayload(c.env.DB, user, await getSession(c.env.DB, session.id)) };
}

app.post("/api/tts", async (c) => {
  const user = await ensureUser(c);
  const body = await c.req.json<{ phrase: string; slow?: boolean }>();
  if (!body.phrase) return c.json({ error: "英文が必要です。" }, 400);
  const audio = await synthesizeSpeech(c.env, body.phrase, Boolean(body.slow));
  await recordUsage(c.env.DB, user.id, "tts", audio.model, audio.usage);
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

app.get("/api/usage", async (c) => {
  const user = await ensureUser(c);
  return c.json(await usageSummary(c.env.DB, user.id));
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
  setCookie(c, "eb_uid", id, { httpOnly: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 * 365, secure: new URL(c.req.url).protocol === "https:" });
  return { id, level: 1 };
}

function openingMessage(): string {
  return "今日はどんな場面の英語を一緒に作ろう？カードから選ぶか、下の入力欄にそのまま書いてね。";
}

async function createSession(db: D1Database, userId: string): Promise<any> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const history: ChatMessage[] = [{ role: "coach", text: openingMessage(), created_at: now }];
  await db.prepare(
    "INSERT INTO sessions (id, user_id, topic, state, phase, current_phrase_json, chat_history_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(id, userId, null, "topic", "topic", null, JSON.stringify(history), now, now).run();
  await db.prepare("UPDATE users SET active_session_id = ? WHERE id = ?").bind(id, userId).run();
  return getSession(db, id);
}

async function getOpenSession(db: D1Database, userId: string): Promise<any | null> {
  const active = await db.prepare(
    "SELECT s.* FROM users u JOIN sessions s ON s.id = u.active_session_id WHERE u.id = ? AND s.user_id = ?"
  ).bind(userId, userId).first();
  if (active) return active;
  const latest = await db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1").bind(userId).first<any>();
  if (latest) await db.prepare("UPDATE users SET active_session_id = ? WHERE id = ?").bind(latest.id, userId).run();
  return latest;
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
      latest_evaluation: await latestEvaluation(db, row.id),
      script,
      active_sentence: script?.sentences.find((sentence) => sentence.position === activePosition) ?? null,
      chat_history: parseHistory(row.chat_history_json)
    },
    progress: await progress(db, user.id)
  };
}

async function sessionSummaries(db: D1Database, userId: string): Promise<SessionSummary[]> {
  const rows = await db.prepare(
    `SELECT
      s.id,
      s.topic,
      s.phase,
      s.state,
      s.chat_history_json,
      s.updated_at,
      COUNT(a.id) AS attempts,
      AVG(a.pronunciation_score) AS average_score
    FROM sessions s
    LEFT JOIN attempts a ON a.session_id = s.id
    WHERE s.user_id = ?
    GROUP BY s.id
    ORDER BY s.updated_at DESC
    LIMIT 30`
  ).bind(userId).all<any>();
  return rows.results.map((row) => {
    const history = parseHistory(row.chat_history_json);
    const firstLearner = history.find((item) => item.role === "learner")?.text ?? "";
    const titleSource = row.topic || firstLearner || "新しい会話";
    return {
      id: row.id,
      title: titleSource.length > 20 ? `${titleSource.slice(0, 20)}...` : titleSource,
      topic: row.topic ?? null,
      phase: row.phase ?? row.state,
      updated_at: row.updated_at,
      average_score: row.average_score == null ? null : Math.round(Number(row.average_score)),
      attempts: Number(row.attempts ?? 0)
    };
  });
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

async function latestEvaluation(db: D1Database, sessionId: string): Promise<AttemptEvaluation | null> {
  const row = await db.prepare(
    "SELECT verbatim, words_json, pronunciation_score, fluency_score, next_step, model FROM attempts WHERE session_id = ? ORDER BY created_at DESC LIMIT 1"
  ).bind(sessionId).first<any>();
  if (!row) return null;
  return {
    verbatim: row.verbatim ?? "",
    words: parseWords(row.words_json),
    pronunciation_score: Number(row.pronunciation_score ?? 0),
    fluency_score: Number(row.fluency_score ?? 0),
    prosody_comment_ja: "",
    overall_advice_ja: "直近の録音評価を復元しました。",
    next_step: row.next_step,
    model: row.model ?? undefined
  };
}

async function recentScores(db: D1Database, sessionId: string, limit: number): Promise<number[]> {
  const rows = await db.prepare("SELECT pronunciation_score FROM attempts WHERE session_id = ? ORDER BY created_at DESC LIMIT ?")
    .bind(sessionId, limit).all<{ pronunciation_score: number }>();
  return rows.results.map((row) => row.pronunciation_score).reverse();
}

function initialInterviewState(): InterviewState {
  return {
    version: 2,
    turn_count: 0,
    max_turns: 3,
    last_question_ja: null,
    chips: [],
    draft_sentences_ja: [],
    approved_at: null
  };
}

function mergeInterview(current: InterviewState, result: InterviewCoachResponse, hasDraft: boolean): InterviewState {
  return {
    ...current,
    last_question_ja: hasDraft ? current.last_question_ja : result.message_ja,
    chips: result.chips?.slice(0, 3) ?? [],
    draft_sentences_ja: normalizeDraftSentences(result.draft?.sentences_ja ?? current.draft_sentences_ja)
  };
}

function normalizeDraftSentences(sentences: string[] | undefined): string[] {
  return (sentences ?? []).map((sentence) => sentence.trim()).filter(Boolean).slice(0, 4);
}

function normalizeVariantBatch(
  generated: Array<{ position: number; ja_text: string; variants: EnglishVariant[] }>,
  sourceSentences: string[],
  model: string
): Array<{ position: number; ja_text: string; variants: EnglishVariant[] }> {
  const normalized: Array<{ position: number; ja_text: string; variants: EnglishVariant[] } | null> = sourceSentences.map((source, index) => {
    const position = index + 1;
    const item = generated.find((candidate) => Number(candidate.position) === position);
    if (!item) return null;
    const variants = item.variants.filter((variant) => ["simple", "natural", "advanced"].includes(variant.style) && variant.en && variant.why_ja);
    const styles = new Set(variants.map((variant) => variant.style));
    if (!styles.has("simple") || !styles.has("natural") || !styles.has("advanced")) return null;
    return {
      position,
      ja_text: source,
      variants: variants.map((variant): EnglishVariant => ({
        style: variant.style,
        en: variant.en.trim(),
        why_ja: variant.why_ja.trim(),
        traps: (variant.traps ?? []).filter((trap) => trap.word && trap.tip_ja).slice(0, 3),
        model
      }))
    };
  });
  return normalized.filter((item): item is { position: number; ja_text: string; variants: EnglishVariant[] } => Boolean(item));
}

function phraseFromVariant(jaText: string, variant: EnglishVariant): Phrase {
  return {
    en: variant.en,
    ja: jaText,
    why_ja: variant.why_ja,
    pronunciation_tips_ja: variant.traps.map((trap) => `${trap.word}: ${trap.tip_ja}`),
    model: variant.model
  };
}

async function recordUsage(db: D1Database, userId: string, kind: string, model: string, usage: GeminiUsage): Promise<void> {
  await db.prepare(
    "INSERT INTO api_usage (user_id, kind, model, input_tokens, output_tokens, audio_input_tokens) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(userId, kind, model, usage.input_tokens, usage.output_tokens, usage.audio_input_tokens).run();
}

async function usageSummary(db: D1Database, userId: string): Promise<UsageCostSummary> {
  const rows = await db.prepare(
    `SELECT model, kind,
      SUM(input_tokens) AS input_tokens,
      SUM(output_tokens) AS output_tokens,
      SUM(audio_input_tokens) AS audio_input_tokens,
      SUM(CASE WHEN date(created_at) = date('now') THEN input_tokens ELSE 0 END) AS today_input_tokens,
      SUM(CASE WHEN date(created_at) = date('now') THEN output_tokens ELSE 0 END) AS today_output_tokens,
      SUM(CASE WHEN date(created_at) = date('now') THEN audio_input_tokens ELSE 0 END) AS today_audio_input_tokens,
      SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN input_tokens ELSE 0 END) AS month_input_tokens,
      SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN output_tokens ELSE 0 END) AS month_output_tokens,
      SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN audio_input_tokens ELSE 0 END) AS month_audio_input_tokens
    FROM api_usage
    WHERE user_id = ?
    GROUP BY model, kind
    ORDER BY model, kind`
  ).bind(userId).all<any>();
  const breakdown = rows.results.map((row) => ({
    model: String(row.model),
    kind: String(row.kind),
    input_tokens: Number(row.input_tokens ?? 0),
    output_tokens: Number(row.output_tokens ?? 0),
    audio_input_tokens: Number(row.audio_input_tokens ?? 0),
    cost_usd: costForUsage(String(row.model), Number(row.input_tokens ?? 0), Number(row.output_tokens ?? 0), Number(row.audio_input_tokens ?? 0))
  }));
  const today = rows.results.reduce((sum, row) => sum + costForUsage(String(row.model), Number(row.today_input_tokens ?? 0), Number(row.today_output_tokens ?? 0), Number(row.today_audio_input_tokens ?? 0)), 0);
  const month = rows.results.reduce((sum, row) => sum + costForUsage(String(row.model), Number(row.month_input_tokens ?? 0), Number(row.month_output_tokens ?? 0), Number(row.month_audio_input_tokens ?? 0)), 0);
  const allTime = breakdown.reduce((sum, row) => sum + row.cost_usd, 0);
  return {
    totals: {
      today_usd: roundUsd(today),
      month_usd: roundUsd(month),
      all_time_usd: roundUsd(allTime)
    },
    breakdown: breakdown.map((row) => ({ ...row, cost_usd: roundUsd(row.cost_usd) })),
    tts_pricing: "configured",
    note: "従量課金定価での換算値。無料枠適用時の実請求とは異なる場合があります。"
  };
}

function costForUsage(model: string, inputTokens: number, outputTokens: number, audioInputTokens: number): number {
  const price = MODEL_PRICES[model];
  if (!price) return 0;
  return ((inputTokens * price.input) + (outputTokens * price.output) + (audioInputTokens * price.audioInput)) / 1_000_000;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

async function userFacts(db: D1Database, userId: string, limit = 12): Promise<UserContextFact[]> {
  const rows = await db.prepare("SELECT id, fact_key, fact_value, source FROM user_context WHERE user_id = ? ORDER BY updated_at DESC LIMIT ?")
    .bind(userId, limit).all<{ id: number; fact_key: string; fact_value: string; source: UserContextFact["source"] }>();
  return rows.results.map((row) => ({ id: Number(row.id), key: row.fact_key, value: row.fact_value, source: row.source }));
}

async function saveExtractedFacts(db: D1Database, userId: string, result: InterviewCoachResponse): Promise<void> {
  const facts = result.extracted_facts ?? [];
  for (const fact of facts) {
    const [normalized] = normalizeContextFacts([fact]);
    if (!normalized) continue;
    await upsertUserFact(db, userId, normalized.key, normalized.value, "interview");
  }
}

async function upsertUserFact(db: D1Database, userId: string, key: string, value: string, source: UserContextFact["source"]): Promise<void> {
  await db.prepare(
    "INSERT INTO user_context (user_id, fact_key, fact_value, source, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, fact_key) DO UPDATE SET fact_value = excluded.fact_value, source = excluded.source, updated_at = excluded.updated_at"
  ).bind(userId, key, value, source, new Date().toISOString()).run();
}

function normalizeContextFacts(facts: Array<{ key?: string; value?: string }>): Array<{ key: string; value: string }> {
  const seen = new Set<string>();
  return facts.map((fact) => ({
    key: (fact.key ?? "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40),
    value: (fact.value ?? "").trim().slice(0, 120)
  })).filter((fact) => {
    if (!fact.key || !fact.value || seen.has(fact.key)) return false;
    seen.add(fact.key);
    return true;
  }).slice(0, 12);
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

function parseWords(value: string | null): AttemptEvaluation["words"] {
  if (!value) return [];
  try {
    return JSON.parse(value) as AttemptEvaluation["words"];
  } catch {
    return [];
  }
}
