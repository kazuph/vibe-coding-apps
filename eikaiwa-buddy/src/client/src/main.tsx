import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookOpen, Flame, History, Keyboard, Loader2, Mic, Play, RefreshCw, Send, Settings, Sparkles, Volume2 } from "lucide-react";
import type { AttemptEvaluation, ChatMessage, NextStep, Phrase, ProgressPayload, SessionPayload, WordFeedback } from "../../shared/types";
import { encodeAudioBufferToWav16kMono } from "./audio/wav";
import "./styles.css";

type LoadState = "loading" | "ready" | "error";

interface AppSession {
  id: string;
  state: string;
  topic: string | null;
  current_phrase: Phrase | null;
  chat_history: ChatMessage[];
}

function App() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [evaluation, setEvaluation] = useState<AttemptEvaluation | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    startSession().catch((err: Error) => {
      setError(err.message);
      setLoadState("error");
    });
  }, []);

  async function startSession() {
    setLoadState("loading");
    const payload = await api<SessionPayload>("/api/session/start", { method: "POST" });
    setSession(payload.session);
    setProgress(payload.progress);
    setLoadState("ready");
  }

  async function sendChat(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ session: SessionPayload }>("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed })
      });
      setSession(response.session.session);
      setProgress(response.session.progress);
      setEvaluation(null);
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "会話の送信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRef.current?.stop();
      setRecording(false);
      return;
    }
    setError(null);
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 48000 } });
      const recorder = new MediaRecorder(stream);
      mediaRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void submitRecording(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      setRecording(true);
      window.setTimeout(() => {
        if (mediaRef.current?.state === "recording") {
          mediaRef.current.stop();
          setRecording(false);
        }
      }, 30_000);
    } catch (err) {
      setError(`マイクを開始できませんでした: ${err instanceof Error ? err.message : "権限を確認してください。"}`);
    }
  }

  async function submitRecording(blob: Blob) {
    const phrase = session?.current_phrase?.en;
    if (!phrase) {
      setError("練習する英文がまだありません。先に話題を選んでください。");
      return;
    }
    setBusy(true);
    try {
      const buffer = await blob.arrayBuffer();
      const audioContext = new AudioContext();
      const decoded = await audioContext.decodeAudioData(buffer.slice(0));
      const wav = encodeAudioBufferToWav16kMono(decoded);
      await audioContext.close();
      const form = new FormData();
      form.set("phrase", phrase);
      form.set("audio", new File([wav], "practice.wav", { type: "audio/wav" }));
      const result = await api<{ evaluation: AttemptEvaluation; progress: ProgressPayload }>("/api/attempt", {
        method: "POST",
        body: form
      });
      setEvaluation(result.evaluation);
      setProgress(result.progress);
      setSession((current) => current ? { ...current, state: "feedback" } : current);
    } catch (err) {
      setError(`録音評価に失敗しました: ${err instanceof Error ? err.message : "Gemini APIの応答を確認してください。"}`);
    } finally {
      setBusy(false);
    }
  }

  async function playTts(slow = false) {
    const phrase = session?.current_phrase?.en;
    if (!phrase) return;
    setTtsBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phrase, slow })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "TTSに失敗しました。" })) as { error?: string };
        throw new Error(body.error);
      }
      const audio = new Audio(URL.createObjectURL(await response.blob()));
      await audio.play();
    } catch (err) {
      setError(`お手本音声を再生できませんでした: ${err instanceof Error ? err.message : "Gemini TTSの応答を確認してください。"}`);
    } finally {
      setTtsBusy(false);
    }
  }

  const phrase = session?.current_phrase;
  const words = useMemo(() => evaluation?.words ?? [], [evaluation]);

  if (loadState === "loading") {
    return <Shell><div className="loading"><Loader2 className="spin" /> Kaiを起動しています...</div></Shell>;
  }

  return (
    <Shell>
      <header className="topbar">
        <div className="brand"><span>eikaiwa</span>-buddy<small>Gemini-powered English Coach</small></div>
        <nav>
          <button className="nav active"><Mic size={18} />スピーキング練習</button>
          <button className="nav"><BookOpen size={18} />単語帳</button>
          <button className="nav"><History size={18} />学習履歴</button>
          <button className="nav"><Settings size={18} />設定</button>
        </nav>
        <div className="streak"><Flame size={18} />7日連続</div>
      </header>

      <main className="layout">
        <aside className="coach-panel">
          <PanelTitle title="コーチとの会話" online />
          <div className="chat-log">
            {(session?.chat_history ?? []).map((item, index) => (
              <div key={`${item.created_at}-${index}`} className={`bubble ${item.role}`}>
                <strong>{item.role === "coach" ? "Kai" : "あなた"}</strong>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
          <TopicGrid onPick={(topic) => sendChat(topic)} disabled={busy} />
          <form className="chat-input" onSubmit={(event) => { event.preventDefault(); void sendChat(message); }}>
            <input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="日本語で話したいことを入力..." />
            <button type="submit" disabled={busy || !message.trim()}><Send size={18} /></button>
          </form>
        </aside>

        <section className="practice-panel">
          <div className="mode-tabs">
            <button className="selected"><Sparkles size={18} />フリートーク</button>
            <button>シャドーイング</button>
            <button>ロールプレイ</button>
          </div>

          <section className="phrase-section">
            <div className="section-heading">
              <h1>今日のフレーズ</h1>
              <button className="icon-button" onClick={() => playTts(false)} disabled={!phrase || ttsBusy} aria-label="お手本を聞く">
                {ttsBusy ? <Loader2 className="spin" size={22} /> : <Volume2 size={22} />}
              </button>
            </div>
            {phrase ? <PhraseCard phrase={phrase} /> : <EmptyPhrase busy={busy} />}
          </section>

          <section className="speech-section">
            <h2>あなたの発話</h2>
            <HeardWords phrase={phrase?.en ?? ""} evaluation={evaluation} words={words} />
            <div className="mic-box">
              <button className={`mic-button ${recording ? "recording" : ""}`} onClick={() => void toggleRecording()} disabled={busy}>
                {busy ? <Loader2 className="spin" /> : <Mic size={44} />}
              </button>
              <div>
                <strong>{recording ? "録音中...もう一度タップで停止" : "タップして話す"}</strong>
                <p>録音はブラウザ内で16kHz mono WAVに変換してからGeminiへ送ります</p>
              </div>
              <button className="secondary" onClick={() => playTts(true)} disabled={!phrase || ttsBusy}><Play size={18} />ゆっくり聞く</button>
              <button className="secondary"><Keyboard size={18} />キーボード入力</button>
            </div>
          </section>
          {error && <div className="error-banner">{error}</div>}
        </section>

        <aside className="progress-panel">
          <ScoreCard evaluation={evaluation} progress={progress} />
          <ProgressCard progress={progress} />
          <HistoryList progress={progress} />
        </aside>
      </main>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="app">{children}</div>;
}

function PanelTitle({ title, online }: { title: string; online?: boolean }) {
  return <div className="panel-title"><h2>{title}</h2>{online && <span className="online">オンライン</span>}</div>;
}

function TopicGrid({ onPick, disabled }: { onPick: (topic: string) => void; disabled: boolean }) {
  const topics = ["旅行の予定", "自己紹介", "仕事について", "週末の過ごし方", "好きな食べ物", "趣味について"];
  return <div className="topic-grid">{topics.map((topic) => <button key={topic} disabled={disabled} onClick={() => onPick(topic)}>{topic}</button>)}</div>;
}

function PhraseCard({ phrase }: { phrase: Phrase }) {
  return (
    <div className="phrase-card">
      <span className="label">提案例</span>
      <p className="english">{phrase.en}</p>
      <p className="translation">{phrase.ja}</p>
      <div className="tips">
        <strong>発音のポイント</strong>
        <ul>{phrase.pronunciation_tips_ja.map((tip) => <li key={tip}>{tip}</li>)}</ul>
        <p>{phrase.why_ja}</p>
      </div>
    </div>
  );
}

function EmptyPhrase({ busy }: { busy: boolean }) {
  return <div className="empty">{busy ? "Kaiが英文を考えています..." : "左のトピックを選ぶか、日本語で話したい内容を送ってください。"}</div>;
}

function HeardWords({ phrase, evaluation, words }: { phrase: string; evaluation: AttemptEvaluation | null; words: WordFeedback[] }) {
  const fallback = phrase.split(/\s+/).filter(Boolean).map((word) => ({ target_word: word, verdict: "missing", heard_as: "", advice_ja: "録音後に判定します。" } as WordFeedback));
  const list = words.length ? words : fallback;
  return (
    <div className="heard-card">
      <div className="transcript"><button className="round"><Play size={16} /></button><strong>{evaluation?.verbatim ?? "録音後に聞き取り結果を表示します"}</strong><RefreshCw size={18} /></div>
      <div className="word-row">
        {list.map((word, index) => <button className={`word ${word.verdict}`} key={`${word.target_word}-${index}`} title={word.advice_ja}>{word.target_word}<small>{word.heard_as || "未判定"}</small></button>)}
      </div>
      <div className="legend"><span className="dot ok" />良い発音 <span className="dot unclear" />注意 <span className="dot wrong" />要練習</div>
    </div>
  );
}

function ScoreCard({ evaluation, progress }: { evaluation: AttemptEvaluation | null; progress: ProgressPayload | null }) {
  const score = evaluation?.pronunciation_score ?? progress?.average_score ?? 0;
  return (
    <section className="side-card">
      <h2>今日のスコア</h2>
      <div className="score-gauge" style={{ "--score": `${Math.max(0, Math.min(score, 100)) * 3.6}deg` } as React.CSSProperties}>
        <strong>{score || "--"}</strong><span>/100</span>
      </div>
      <dl>
        <div><dt>発話回数</dt><dd>{progress?.attempts ?? 0}回</dd></div>
        <div><dt>平均スコア</dt><dd>{progress?.average_score ?? "--"}点</dd></div>
        <div><dt>ベストスコア</dt><dd>{progress?.best_score ?? "--"}点</dd></div>
      </dl>
      {evaluation && <p className="advice">{nextStepLabel(evaluation.next_step)}: {evaluation.overall_advice_ja}</p>}
    </section>
  );
}

function ProgressCard({ progress }: { progress: ProgressPayload | null }) {
  const attempts = progress?.attempts ?? 0;
  return <section className="side-card"><h2>学習の進捗</h2><div className="level">Level {progress?.level ?? 1}</div><progress max={30} value={Math.min(attempts, 30)} /><p>今週の目標: 30回 / 現在 {attempts}回</p></section>;
}

function HistoryList({ progress }: { progress: ProgressPayload | null }) {
  return <section className="side-card"><h2>最近の練習履歴</h2><div className="history-list">{(progress?.recent ?? []).map((item) => <div className="history-item" key={`${item.created_at}-${item.phrase_en}`}><span>{item.phrase_en}</span><strong>{item.score}</strong></div>)}</div></section>;
}

async function api<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: `${response.status} ${response.statusText}` })) as { error?: string };
    throw new Error(body.error ?? "API request failed.");
  }
  return response.json() as Promise<T>;
}

function nextStepLabel(step: NextStep): string {
  return ({ retry: "もう一度練習", slow_practice: "ゆっくり練習", next_phrase: "次の文章へ", level_up: "レベルアップ候補" })[step];
}

createRoot(document.getElementById("root")!).render(<App />);
