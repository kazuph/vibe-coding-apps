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

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as T;
}

export async function fetchProjects() {
  return await requestJson<ProjectInfo[]>("/__vibe_local/coding/projects");
}

export async function fetchProjectInfo(project: string) {
  const url = new URL("/__vibe_local/coding/project", window.location.origin);
  url.searchParams.set("project", project);
  return await requestJson<ProjectInfoDetails>(url);
}

export async function fetchGitStatus() {
  return await requestJson<GitStatusResult>("/__vibe_local/coding/git/status");
}

export async function fetchGitDiffStat() {
  return await requestJson<GitDiffStatResult>("/__vibe_local/coding/git/diff");
}

export async function searchRepoCode(query: string, maxResults = 20) {
  const url = new URL("/__vibe_local/coding/search", window.location.origin);
  url.searchParams.set("query", query);
  url.searchParams.set("maxResults", String(maxResults));
  return await requestJson<SearchCodeResult>(url);
}

export async function runProjectScriptFromBrowser(
  project: string,
  script: string,
  timeoutMs = 120_000,
) {
  return await requestJson<ScriptRunResult>("/__vibe_local/coding/run-script", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      project,
      script,
      timeoutMs,
    }),
  });
}

export async function readRepoFileFromBrowser(filePath: string) {
  const url = new URL("/__vibe_local/coding/file", window.location.origin);
  url.searchParams.set("path", filePath);
  return await requestJson<RepoFileResult>(url);
}

export async function writeRepoFileFromBrowser(filePath: string, content: string) {
  return await requestJson<RepoFileWriteResult>("/__vibe_local/coding/file", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path: filePath,
      content,
    }),
  });
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
  return await requestJson<AgentRunResult>("/__vibe_local/agentos/session/agent-run", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
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
  return await requestJson<ApprovalDecisionResult>("/__vibe_local/agentos/session/approval", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
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
  return await requestJson<AgentRunResult>("/__vibe_local/agentos/session/continue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
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
  return await requestJson<ParallelAgentRunResult>("/__vibe_local/agentos/session/sub-agents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
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
  return await requestJson<SubAgentContinueResult>("/__vibe_local/agentos/session/sub-agent/continue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
