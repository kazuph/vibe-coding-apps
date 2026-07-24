import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookOpen, Check, Flame, History, Keyboard, Loader2, Mic, Play, Plus, Save, Send, Settings, Sparkles, Trash2, UserRound, Volume2, X } from "lucide-react";
import type { AppState, AttemptEvaluation, NextStep, Phrase, ProgressPayload, ScriptSentencePayload, SessionPayload, SessionSummary, UsageCostSummary, UserContextFact, VariantStyle, WordFeedback } from "../../shared/types";
import { encodeAudioBufferToWav16kMono } from "./audio/wav";
import "./styles.css";

type LoadState = "loading" | "ready" | "error";
type AppSession = SessionPayload["session"];
type SessionsPayload = { sessions: SessionSummary[]; active_session_id?: string | null };
type ContextPayload = { facts: UserContextFact[] };
type ContextDraftFact = { key: string; value: string };

function App() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [message, setMessage] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [draftText, setDraftText] = useState("");
  const [busy, setBusy] = useState(false);
  const [recordingPhase, setRecordingPhase] = useState<"idle" | "recording" | "submitting">("idle");
  const [evaluation, setEvaluation] = useState<AttemptEvaluation | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const [contextFacts, setContextFacts] = useState<UserContextFact[]>([]);
  const [contextText, setContextText] = useState("");
  const [contextPreview, setContextPreview] = useState<ContextDraftFact[]>([]);
  const [contextPreviewModel, setContextPreviewModel] = useState<string | null>(null);
  const [manualFact, setManualFact] = useState<ContextDraftFact>({ key: "", value: "" });
  const [usage, setUsage] = useState<UsageCostSummary | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    const timeoutId = recordingTimeoutRef.current;
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    async function loadInitialSession() {
      setLoadState("loading");
      const payload = await api<SessionPayload>("/api/session/start", { method: "POST" });
      const list = await api<SessionsPayload>("/api/sessions", { method: "GET" });
      const usagePayload = await api<UsageCostSummary>("/api/usage", { method: "GET" });
      setSession(payload.session);
      setProgress(payload.progress);
      setEvaluation(payload.session.latest_evaluation);
      setSessions(list.sessions);
      setUsage(usagePayload);
      setLoadState("ready");
    }
    loadInitialSession().catch((err: Error) => {
      setError(err.message);
      setLoadState("error");
    });
  }, []);

  useEffect(() => {
    const draft = session?.script?.interview?.draft_sentences_ja;
    if (draft?.length) setDraftText(draft.join("\n"));
  }, [session?.script?.id, session?.script?.interview?.draft_sentences_ja]);

  async function refreshSessions() {
    const payload = await api<SessionsPayload>("/api/sessions", { method: "GET" });
    setSessions(payload.sessions);
  }

  async function refreshUsage() {
    const payload = await api<UsageCostSummary>("/api/usage", { method: "GET" });
    setUsage(payload);
  }

  async function createNewSession() {
    setBusy(true);
    setError(null);
    try {
      const payload = await api<{ session: SessionPayload; sessions: SessionSummary[] }>("/api/session/new", { method: "POST" });
      setSession(payload.session.session);
      setProgress(payload.session.progress);
      setEvaluation(payload.session.session.latest_evaluation);
      setDraftText("");
      setMessage("");
      setSessions(payload.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "新しい会話を作れませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function switchSession(id: string) {
    if (id === session?.id) return;
    setBusy(true);
    setError(null);
    try {
      const payload = await api<{ session: SessionPayload; sessions: SessionSummary[] }>("/api/session/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      });
      setSession(payload.session.session);
      setProgress(payload.session.progress);
      setEvaluation(payload.session.session.latest_evaluation);
      setDraftText(payload.session.session.script?.interview?.draft_sentences_ja.join("\n") ?? "");
      setMessage("");
      setSessions(payload.sessions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "会話を切り替えられませんでした。");
    } finally {
      setBusy(false);
    }
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
      await refreshSessions();
      await refreshUsage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "会話の送信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    const sentences = draftText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (sentences.length < 2 || sentences.length > 4) {
      setError("ドラフトは2〜4文で入力してください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ session: SessionPayload }>("/api/script/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sentences_ja: sentences })
      });
      setSession(response.session.session);
      setProgress(response.session.progress);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ドラフト保存に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function approveDraft() {
    const sentences = draftText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (sentences.length < 2 || sentences.length > 4) {
      setError("ドラフトは2〜4文で承認してください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ session: SessionPayload }>("/api/script/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sentences_ja: sentences })
      });
      setSession(response.session.session);
      setProgress(response.session.progress);
      setEvaluation(null);
      await refreshUsage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "英語変種の生成に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function selectVariant(sentenceId: number, style: VariantStyle) {
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ session: SessionPayload }>("/api/script/select-variant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sentence_id: sentenceId, style })
      });
      setSession(response.session.session);
      setProgress(response.session.progress);
      setEvaluation(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "練習する英文の選択に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  async function openContextModal() {
    setContextOpen(true);
    setContextPreview([]);
    setContextPreviewModel(null);
    setContextBusy(true);
    setError(null);
    try {
      const payload = await api<ContextPayload>("/api/context", { method: "GET" });
      setContextFacts(payload.facts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録済み情報を読み込めませんでした。");
    } finally {
      setContextBusy(false);
    }
  }

  async function ingestContext() {
    const text = contextText.trim();
    if (!text) return;
    setContextBusy(true);
    setError(null);
    try {
      const payload = await api<{ facts: ContextDraftFact[]; model: string }>("/api/context/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text })
      });
      setContextPreview(payload.facts);
      setContextPreviewModel(payload.model);
      await refreshUsage();
    } catch (err) {
      setError(err instanceof Error ? err.message : "fact抽出に失敗しました。");
    } finally {
      setContextBusy(false);
    }
  }

  async function saveContextFacts(facts: ContextDraftFact[]) {
    if (!facts.length) return;
    setContextBusy(true);
    setError(null);
    try {
      const payload = await api<ContextPayload>("/api/context", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ facts })
      });
      setContextFacts(payload.facts);
      setContextPreview([]);
      setContextPreviewModel(null);
      setContextText("");
      setManualFact({ key: "", value: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "fact保存に失敗しました。");
    } finally {
      setContextBusy(false);
    }
  }

  async function deleteContextFact(id: number | undefined) {
    if (!id) return;
    setContextBusy(true);
    setError(null);
    try {
      const payload = await api<ContextPayload>("/api/context", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id })
      });
      setContextFacts(payload.facts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "fact削除に失敗しました。");
    } finally {
      setContextBusy(false);
    }
  }

  async function toggleRecording() {
    if (recordingPhase === "recording") {
      if (recordingTimeoutRef.current !== null) {
        window.clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      mediaRef.current?.stop();
      setRecordingPhase("submitting");
      return;
    }
    if (!session?.current_phrase?.en || !session?.active_sentence?.id) {
      setRecordingPhase("idle");
      setError("練習する英文がまだありません。先に話題を選んでください。");
      return;
    }
    setError(null);
    setEvaluation(null);
    chunksRef.current = [];
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    let recordingTimeoutId: number | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 48000 } });
      const recorder = new MediaRecorder(stream);
      let recorderFailed = false;
      mediaRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        recorderFailed = true;
        if (recordingTimeoutId !== null && recordingTimeoutRef.current === recordingTimeoutId) {
          window.clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        setRecordingPhase("idle");
        setError("録音中にエラーが発生しました。もう一度試してください。");
      };
      recorder.onstop = () => {
        if (recordingTimeoutId !== null && recordingTimeoutRef.current === recordingTimeoutId) {
          window.clearTimeout(recordingTimeoutRef.current);
          recordingTimeoutRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        if (recorderFailed) return;
        setRecordingPhase("submitting");
        void submitRecording(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      setRecordingPhase("recording");
      recordingTimeoutId = window.setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop();
          setRecordingPhase("submitting");
        }
      }, 30_000);
      recordingTimeoutRef.current = recordingTimeoutId;
    } catch (err) {
      if (recordingTimeoutId !== null && recordingTimeoutRef.current === recordingTimeoutId) {
        window.clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      setRecordingPhase("idle");
      setError(`マイクを開始できませんでした: ${err instanceof Error ? err.message : "権限を確認してください。"}`);
    }
  }

  async function submitRecording(blob: Blob) {
    const phrase = session?.current_phrase?.en;
    const sentenceId = session?.active_sentence?.id;
    if (!phrase || !sentenceId) {
      setRecordingPhase("idle");
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
      form.set("sentence_id", String(sentenceId));
      form.set("audio", new File([wav], "practice.wav", { type: "audio/wav" }));
      const result = await api<{ evaluation: AttemptEvaluation; progress: ProgressPayload }>("/api/attempt", {
        method: "POST",
        body: form
      });
      setRecordingPhase("idle");
      setEvaluation(result.evaluation);
      setProgress(result.progress);
      setSession((current) => current ? { ...current, state: "feedback", phase: "feedback" } : current);
      await refreshUsage();
    } catch (err) {
      setError(`録音評価に失敗しました: ${err instanceof Error ? err.message : "Gemini APIの応答を確認してください。"}`);
    } finally {
      setRecordingPhase("idle");
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
      const audioUrl = URL.createObjectURL(await response.blob());
      let released = false;
      const revokeAudioUrl = () => {
        if (released) return;
        released = true;
        URL.revokeObjectURL(audioUrl);
      };
      const audio = new Audio(audioUrl);
      audio.addEventListener("ended", revokeAudioUrl, { once: true });
      audio.addEventListener("error", revokeAudioUrl, { once: true });
      try {
        await audio.play();
      } catch (err) {
        revokeAudioUrl();
        throw err;
      }
      await refreshUsage();
    } catch (err) {
      setError(`お手本音声を再生できませんでした: ${err instanceof Error ? err.message : "Gemini TTSの応答を確認してください。"}`);
    } finally {
      setTtsBusy(false);
    }
  }

  const phrase = session?.current_phrase;
  const phase = (session?.phase ?? session?.state ?? "topic") as AppState;
  const chips = session?.script?.interview?.chips ?? [];
  const words = useMemo(() => evaluation?.words ?? [], [evaluation]);
  const recordingActive = recordingPhase === "recording";

  if (loadState === "loading") {
    return <Shell><div className="loading"><Loader2 className="spin" /> Kaiを起動しています...</div></Shell>;
  }

  return (
    <Shell>
      <header className="topbar">
        <div className="brand"><span>eikaiwa</span>-buddy<small>Gemini-powered (3.5-flash / 3.1-flash-lite)</small></div>
        <nav>
          <button className="nav active"><Mic size={18} />スピーキング練習</button>
          <button className="nav"><BookOpen size={18} />単語帳</button>
          <button className="nav"><History size={18} />学習履歴</button>
          <button className="nav"><Settings size={18} />設定</button>
        </nav>
        <div className="streak"><Flame size={18} />7日連続</div>
      </header>

      <main className="layout">
        <aside className="app-sidebar">
          <button className="new-chat-button" onClick={() => void createNewSession()} disabled={busy}><Plus size={18} />新しく作る</button>
          <SessionList activeId={session?.id ?? null} sessions={sessions} onPick={(id) => void switchSession(id)} />
          <div className="sidebar-actions">
            <button onClick={() => void openContextModal()}><UserRound size={17} />Kaiに自分のことを教える</button>
            <button><Settings size={17} />設定</button>
          </div>
        </aside>

        <section className="conversation-panel">
          <div className="conversation-stream">
            <div className="mode-tabs">
              <button className="selected"><Sparkles size={18} />フリートーク</button>
              <button>シャドーイング</button>
              <button>ロールプレイ</button>
            </div>
            <ChatLog history={session?.chat_history ?? []} />
            {phase === "topic" && !session?.script_id && <TopicGrid onPick={(topic) => sendChat(topic)} disabled={busy} />}

            {phase === "draft" ? (
              <DraftStage value={draftText} busy={busy} onChange={setDraftText} onSave={() => void saveDraft()} onApprove={() => void approveDraft()} />
            ) : phase === "variants" ? (
              <VariantsStage session={session} busy={busy} onSelect={(sentenceId, style) => void selectVariant(sentenceId, style)} />
            ) : phase === "practice" || phase === "feedback" ? (
              <PracticeStage
                busy={busy}
                evaluation={evaluation}
                phrase={phrase}
                recordingActive={recordingActive}
                recordingPhase={recordingPhase}
                ttsBusy={ttsBusy}
                words={words}
                onPlayTts={playTts}
                onToggleRecording={toggleRecording}
              />
            ) : (
              <InterviewStage phase={phase} busy={busy} />
            )}
            {error && <div className="error-banner">{error}</div>}
          </div>
          <Composer
            busy={busy}
            chips={phase === "interview" ? chips : []}
            message={message}
            onChange={setMessage}
            onSend={(text) => void sendChat(text)}
          />
        </section>

        <aside className="progress-panel">
          <ScoreCard evaluation={evaluation} progress={progress} />
          <UsageCostCard usage={usage} />
          <ProgressCard progress={progress} />
          <HistoryList progress={progress} />
        </aside>
      </main>
      {contextOpen && (
        <ContextModal
          busy={contextBusy}
          facts={contextFacts}
          manualFact={manualFact}
          previewFacts={contextPreview}
          previewModel={contextPreviewModel}
          text={contextText}
          onAddManual={() => void saveContextFacts([manualFact])}
          onChangeManual={setManualFact}
          onChangeText={setContextText}
          onClose={() => setContextOpen(false)}
          onDelete={(id) => void deleteContextFact(id)}
          onIngest={() => void ingestContext()}
          onSavePreview={(facts) => void saveContextFacts(facts)}
          onUpdatePreview={setContextPreview}
        />
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="app">{children}</div>;
}

function SessionList({ activeId, sessions, onPick }: { activeId: string | null; sessions: SessionSummary[]; onPick: (id: string) => void }) {
  return (
    <section className="session-list" aria-label="セッション履歴">
      <h2>セッション履歴</h2>
      <div>
        {sessions.map((item) => (
          <button className={item.id === activeId ? "active" : ""} key={item.id} onClick={() => onPick(item.id)}>
            <strong>{item.title}</strong>
            <span>{formatSessionDate(item.updated_at)} · {phaseLabel(item.phase)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ChatLog({ history }: { history: AppSession["chat_history"] }) {
  return (
    <section className="chat-log" aria-label="コーチとの会話">
      {history.map((item, index) => (
        <div key={`${item.created_at}-${index}`} className={`bubble ${item.role}`}>
          <strong>{item.role === "coach" ? "Kai" : "あなた"} {item.model && <ModelTag model={item.model} />}</strong>
          <p>{item.text}</p>
        </div>
      ))}
    </section>
  );
}

function Composer({
  busy,
  chips,
  message,
  onChange,
  onSend
}: {
  busy: boolean;
  chips: string[];
  message: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [message]);
  const submit = () => {
    const trimmed = message.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
  };
  return (
    <div className="composer-wrap">
      {chips.length > 0 && (
        <div className="chip-row" aria-label="回答チップ">
          {chips.map((chip) => <button key={chip} disabled={busy} onClick={() => onSend(chip)}>{chip}</button>)}
        </div>
      )}
      <form className="composer" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <textarea
          ref={ref}
          value={message}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="日本語で話したいことを入力... Shift+Enterで改行"
        />
        <button type="submit" disabled={busy || !message.trim()} aria-label="送信">
          {busy ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
        </button>
      </form>
    </div>
  );
}

function ContextModal({
  busy,
  facts,
  manualFact,
  previewFacts,
  previewModel,
  text,
  onAddManual,
  onChangeManual,
  onChangeText,
  onClose,
  onDelete,
  onIngest,
  onSavePreview,
  onUpdatePreview
}: {
  busy: boolean;
  facts: UserContextFact[];
  manualFact: ContextDraftFact;
  previewFacts: ContextDraftFact[];
  previewModel: string | null;
  text: string;
  onAddManual: () => void;
  onChangeManual: (fact: ContextDraftFact) => void;
  onChangeText: (value: string) => void;
  onClose: () => void;
  onDelete: (id: number | undefined) => void;
  onIngest: () => void;
  onSavePreview: (facts: ContextDraftFact[]) => void;
  onUpdatePreview: (facts: ContextDraftFact[]) => void;
}) {
  const canSaveManual = manualFact.key.trim() && manualFact.value.trim();
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="context-modal" role="dialog" aria-modal="true" aria-labelledby="context-modal-title">
        <div className="modal-heading">
          <div>
            <span className="label">プロフィール注入</span>
            <h1 id="context-modal-title">Kaiに自分のことを教える</h1>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="閉じる"><X size={20} /></button>
        </div>

        <div className="context-grid">
          <section className="context-card">
            <h2>プロフィールやSNS投稿を貼る</h2>
            <textarea
              aria-label="プロフィールやSNS投稿"
              value={text}
              onChange={(event) => onChangeText(event.target.value)}
              placeholder="例: AIツールを作るエンジニアです。週末は喫茶店巡りをしていて、海外の人にも自分の仕事を説明できるようになりたいです。"
              rows={8}
            />
            <button className="primary-action" onClick={onIngest} disabled={busy || !text.trim()}>
              {busy ? <Loader2 className="spin" size={18} /> : <Sparkles size={18} />}factを抽出
            </button>
          </section>

          <section className="context-card">
            <h2>抽出プレビュー {previewModel && <ModelTag model={previewModel} />}</h2>
            {previewFacts.length ? (
              <>
                <FactEditor facts={previewFacts} onChange={onUpdatePreview} />
                <button className="primary-action" onClick={() => onSavePreview(previewFacts)} disabled={busy}>プレビューを保存</button>
              </>
            ) : <p className="muted">抽出結果はここに表示されます。保存するまでKaiには登録されません。</p>}
          </section>
        </div>

        <section className="context-card">
          <h2>保存済みfact</h2>
          <div className="manual-fact-row">
            <input aria-label="fact key" value={manualFact.key} onChange={(event) => onChangeManual({ ...manualFact, key: event.target.value })} placeholder="key 例: job" />
            <input aria-label="fact value" value={manualFact.value} onChange={(event) => onChangeManual({ ...manualFact, value: event.target.value })} placeholder="value 例: エンジニア" />
            <button className="secondary" onClick={onAddManual} disabled={busy || !canSaveManual}><Plus size={17} />追加</button>
          </div>
          <div className="fact-list">
            {facts.map((fact) => (
              <div className="fact-row" key={fact.id ?? `${fact.key}-${fact.value}`}>
                <strong>{fact.key}</strong>
                <span>{fact.value}</span>
                <small>{fact.source}</small>
                <button className="round" onClick={() => onDelete(fact.id)} aria-label={`${fact.key}を削除`}><Trash2 size={16} /></button>
              </div>
            ))}
            {!facts.length && <p className="muted">まだ保存済みfactはありません。</p>}
          </div>
        </section>
      </section>
    </div>
  );
}

function FactEditor({ facts, onChange }: { facts: ContextDraftFact[]; onChange: (facts: ContextDraftFact[]) => void }) {
  return (
    <div className="fact-editor">
      {facts.map((fact, index) => (
        <div className="manual-fact-row" key={`${fact.key}-${index}`}>
          <input aria-label={`preview key ${index + 1}`} value={fact.key} onChange={(event) => onChange(facts.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} />
          <input aria-label={`preview value ${index + 1}`} value={fact.value} onChange={(event) => onChange(facts.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))} />
          <button className="round" onClick={() => onChange(facts.filter((_, itemIndex) => itemIndex !== index))} aria-label={`${fact.key}をプレビューから削除`}><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
}

function TopicGrid({ onPick, disabled }: { onPick: (topic: string) => void; disabled: boolean }) {
  const topics = ["自己紹介", "仕事の話", "旅行の会話", "週末の話", "好きなもの", "趣味の話"];
  return (
    <section className="topic-picker" aria-labelledby="topic-picker-title">
      <h3 id="topic-picker-title">今日は何を一緒に作る？</h3>
      <div className="topic-grid">
        {topics.map((topic) => <button key={topic} disabled={disabled} onClick={() => onPick(topic)}>{topic}</button>)}
      </div>
    </section>
  );
}

function InterviewStage({ phase, busy }: { phase: AppState; busy: boolean }) {
  return (
    <section className="co-writing-stage">
      <span className="label">内容すり合わせ</span>
      <h1>{phase === "topic" ? "まずは話したい場面を選びます" : "Kaiと日本語で言いたい内容を作っています"}</h1>
      <p>{busy ? "Kaiが次の質問を考えています..." : "下のチップか入力欄で答えてください。ここではまだ英語は出しません。"}</p>
    </section>
  );
}

function DraftStage({ value, busy, onChange, onSave, onApprove }: { value: string; busy: boolean; onChange: (value: string) => void; onSave: () => void; onApprove: () => void }) {
  const sentences = value.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return (
    <section className="draft-stage">
      <div className="section-heading">
        <div>
          <span className="label">日本語ドラフト</span>
          <h1>この内容で練習する台本を作ります</h1>
        </div>
      </div>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={7} aria-label="日本語ドラフト" />
      <div className="draft-actions">
        <span>{sentences.length} / 2〜4文</span>
        <button className="secondary" onClick={onSave} disabled={busy || sentences.length < 2 || sentences.length > 4}><Save size={18} />下書きを保存</button>
        <button className="primary-action" onClick={onApprove} disabled={busy || sentences.length < 2 || sentences.length > 4}>
          {busy ? <Loader2 className="spin" size={18} /> : <Check size={18} />}この内容でいく!
        </button>
      </div>
    </section>
  );
}

function VariantsStage({ session, busy, onSelect }: { session: AppSession | null; busy: boolean; onSelect: (sentenceId: number, style: VariantStyle) => void }) {
  const sentences = session?.script?.sentences ?? [];
  const activePosition = session?.active_sentence_position ?? 1;
  const active = sentences.find((sentence) => sentence.position === activePosition) ?? sentences[0];
  if (!active) {
    return <section className="co-writing-stage"><span className="label">英語変種</span><h1>英語候補を準備しています</h1></section>;
  }
  return (
    <section className="variants-stage">
      <div className="section-heading">
        <div>
          <span className="label">文 {active.position}</span>
          <h1>ネイティブならこう言います</h1>
          <p>{active.ja_text}</p>
        </div>
      </div>
      <div className="variant-grid">
        {active.variants.map((variant) => (
          <button className="variant-card" key={variant.style} disabled={busy} onClick={() => onSelect(active.id, variant.style)}>
            <span>{styleLabel(variant.style)} {variant.model && <ModelTag model={variant.model} />}</span>
            <strong>{variant.en}</strong>
            <small>{variant.why_ja}</small>
            {variant.traps.length > 0 && <em>{variant.traps.map((trap) => trap.word).join(" / ")}</em>}
          </button>
        ))}
      </div>
      <ScriptMiniMap sentences={sentences} activePosition={active.position} />
    </section>
  );
}

function ScriptMiniMap({ sentences, activePosition }: { sentences: ScriptSentencePayload[]; activePosition: number }) {
  return (
    <div className="script-mini-map" aria-label="台本の文一覧">
      {sentences.map((sentence) => (
        <span className={sentence.position === activePosition ? "current" : ""} key={sentence.id}>{sentence.position}</span>
      ))}
    </div>
  );
}

function PracticeStage({
  busy,
  evaluation,
  phrase,
  recordingActive,
  recordingPhase,
  ttsBusy,
  words,
  onPlayTts,
  onToggleRecording
}: {
  busy: boolean;
  evaluation: AttemptEvaluation | null;
  phrase: Phrase | null | undefined;
  recordingActive: boolean;
  recordingPhase: "idle" | "recording" | "submitting";
  ttsBusy: boolean;
  words: WordFeedback[];
  onPlayTts: (slow?: boolean) => Promise<void>;
  onToggleRecording: () => Promise<void>;
}) {
  return (
    <>
      <section className="phrase-section">
        <div className="section-heading">
          <h1>今日のフレーズ</h1>
          <button className="icon-button" onClick={() => void onPlayTts(false)} disabled={!phrase || ttsBusy} aria-label="お手本を聞く">
            {ttsBusy ? <Loader2 className="spin" size={22} /> : <Volume2 size={22} />}
          </button>
        </div>
        {phrase ? <PhraseCard phrase={phrase} /> : <EmptyPhrase busy={busy} />}
      </section>

      <section className="speech-section">
        <h2>あなたの発話</h2>
        <HeardWords phrase={phrase?.en ?? ""} evaluation={evaluation} words={words} />
        <div className="mic-box">
          <button
            className={`mic-button ${recordingActive ? "recording" : ""}`}
            onClick={() => void onToggleRecording()}
            disabled={!phrase || recordingPhase === "submitting" || (busy && recordingPhase !== "recording")}
            aria-label={recordingActive ? "録音を停止" : "録音を開始"}
          >
            {busy ? <Loader2 className="spin" /> : <Mic size={44} />}
          </button>
          <div>
            <strong>{recordingActive ? "録音中...もう一度タップで停止" : recordingPhase === "submitting" ? "録音をGeminiで評価中" : "タップして話す"}</strong>
            <p>録音はブラウザ内で16kHz mono WAVに変換してからGeminiへ送ります</p>
          </div>
          <button className="secondary" onClick={() => void onPlayTts(true)} disabled={!phrase || ttsBusy}><Play size={18} />ゆっくり聞く</button>
          <button className="secondary"><Keyboard size={18} />キーボード入力</button>
        </div>
      </section>
    </>
  );
}

function PhraseCard({ phrase }: { phrase: Phrase }) {
  return (
    <div className="phrase-card">
      <span className="label">提案例</span>
      {phrase.model && <ModelTag model={phrase.model} />}
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
  return <div className="empty">{busy ? "Kaiが英文を考えています..." : "下の入力欄から、日本語で話したい内容を送ってください。"}</div>;
}

function HeardWords({ phrase, evaluation, words }: { phrase: string; evaluation: AttemptEvaluation | null; words: WordFeedback[] }) {
  const fallback = phrase.split(/\s+/).filter(Boolean).map((word) => ({ target_word: word, verdict: "missing", heard_as: "", advice_ja: "録音後に判定します。" } as WordFeedback));
  const list = words.length ? words : fallback;
  return (
    <div className="heard-card">
      <div className="transcript"><Mic size={18} aria-hidden="true" /><strong>{evaluation?.verbatim ?? "録音後に聞き取り結果を表示します"} {evaluation?.model && <ModelTag model={evaluation.model} label="評価" />}</strong></div>
      <div className="word-row">
        {list.map((word, index) => <span className={`word ${word.verdict}`} key={`${word.target_word}-${index}`} title={word.advice_ja}>{word.target_word}<small>{word.heard_as || "未判定"}</small></span>)}
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

function UsageCostCard({ usage }: { usage: UsageCostSummary | null }) {
  const breakdown = usage?.breakdown ?? [];
  return (
    <section className="side-card usage-card">
      <h2>API利用料金</h2>
      <dl>
        <div><dt>今日</dt><dd>{formatUsd(usage?.totals.today_usd ?? 0)}</dd></div>
        <div><dt>今月</dt><dd>{formatUsd(usage?.totals.month_usd ?? 0)}</dd></div>
        <div><dt>累計</dt><dd>{formatUsd(usage?.totals.all_time_usd ?? 0)}</dd></div>
      </dl>
      {usage?.tts_pricing === "unset" && <p className="advice">TTS単価未設定</p>}
      <details>
        <summary>モデル別内訳</summary>
        <div className="usage-breakdown">
          {breakdown.map((item) => (
            <div className="usage-row" key={`${item.model}-${item.kind}`}>
              <span>{item.model}</span>
              <small>{item.kind} / in {item.input_tokens}+audio {item.audio_input_tokens} / out {item.output_tokens}</small>
              <strong>{formatUsd(item.cost_usd)}</strong>
            </div>
          ))}
          {!breakdown.length && <p className="muted">まだGemini利用記録はありません。</p>}
        </div>
      </details>
      <p className="usage-note">{usage?.note ?? "従量課金定価での換算値です。"}</p>
    </section>
  );
}

function ProgressCard({ progress }: { progress: ProgressPayload | null }) {
  const attempts = progress?.attempts ?? 0;
  return <section className="side-card"><h2>学習の進捗</h2><div className="level">Level {progress?.level ?? 1}</div><progress max={30} value={Math.min(attempts, 30)} /><p>今週の目標: 30回 / 現在 {attempts}回</p></section>;
}

function ModelTag({ model, label }: { model: string; label?: string }) {
  return <span className="model-tag">{label ? `${label}: ` : ""}{model}</span>;
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

function phaseLabel(phase: AppState): string {
  return ({ topic: "新規", propose: "提案", interview: "すり合わせ", draft: "下書き", variants: "英語候補", practice: "練習", feedback: "結果", script_done: "完了" })[phase];
}

function formatSessionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function styleLabel(style: VariantStyle): string {
  return ({ simple: "シンプル版", natural: "ナチュラル版", advanced: "こなれ版" })[style];
}

function formatUsd(value: number): string {
  return `$${value.toFixed(6)}`;
}

createRoot(document.getElementById("root")!).render(<App />);
