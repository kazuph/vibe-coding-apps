import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Database,
  Download,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
} from "lucide-react";

import { fetchOpenCodeDefaults, streamChatCompletion, fetchModels } from "./lib/openAiCompat";
import { shouldHydrateFromExternalSettings, sqliteStore } from "./persistence/sqliteStore";
import { vibeLocalEngine } from "./pyodide/engine";
import type { BackendSettings, ChatMessage, HydratedState, SessionRecord, SessionSnapshot } from "./types";

const DEFAULT_STATUS = "Pyodide core を初期化しています…";

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const [hydrated, setHydrated] = useState<HydratedState | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelChoices, setModelChoices] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [settingsDraft, setSettingsDraft] = useState<BackendSettings | null>(null);

  async function refreshState(nextSelectedSessionId?: string | null) {
    const next = await sqliteStore.getHydratedState();
    setHydrated(next);
    setSettingsDraft(next.settings);

    const selected =
      nextSelectedSessionId ??
      selectedSessionId ??
      next.sessions[0]?.session.id ??
      null;
    setSelectedSessionId(selected);
  }

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        let next = await sqliteStore.getHydratedState();
        if (shouldHydrateFromExternalSettings(next.settings)) {
          const openCodeDefaults = await fetchOpenCodeDefaults();
          if (openCodeDefaults) {
            const mergedSettings = {
              ...next.settings,
              ...openCodeDefaults,
            };
            await sqliteStore.saveSettings(mergedSettings);
            next = await sqliteStore.getHydratedState();
            if (!cancelled) {
              setStatus("OpenCode の backend 設定を読み込みました。");
            }
          }
        }
        if (cancelled) return;
        await vibeLocalEngine.initialize(next);
        if (cancelled) return;
        setHydrated(next);
        setSettingsDraft(next.settings);
        setSelectedSessionId(next.sessions[0]?.session.id ?? null);
        setStatus((current) =>
          current === DEFAULT_STATUS ? "Pyodide core の準備ができました。" : current,
        );
      } catch (caughtError) {
        if (cancelled) return;
        setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  const sessions = hydrated?.sessions ?? [];
  const activeSession = sessions.find((entry) => entry.session.id === selectedSessionId) ?? null;
  const settings = settingsDraft ?? hydrated?.settings ?? null;

  const transcript = useMemo(() => {
    if (!activeSession) return [];
    const streamedMessage =
      streamingText.trim().length > 0
        ? [
            {
              id: "streaming",
              role: "assistant" as const,
              content: streamingText,
              createdAt: new Date().toISOString(),
              turnIndex: activeSession.messages.length,
            },
          ]
        : [];
    return [...activeSession.messages, ...streamedMessage];
  }, [activeSession, streamingText]);

  useEffect(() => {
    const node = chatLogRef.current;
    if (!node) return;

    const frame = window.requestAnimationFrame(() => {
      node.scrollTo({
        top: node.scrollHeight,
        behavior: streamingText ? "auto" : "smooth",
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [selectedSessionId, transcript, streamingText]);

  async function handleCreateSession() {
    try {
      setError("");
      setStatus("新しいセッションを作成しています…");
      const snapshot = await vibeLocalEngine.createSession("");
      await sqliteStore.insertSession(snapshot);
      await refreshState(snapshot.session.id);
      setStatus("新しいセッションを作成しました。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  async function handleSaveSettings() {
    if (!settingsDraft) return;
    try {
      setError("");
      await sqliteStore.saveSettings(settingsDraft);
      await refreshState(selectedSessionId);
      setStatus("Backend settings を保存しました。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  async function handleFetchModels() {
    if (!settings) return;
    try {
      setError("");
      setIsLoadingModels(true);
      setStatus("モデル一覧を取得しています…");
      const models = await fetchModels(settings);
      setModelChoices(models);
      if (!settings.model && models[0]) {
        const next = { ...settings, model: models[0] };
        setSettingsDraft(next);
        await sqliteStore.saveSettings(next);
        await refreshState(selectedSessionId);
      }
      setStatus(`モデルを ${models.length} 件取得しました。`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function ensureActiveSession() {
    if (activeSession) return activeSession;
    const snapshot = await vibeLocalEngine.createSession("");
    await sqliteStore.insertSession(snapshot);
    await refreshState(snapshot.session.id);
    return snapshot;
  }

  async function handleSendMessage() {
    if (!settings) return;
    if (!draft.trim()) return;
    if (!settings.baseUrl.trim() || !settings.model.trim()) {
      setError("baseUrl と model を先に設定してください。");
      return;
    }

    try {
      setError("");
      setIsSending(true);
      setStreamingText("");
      setStatus("メッセージを送信しています…");

      const current = await ensureActiveSession();
      const configuredSession = await vibeLocalEngine.setSessionConfig(
        current.session.id,
        settings.model,
        current.session.mode,
      );
      await sqliteStore.saveSession(configuredSession);

      const userDraft = draft.trim();
      setDraft("");

      const userAppend = await vibeLocalEngine.appendMessage(current.session.id, "user", userDraft);
      await sqliteStore.appendMessage(current.session.id, userAppend.message, userAppend.session);
      await refreshState(current.session.id);

      const latestState = await sqliteStore.exportSession(current.session.id);
      if (!latestState) {
        throw new Error("Active session could not be reloaded.");
      }

      let assistantText = "";
      const iterator = streamChatCompletion(settings, latestState.messages);
      while (true) {
        const { done, value } = await iterator.next();
        if (done) {
          assistantText = value ?? assistantText;
          break;
        }

        assistantText += value.textDelta;
        setStreamingText((prev) => prev + value.textDelta);
      }

      const assistantAppend = await vibeLocalEngine.appendMessage(
        current.session.id,
        "assistant",
        assistantText.trim(),
      );
      await sqliteStore.appendMessage(current.session.id, assistantAppend.message, assistantAppend.session);
      setStreamingText("");
      await refreshState(current.session.id);
      setStatus("応答を保存しました。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      setStatus("応答に失敗しました。");
    } finally {
      setIsSending(false);
    }
  }

  async function handleCompact() {
    if (!activeSession) return;
    try {
      setError("");
      setStatus("Transcript を compact しています…");
      const result = await vibeLocalEngine.compactSession(activeSession.session.id);
      if (result.changed) {
        await sqliteStore.applyCompaction(result);
        await refreshState(activeSession.session.id);
      }
      setStatus(result.changed ? "古い会話を要約しました。" : "compact は不要でした。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  async function handleExport() {
    if (!activeSession) return;
    const payload = await sqliteStore.exportSession(activeSession.session.id);
    if (!payload) return;
    downloadJson(`${activeSession.session.id}.json`, payload);
    setStatus("セッションを JSON で書き出しました。");
  }

  const pendingDisabled = !settings || isSending;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-card">
          <div>
            <p className="eyebrow">Browser Core</p>
            <h1>vibe-local Pyodide</h1>
          </div>
          <button className="ghost-button" onClick={() => void handleCreateSession()}>
            <Plus size={16} />
            New
          </button>
        </div>

        <div className="sidebar-section">
          <div className="section-head">
            <span>Sessions</span>
            <span>{sessions.length}</span>
          </div>
          <div className="session-list">
            {sessions.map((entry) => (
              <button
                key={entry.session.id}
                className={`session-card ${entry.session.id === selectedSessionId ? "is-active" : ""}`}
                onClick={() => setSelectedSessionId(entry.session.id)}
              >
                <strong>{entry.session.title || "New session"}</strong>
                <span>{entry.session.model || "model unset"}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <div className="section-head">
            <span>Status</span>
            <Database size={16} />
          </div>
          <p className="status-copy">{status}</p>
          {error ? <p className="error-copy">{error}</p> : null}
          <button className="ghost-button" onClick={() => setSettingsOpen((value) => !value)}>
            <Settings2 size={16} />
            {settingsOpen ? "Hide settings" : "Show settings"}
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="main-header">
          <div>
            <p className="eyebrow">Pyodide + SQLite</p>
            <h2>{activeSession?.session.title || "Start a new session"}</h2>
          </div>
          <div className="header-actions">
            <button className="ghost-button" onClick={() => void handleCompact()} disabled={!activeSession}>
              <Sparkles size={16} />
              Compact
            </button>
            <button className="ghost-button" onClick={() => void handleExport()} disabled={!activeSession}>
              <Download size={16} />
              Export
            </button>
          </div>
        </header>

        {settingsOpen && settings ? (
          <section className="settings-panel">
            <div className="section-head">
              <span>Backend settings</span>
              <button className="ghost-button" onClick={() => void handleFetchModels()} disabled={isLoadingModels}>
                {isLoadingModels ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
                Refresh models
              </button>
            </div>

            <div className="settings-grid">
              <label>
                <span>Base URL</span>
                <input
                  value={settings.baseUrl}
                  onChange={(event) =>
                    setSettingsDraft((current) => (current ? { ...current, baseUrl: event.target.value } : current))
                  }
                />
              </label>
              <label>
                <span>Model</span>
                <input
                  list="model-options"
                  value={settings.model}
                  onChange={(event) =>
                    setSettingsDraft((current) => (current ? { ...current, model: event.target.value } : current))
                  }
                />
                <datalist id="model-options">
                  {modelChoices.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </label>
              <label>
                <span>API Key</span>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(event) =>
                    setSettingsDraft((current) => (current ? { ...current, apiKey: event.target.value } : current))
                  }
                />
              </label>
              <label>
                <span>Temperature</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  value={settings.temperature}
                  onChange={(event) =>
                    setSettingsDraft((current) =>
                      current ? { ...current, temperature: Number(event.target.value || "0") } : current,
                    )
                  }
                />
              </label>
              <label>
                <span>Max tokens</span>
                <input
                  type="number"
                  min="64"
                  max="8192"
                  value={settings.maxTokens}
                  onChange={(event) =>
                    setSettingsDraft((current) =>
                      current ? { ...current, maxTokens: Number(event.target.value || "0") } : current,
                    )
                  }
                />
              </label>
              <label className="wide-field">
                <span>System prompt</span>
                <textarea
                  rows={3}
                  value={settings.systemPrompt}
                  onChange={(event) =>
                    setSettingsDraft((current) =>
                      current ? { ...current, systemPrompt: event.target.value } : current,
                    )
                  }
                />
              </label>
            </div>

            <button className="primary-button" onClick={() => void handleSaveSettings()}>
              <Save size={16} />
              Save settings
            </button>
          </section>
        ) : null}

        <section className="chat-panel">
          <div className="chat-log" ref={chatLogRef}>
            {transcript.length === 0 ? (
              <div className="empty-state">
                <Bot size={24} />
                <p>Backend を設定して、最初のメッセージを送るとここに transcript が出ます。</p>
              </div>
            ) : (
              transcript.map((message) => (
                <article key={message.id} className={`message-bubble role-${message.role}`}>
                  <div className="message-meta">
                    <strong>{message.role}</strong>
                    <span>{new Date(message.createdAt).toLocaleString()}</span>
                  </div>
                  <p>{message.content}</p>
                </article>
              ))
            )}
          </div>

          <div className="composer">
            <textarea
              value={draft}
              placeholder="例: vibe-local の transcript compaction をどう改善する？"
              rows={4}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  if (!pendingDisabled) void handleSendMessage();
                }
              }}
            />
            <div className="composer-footer">
              <span>
                {activeSession?.session.model || settings?.model || "model unset"}
              </span>
              <button className="primary-button" onClick={() => void handleSendMessage()} disabled={pendingDisabled}>
                {isSending ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
                Send
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
