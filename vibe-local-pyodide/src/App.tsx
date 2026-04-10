import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
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

import {
  continueSubAgentFromBrowser,
  continueAgentTaskFromBrowser,
  decideApprovalFromBrowser,
  fetchGitDiffStat,
  fetchGitStatus,
  fetchProjectInfo,
  fetchProjects,
  readRepoFileFromBrowser,
  runParallelAgentsFromBrowser,
  runAgentTurnFromBrowser,
  runProjectScriptFromBrowser,
  searchRepoCode,
  writeRepoFileFromBrowser,
} from "./lib/codingTools";
import { fetchOpenCodeDefaults, streamChatCompletion, fetchModels } from "./lib/openAiCompat";
import { agentosStore } from "./persistence/agentosStore";
import { localStore } from "./persistence/localStore";
import type { SessionStore } from "./persistence/sessionStore";
import {
  clampMaxTokens,
  MAX_TOKEN_PRESETS,
  normalizeBackendSettings,
  shouldHydrateFromExternalSettings,
  sqliteStore,
} from "./persistence/sqliteStore";
import type {
  ApprovalRecord,
  BackendSettings,
  HydratedState,
  ProjectInfo,
  ProjectInfoDetails,
  ToolExecutionTrace,
} from "./types";

const DEFAULT_STATUS = "Pyodide core を初期化しています…";

