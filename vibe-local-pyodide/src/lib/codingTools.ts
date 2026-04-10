import type {
  ApprovalDecisionResult,
  AgentRunResult,
  GitDiffStatResult,
  GitStatusResult,
  ParallelAgentRunResult,
  ProjectInfo,
  ProjectInfoDetails,
  RepoFileResult,
  RepoFileWriteResult,
  ScriptRunResult,
  SearchCodeResult,
  SubAgentContinueResult,
} from "../types";

const AGENT_REQUEST_TIMEOUT_MS = 180_000;

function parseErrorText(text: string, fallback: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(trimmed) as { error?: string; message?: string };
    return parsed.error ?? parsed.message ?? trimmed;
  } catch {
    return trimmed;
  }
}

async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: { errorContext?: string; timeoutMs?: number },
) {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs;
  const timeoutId =
    timeoutMs && timeoutMs > 0
      ? window.setTimeout(() => controller.abort(`${options?.errorContext ?? "リクエスト"} がタイムアウトしました。`), timeoutMs)
      : null;

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      const fallback = `${options?.errorContext ?? "リクエスト"} に失敗しました。(HTTP ${response.status})`;
      throw new Error(parseErrorText(await response.text(), fallback));
    }

    const raw = await response.text();
    if (!raw.trim()) {
      throw new Error(`${options?.errorContext ?? "サーバー"} から空のレスポンスが返りました。`);
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`${options?.errorContext ?? "サーバー"} から不正な JSON が返りました。`);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        typeof error.message === "string" && error.message.trim()
          ? error.message
          : `${options?.errorContext ?? "リクエスト"} がタイムアウトしました。`,
      );
    }
    throw error;
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function validateAgentRunResult(result: AgentRunResult, context: string) {
  if (!result?.message || typeof result.message.content !== "string") {
    throw new Error(`${context} から応答メッセージを受け取れませんでした。`);
  }
  if (result.message.content.trim().length === 0) {
    throw new Error(`${context} が空の応答を返しました。`);
  }
  if (!Array.isArray(result.toolCalls) || !Array.isArray(result.approvals)) {
    throw new Error(`${context} から不完全なレスポンスが返りました。`);
  }
  return result;
}

export async function fetchProjects() {
  return await requestJson<ProjectInfo[]>("/__vibe_local/coding/projects", undefined, {
    errorContext: "Directory 一覧の取得",
  });
}

export async function fetchProjectInfo(project: string) {
  const url = new URL("/__vibe_local/coding/project", window.location.origin);
  url.searchParams.set("project", project);
  return await requestJson<ProjectInfoDetails>(url, undefined, {
    errorContext: "Directory 情報の取得",
  });
}

export async function fetchGitStatus() {
  return await requestJson<GitStatusResult>("/__vibe_local/coding/git/status", undefined, {
    errorContext: "Git status",
  });
}

export async function fetchGitDiffStat() {
  return await requestJson<GitDiffStatResult>("/__vibe_local/coding/git/diff", undefined, {
    errorContext: "Git diff",
  });
}

export async function searchRepoCode(query: string, maxResults = 20) {
  const url = new URL("/__vibe_local/coding/search", window.location.origin);
  url.searchParams.set("query", query);
  url.searchParams.set("maxResults", String(maxResults));
  return await requestJson<SearchCodeResult>(url, undefined, {
    errorContext: "Repo search",
  });
}

export async function runProjectScriptFromBrowser(
  project: string,
  script: string,
  timeoutMs = 120_000,
) {
  return await requestJson<ScriptRunResult>(
    "/__vibe_local/coding/run-script",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        project,
        script,
        timeoutMs,
      }),
    },
    {
      errorContext: "Script 実行",
      timeoutMs: timeoutMs + 5_000,
    },
  );
}

export async function readRepoFileFromBrowser(filePath: string) {
  const url = new URL("/__vibe_local/coding/file", window.location.origin);
  url.searchParams.set("path", filePath);
  return await requestJson<RepoFileResult>(url, undefined, {
    errorContext: "ファイル読み込み",
  });
}

export async function writeRepoFileFromBrowser(filePath: string, content: string) {
  return await requestJson<RepoFileWriteResult>(
    "/__vibe_local/coding/file",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: filePath,
        content,
      }),
    },
    {
      errorContext: "ファイル保存",
    },
  );
}

export async function runAgentTurnFromBrowser(payload: {
  sessionId: string;
  prompt: string;
  selectedProject?: string;
  settings: {
    apiKey: string;
    baseUrl: string;
    maxTokens: number;
    model: string;
    systemPrompt: string;
    temperature: number;
  };
}) {
  const result = await requestJson<AgentRunResult>(
    "/__vibe_local/agentos/session/agent-run",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    {
      errorContext: "agentOS coding agent",
      timeoutMs: AGENT_REQUEST_TIMEOUT_MS,
    },
  );
  return validateAgentRunResult(result, "agentOS coding agent");
}

export async function decideApprovalFromBrowser(payload: {
  approvalId: string;
  continueAfter?: boolean;
  decision: "approve" | "reject";
  sessionId: string;
  settings?: {
    apiKey: string;
    baseUrl: string;
    maxTokens: number;
    model: string;
    systemPrompt: string;
    temperature: number;
  };
}) {
  return await requestJson<ApprovalDecisionResult>(
    "/__vibe_local/agentos/session/approval",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    {
      errorContext: "Approval 実行",
      timeoutMs: AGENT_REQUEST_TIMEOUT_MS,
    },
  );
}

export async function continueAgentTaskFromBrowser(payload: {
  sessionId: string;
  settings?: {
    apiKey: string;
    baseUrl: string;
    maxTokens: number;
    model: string;
    systemPrompt: string;
    temperature: number;
  };
}) {
  const result = await requestJson<AgentRunResult>(
    "/__vibe_local/agentos/session/continue",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    {
      errorContext: "agentOS task continue",
      timeoutMs: AGENT_REQUEST_TIMEOUT_MS,
    },
  );
  return validateAgentRunResult(result, "agentOS task continue");
}

export async function runParallelAgentsFromBrowser(payload: {
  executionMode?: "act" | "plan" | "read-only" | "yolo";
  prompts: string[];
  selectedProject?: string;
  sessionId: string;
  settings: {
    apiKey: string;
    baseUrl: string;
    maxTokens: number;
    model: string;
    systemPrompt: string;
    temperature: number;
  };
}) {
  return await requestJson<ParallelAgentRunResult>(
    "/__vibe_local/agentos/session/sub-agents",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    {
      errorContext: "Parallel agents",
      timeoutMs: AGENT_REQUEST_TIMEOUT_MS,
    },
  );
}

export async function continueSubAgentFromBrowser(payload: {
  sessionId: string;
  settings: {
    apiKey: string;
    baseUrl: string;
    maxTokens: number;
    model: string;
    systemPrompt: string;
    temperature: number;
  };
  subAgentId: string;
}) {
  return await requestJson<SubAgentContinueResult>(
    "/__vibe_local/agentos/session/sub-agent/continue",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    {
      errorContext: "Sub-agent continue",
      timeoutMs: AGENT_REQUEST_TIMEOUT_MS,
    },
  );
}