function MarkdownText({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

function summarizeToolInput(input: Record<string, unknown>) {
  const entries = Object.entries(input);
  if (entries.length === 0) {
    return "入力なし";
  }

  return entries
    .map(([key, value]) => {
      if (typeof value === "string") {
        const compact = value.replace(/\s+/g, " ").trim();
        return `${key}: ${compact.length > 120 ? `${compact.slice(0, 120)}…` : compact}`;
      }
      return `${key}: ${JSON.stringify(value)}`;
    })
    .join("\n");
}

function renderToolTraceSummary(trace: ToolExecutionTrace) {
  return [
    `${trace.name} [${trace.status}]`,
    summarizeToolInput((trace.input ?? {}) as Record<string, unknown>),
    trace.error ? `error: ${trace.error}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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

function getClosestMaxTokenPresetIndex(value: number) {
  return MAX_TOKEN_PRESETS.reduce((bestIndex, preset, index) => {
    const bestDistance = Math.abs(MAX_TOKEN_PRESETS[bestIndex] - value);
    const nextDistance = Math.abs(preset - value);
    return nextDistance < bestDistance ? index : bestIndex;
  }, 0);
}

export default function App() {
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const [sessionStore, setSessionStore] = useState<SessionStore>(localStore);
  const [hydrated, setHydrated] = useState<HydratedState | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState(DEFAULT_STATUS);
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelChoices, setModelChoices] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [codingPanelOpen, setCodingPanelOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<BackendSettings | null>(null);
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [projectInfo, setProjectInfo] = useState<ProjectInfoDetails | null>(null);
  const [selectedScript, setSelectedScript] = useState("");
  const [toolSearchQuery, setToolSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [toolOutputTitle, setToolOutputTitle] = useState("Tool output");
  const [toolOutput, setToolOutput] = useState("agentOS に接続すると coding tools を使えます。");
  const [isToolRunning, setIsToolRunning] = useState(false);
  const [filePathDraft, setFilePathDraft] = useState("");
  const [fileContentDraft, setFileContentDraft] = useState("");
  const [openedFilePath, setOpenedFilePath] = useState("");
  const [parallelPromptsDraft, setParallelPromptsDraft] = useState(
    "README.md を読んで repo の要点を3行でまとめる\n--\nvibe-local-pyodide の scripts を見て check/build/test を短く整理する",
  );
  const [parallelExecutionMode, setParallelExecutionMode] = useState<"act" | "plan" | "read-only">("read-only");

  async function refreshProjects(nextProject?: string) {
    if (sessionStore.mode !== "agentos") return;

    const discovered = await fetchProjects();
    setProjects(discovered);

    const preferred =
      nextProject ??
      selectedProject ??
      discovered.find((entry) => entry.relativePath === "vibe-local-pyodide")?.relativePath ??
      discovered[0]?.relativePath ??
      "";
    setSelectedProject(preferred);
  }

  async function refreshState(nextSelectedSessionId?: string | null, store = sessionStore) {
    const next = await store.getHydratedState();
    setHydrated(next);
    setSettingsDraft(normalizeBackendSettings(next.settings));

    const selected =
      nextSelectedSessionId ??
      selectedSessionId ??
      next.sessions[0]?.session.id ??
      null;
    setSelectedSessionId(selected);
  }

  async function syncSettingsModel(store: SessionStore, nextSettings: BackendSettings) {
    if (!nextSettings.baseUrl.trim()) {
      return normalizeBackendSettings(nextSettings);
    }

    try {
      const models = await fetchModels(nextSettings);
      setModelChoices(models);
      if (models.length === 0 || models.includes(nextSettings.model.trim())) {
        return normalizeBackendSettings(nextSettings);
      }

      const corrected = {
        ...nextSettings,
        model: models[0],
      };
      await store.saveSettings(normalizeBackendSettings(corrected));
      setStatus(`利用可能なモデルに合わせて ${models[0]} に切り替えました。`);
      return normalizeBackendSettings(corrected);
    } catch {
      return normalizeBackendSettings(nextSettings);
    }
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
        const nextStore = (await agentosStore.isAvailable()) ? agentosStore : localStore;
        if (cancelled) return;
        let hydratedState =
          nextStore.mode === "agentos"
            ? {
                ...(await nextStore.getHydratedState()),
                settings: next.settings,
              }
            : await nextStore.getHydratedState();
        const syncedSettings = await syncSettingsModel(nextStore, hydratedState.settings);
        hydratedState = {
          ...hydratedState,
          settings: syncedSettings,
        };
        if (cancelled) return;
        setSessionStore(nextStore);
        setHydrated(hydratedState);
        setSettingsDraft(normalizeBackendSettings(syncedSettings));
        setSelectedSessionId(hydratedState.sessions[0]?.session.id ?? null);
        setStatus((current) =>
          current === DEFAULT_STATUS
            ? nextStore.mode === "agentos"
              ? "agentOS actor に接続しました。"
              : "Pyodide core の準備ができました。"
            : current,
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

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (sessionStore.mode !== "agentos") {
        setProjects([]);
        setSelectedProject("");
        setProjectInfo(null);
        setSelectedScript("");
        return;
      }

      try {
        const discovered = await fetchProjects();
        if (cancelled) return;
        setProjects(discovered);
        const preferred =
          selectedProject ||
          discovered.find((entry) => entry.relativePath === "vibe-local-pyodide")?.relativePath ||
          discovered[0]?.relativePath ||
          "";
        setSelectedProject(preferred);
      } catch (caughtError) {
        if (cancelled) return;
        setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [sessionStore.mode]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (sessionStore.mode !== "agentos" || !selectedProject) {
        setProjectInfo(null);
        setSelectedScript("");
        return;
      }

      try {
        const details = await fetchProjectInfo(selectedProject);
        if (cancelled) return;
        setProjectInfo(details);
        const scripts = Object.keys(details.packageJson.scripts ?? {});
        setSelectedScript((current) => (current && scripts.includes(current) ? current : scripts[0] ?? ""));
        setFilePathDraft((current) => current || `${details.relativePath}/package.json`);
      } catch (caughtError) {
        if (cancelled) return;
        setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [selectedProject, sessionStore.mode]);

  const sessions = hydrated?.sessions ?? [];
  const activeSession = sessions.find((entry) => entry.session.id === selectedSessionId) ?? null;
  const settings = settingsDraft ?? hydrated?.settings ?? null;
  const pendingApprovals = (activeSession?.approvals ?? []).filter((approval) => approval.status === "pending");
  const activeTask = activeSession?.task ?? null;
  const activeMode = activeSession?.session.mode ?? "plan";

  function formatToolCalls(toolCalls: ToolExecutionTrace[]) {
    return toolCalls.flatMap((toolCall, index) => [
      `#${index + 1} ${toolCall.name} [${toolCall.status}]`,
      JSON.stringify(toolCall.input, null, 2),
      toolCall.outputPreview,
      toolCall.error ? `error: ${toolCall.error}` : "",
      "",
    ]);
  }

  function formatApproval(approval: ApprovalRecord) {
    return [
      `Approval ${approval.id}`,
      `${approval.toolName} [${approval.status}]`,
      approval.subAgentId ? `sub-agent: ${approval.subAgentId}` : "",
      JSON.stringify(approval.input, null, 2),
      approval.outputPreview,
      approval.error ? `error: ${approval.error}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

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
      const snapshot = await sessionStore.createSession("");
      await refreshState(snapshot.session.id, sessionStore);
      setStatus("新しいセッションを作成しました。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  async function handleSaveSettings() {
    if (!settingsDraft) return;
    try {
      setError("");
      const normalized = normalizeBackendSettings(settingsDraft);
      setSettingsDraft(normalized);
      await sessionStore.saveSettings(normalized);
      await refreshState(selectedSessionId, sessionStore);
      setStatus("Backend settings を保存しました。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  async function handleChangeMode(nextMode: "plan" | "act" | "yolo") {
    if (!settings) return;
    try {
      setError("");
      const current = await ensureActiveSession();
      await sessionStore.setSessionConfig(current.session.id, settings.model, nextMode);
      await refreshState(current.session.id, sessionStore);
      setStatus(
        nextMode === "plan"
          ? "Plan mode に切り替えました。"
          : nextMode === "act"
            ? "Act mode に切り替えました。"
            : "YOLO mode に切り替えました。",
      );
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
      if (models[0] && (!settings.model || !models.includes(settings.model))) {
        const next = normalizeBackendSettings({ ...settings, model: models[0] });
        setSettingsDraft(next);
        await sessionStore.saveSettings(next);
        await refreshState(selectedSessionId, sessionStore);
      }
      setStatus(`モデルを ${models.length} 件取得しました。`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function handleApprovalDecision(
    approvalId: string,
    decision: "approve" | "reject",
    continueAfter = false,
  ) {
    if (!activeSession) return;
    await withToolExecution(decision === "approve" ? "Approve tool" : "Reject tool", async () => {
      const result = await decideApprovalFromBrowser({
        sessionId: activeSession.session.id,
        approvalId,
        decision,
        continueAfter,
        settings: continueAfter ? settings ?? undefined : undefined,
      });
      await refreshState(activeSession.session.id, sessionStore);
      return [
        `${decision === "approve" ? "Approved" : "Rejected"} ${result.approval.toolName}`,
        "",
        formatApproval(result.approval),
        "",
        "Tool result",
        JSON.stringify(result.toolResult, null, 2),
        ...(result.continuation
          ? [
              "",
              "Continuation",
              ...formatToolCalls(result.continuation.toolCalls),
              "Final response",
              result.continuation.message.content,
            ]
          : []),
      ].join("\n");
    });
  }

  async function handleContinueTask() {
    if (!activeSession || !settings || !activeTask) return;
    await withToolExecution("Continue task", async () => {
      const result = await continueAgentTaskFromBrowser({
        sessionId: activeSession.session.id,
        settings,
      });
      await refreshState(activeSession.session.id, sessionStore);
      return [
        `Goal: ${result.task?.goal ?? activeTask.goal}`,
        `Status: ${result.task?.status ?? "unknown"}`,
        `Continue count: ${result.task?.continueCount ?? activeTask.continueCount}`,
        "",
        ...formatToolCalls(result.toolCalls),
        "Final response",
        result.message.content,
      ].join("\n");
    });
  }

  async function handleContinueSubAgent(subAgentId: string) {
    if (!activeSession || !settings) return;
    await withToolExecution("Continue sub-agent", async () => {
      const result = await continueSubAgentFromBrowser({
        sessionId: activeSession.session.id,
        subAgentId,
        settings,
      });
      await refreshState(activeSession.session.id, sessionStore);
      return [
        `Sub-agent: ${result.subAgent.id}`,
        `Status: ${result.subAgent.status}`,
        `Resume count: ${result.subAgent.resumeCount}`,
        result.noop ? `No-op: ${result.reason}` : "",
        "",
        ...formatToolCalls(result.subAgent.toolCalls),
        "Final response",
        result.subAgent.finalResponse || "(empty)",
      ].join("\n");
    });
  }

  async function handleRunParallelAgents() {
    if (!activeSession || !settings) return;
    const prompts = parallelPromptsDraft
      .split(/\n--\n|\n--|\r\n--\r\n/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (prompts.length === 0) return;

    await withToolExecution("Parallel agents", async () => {
      const result = await runParallelAgentsFromBrowser({
        executionMode: parallelExecutionMode,
        sessionId: activeSession.session.id,
        prompts,
        settings,
        selectedProject,
      });
      await refreshState(activeSession.session.id, sessionStore);
      return result.subAgents
        .flatMap((subAgent, index) => [
          `#${index + 1} ${subAgent.status}`,
          subAgent.prompt,
          subAgent.finalResponse,
          subAgent.error ? `error: ${subAgent.error}` : "",
          ...formatToolCalls(subAgent.toolCalls),
        ])
        .filter(Boolean)
        .join("\n");
    });
  }

  async function ensureActiveSession() {
    if (activeSession) return activeSession;
    const snapshot = await sessionStore.createSession("");
    await refreshState(snapshot.session.id, sessionStore);
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
      await sessionStore.setSessionConfig(
        current.session.id,
        settings.model,
        activeSession?.session.mode ?? current.session.mode,
      );

      const userDraft = draft.trim();
      setDraft("");
      if (sessionStore.mode === "agentos") {
        setStatus("agentOS coding agent を実行しています…");
        const result = await runAgentTurnFromBrowser({
          sessionId: current.session.id,
          prompt: userDraft,
          selectedProject,
          settings,
        });
        setToolOutputTitle("Agent run");
        setToolOutput(
          [
            `Project: ${selectedProject || "(not selected)"}`,
            `Mode: ${activeSession?.session.mode ?? current.session.mode}`,
            `Tool calls: ${result.toolCalls.length}`,
            `Pending approvals: ${result.approvals.length}`,
            "",
            ...formatToolCalls(result.toolCalls),
            ...(result.approvals.length > 0
              ? [
                  "Approvals",
                  ...result.approvals.flatMap((approval) => [formatApproval(approval), ""]),
                ]
              : []),
            "Final response",
            result.message.content,
          ].join("\n"),
        );
        await refreshState(current.session.id, sessionStore);
        setStatus(
          result.pendingApproval
            ? "agentOS coding agent が approval 待ちの操作を提案しました。"
            : result.toolCalls.length > 0
              ? `agentOS coding agent が ${result.toolCalls.length} 個の tool を使って応答しました。`
              : "agentOS coding agent が応答しました。",
        );
        return;
      }

      await sessionStore.appendMessage(current.session.id, "user", userDraft);
      await refreshState(current.session.id, sessionStore);

      const latestState = await sessionStore.exportSession(current.session.id);
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

      await sessionStore.appendMessage(
        current.session.id,
        "assistant",
        assistantText.trim(),
      );
      setStreamingText("");
      await refreshState(current.session.id, sessionStore);
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
      const result = await sessionStore.compactSession(activeSession.session.id);
      if (result.changed) {
        await refreshState(activeSession.session.id, sessionStore);
      }
      setStatus(result.changed ? "古い会話を要約しました。" : "compact は不要でした。");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    }
  }

  async function handleExport() {
    if (!activeSession) return;
    const payload = await sessionStore.exportSession(activeSession.session.id);
    if (!payload) return;
    downloadJson(`${activeSession.session.id}.json`, payload);
    setStatus("セッションを JSON で書き出しました。");
  }

  async function withToolExecution(
    title: string,
    runner: () => Promise<string>,
  ) {
    try {
      setError("");
      setIsToolRunning(true);
      setToolOutputTitle(title);
      setStatus(`${title} を実行しています…`);
      const output = await runner();
      setToolOutput(output);
      setStatus(`${title} を完了しました。`);
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : String(caughtError);
      setError(message);
      setToolOutput(message);
      setStatus(`${title} に失敗しました。`);
    } finally {
      setIsToolRunning(false);
    }
  }

  async function handleGitStatus() {
    await withToolExecution("Git status", async () => {
      const result = await fetchGitStatus();
      return [`Branch: ${result.branch || "(unknown)"}`, "", ...(result.status.length > 0 ? result.status : ["clean"])].join(
        "\n",
      );
    });
  }

  async function handleGitDiffStat() {
    await withToolExecution("Git diff stat", async () => {
      const result = await fetchGitDiffStat();
      return result.diffStat || result.stderr || "No diff.";
    });
  }

  async function handleSearchCode() {
    if (!toolSearchQuery.trim()) return;
    await withToolExecution("Repo search", async () => {
      const result = await searchRepoCode(toolSearchQuery.trim(), 20);
      setSearchResults(result.matches);
      return result.matches.length > 0 ? result.matches.join("\n") : "No matches.";
    });
  }

  async function handleRunScript() {
    if (!selectedProject || !selectedScript) return;
    await withToolExecution("Run script", async () => {
      const result = await runProjectScriptFromBrowser(selectedProject, selectedScript);
      return [
        `Command: ${result.command}`,
        `Exit code: ${result.exitCode}`,
        "",
        "$ stdout",
        result.stdout.trim() || "(empty)",
        "",
        "$ stderr",
        result.stderr.trim() || "(empty)",
      ].join("\n");
    });
  }

  function extractPathFromSearchResult(entry: string) {
    const [filePath] = entry.split(":");
    return filePath.replace(/^\.\//, "");
  }

  async function handleOpenFile(nextPath?: string) {
    const targetPath = (nextPath ?? filePathDraft).trim();
    if (!targetPath) return;

    await withToolExecution("Open file", async () => {
      const result = await readRepoFileFromBrowser(targetPath);
      setOpenedFilePath(result.path);
      setFilePathDraft(result.path);
      setFileContentDraft(result.content);
      return result.content || "(empty file)";
    });
  }

  async function handleSaveFile() {
    const targetPath = filePathDraft.trim();
    if (!targetPath) return;

    await withToolExecution("Save file", async () => {
      const result = await writeRepoFileFromBrowser(targetPath, fileContentDraft);
      setOpenedFilePath(result.path);
      return `Saved ${result.path}\nBytes: ${result.bytes}\nUpdated: ${result.updatedAt}`;
    });
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
          <p className="status-chip">
            {sessionStore.mode === "agentos" ? "agentOS actor" : "local Pyodide"}
          </p>
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
            <p className="eyebrow">
              {sessionStore.mode === "agentos" ? "agentOS + SQLite" : "Pyodide + SQLite"}
            </p>
            <h2>{activeSession?.session.title || "Start a new session"}</h2>
            <div className="header-meta">
              {sessionStore.mode === "agentos" ? (
                <>
                  <span className="header-pill">Directory: {selectedProject || "未選択"}</span>
                  {pendingApprovals.length > 0 ? (
                    <span className="header-pill is-alert">Approvals: {pendingApprovals.length}</span>
                  ) : null}
                </>
              ) : (
                <span className="header-pill">Chat only</span>
              )}
            </div>
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

        {settings ? (
          <section className="settings-panel">
            <div className="section-head">
              <div>
                <span>Backend settings</span>
                <p className="panel-intro">
                  LLM の接続先と model を設定する場所です。
                </p>
              </div>
              <div className="section-head-actions">
                {settingsOpen ? (
                  <button className="ghost-button" onClick={() => void handleFetchModels()} disabled={isLoadingModels}>
                    {isLoadingModels ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
                    Refresh models
                  </button>
                ) : null}
                <button className="ghost-button" onClick={() => setSettingsOpen((value) => !value)}>
                  <Settings2 size={16} />
                  {settingsOpen ? "Hide settings" : "Show settings"}
                </button>
              </div>
            </div>

            {settingsOpen ? (
              <>
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
                      min="4096"
                      max="65536"
                      value={settings.maxTokens}
                      onChange={(event) =>
                        setSettingsDraft((current) =>
                          current ? { ...current, maxTokens: clampMaxTokens(Number(event.target.value || "0")) } : current,
                        )
                      }
                    />
                  </label>
                  <label className="wide-field">
                    <span>Max tokens presets</span>
                    <div className="token-preset-control">
                      <input
                        type="range"
                        min="0"
                        max={String(MAX_TOKEN_PRESETS.length - 1)}
                        step="1"
                        value={String(getClosestMaxTokenPresetIndex(settings.maxTokens))}
                        onChange={(event) =>
                          setSettingsDraft((current) =>
                            current
                              ? { ...current, maxTokens: MAX_TOKEN_PRESETS[Number(event.target.value)] ?? current.maxTokens }
                              : current,
                          )
                        }
                      />
                      <div className="slider-labels" aria-hidden="true">
                        {MAX_TOKEN_PRESETS.map((preset, index) => (
                          <span
                            key={preset}
                            style={{
                              left: `${(index / (MAX_TOKEN_PRESETS.length - 1)) * 100}%`,
                            }}
                          >
                            {preset.toLocaleString()}
                          </span>
                        ))}
                      </div>
                    </div>
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

                {sessionStore.mode === "agentos" ? (
                  <div className="settings-grid">
                    <label>
                      <span>Directory</span>
                      <select
                        aria-label="Directory"
                        value={selectedProject}
                        onChange={(event) => setSelectedProject(event.target.value)}
                      >
                        {projects.map((project) => (
                          <option key={project.relativePath} value={project.relativePath}>
                            {project.relativePath}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                <button className="primary-button" onClick={() => void handleSaveSettings()}>
                  <Save size={16} />
                  Save settings
                </button>
              </>
            ) : (
              <p className="panel-summary">
                {settings.model || "model unset"} · {settings.baseUrl || "baseUrl unset"}
              </p>
            )}
          </section>
        ) : null}

        <section className="chat-panel">
          <div className="section-head chat-panel-head">
            <div>
              <span>Chat</span>
              <p className="panel-intro">
                ふだん使うメイン画面です。ここで依頼を投げて、agent の返答と進行状況を確認します。
              </p>
            </div>
          </div>
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
                  {message.role === "assistant" ? (
                    <MarkdownText>{message.content}</MarkdownText>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </article>
              ))
            )}
          </div>

          {pendingApprovals.length > 0 ? (
            <div className="inline-approval-panel" aria-label="Pending approvals">
              <div className="section-head">
                <div>
                  <span>Pending approvals</span>
                  <p className="panel-intro">必要な操作だけを一時表示しています。</p>
                </div>
                <span>{pendingApprovals.length}</span>
              </div>
              <div className="inline-approval-list">
                {pendingApprovals.map((approval) => (
                  <article key={approval.id} className="inline-approval-item">
                    <div className="message-meta">
                      <strong>{approval.toolName}</strong>
                      <span>{approval.subAgentId ? `sub-agent ${approval.subAgentId}` : approval.id}</span>
                    </div>
                    <p>{summarizeToolInput(approval.input)}</p>
                    {approval.outputPreview ? (
                      <details className="details-block">
                        <summary>最新の出力</summary>
                        <pre>{approval.outputPreview}</pre>
                      </details>
                    ) : null}
                    <div className="tool-actions">
                      <button
                        className="primary-button"
                        onClick={() => void handleApprovalDecision(approval.id, "approve")}
                        disabled={isToolRunning || sessionStore.mode !== "agentos"}
                      >
                        Approve
                      </button>
                      <button
                        className="primary-button"
                        onClick={() => void handleApprovalDecision(approval.id, "approve", true)}
                        disabled={isToolRunning || !settings || sessionStore.mode !== "agentos"}
                      >
                        Approve & continue
                      </button>
                      <button
                        className="ghost-button"
                        onClick={() => void handleApprovalDecision(approval.id, "reject")}
                        disabled={isToolRunning || sessionStore.mode !== "agentos"}
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

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
              <span>{activeSession?.session.model || settings?.model || "model unset"}</span>
              <div className="composer-actions">
                {sessionStore.mode === "agentos" ? (
                  <label className="composer-mode">
                    <span>Mode</span>
                    <select
                      aria-label="Mode"
                      value={activeMode}
                      onChange={(event) => void handleChangeMode(event.target.value as "plan" | "act" | "yolo")}
                    >
                      <option value="plan">plan</option>
                      <option value="act">act</option>
                      <option value="yolo">yolo</option>
                    </select>
                  </label>
                ) : null}
                <button
                  className="primary-button"
                  onClick={() => void handleSendMessage()}
                  disabled={pendingDisabled || (sessionStore.mode === "agentos" && !selectedProject)}
                >
                  {isSending ? <LoaderCircle size={16} className="spin" /> : <Sparkles size={16} />}
                  {sessionStore.mode === "agentos"
                    ? activeSession?.session.mode === "plan"
                      ? "Plan run"
                      : activeSession?.session.mode === "yolo"
                        ? "YOLO run"
                      : "Act run"
                    : "Send"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
