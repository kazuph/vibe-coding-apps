import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { actor } from "rivetkit";
import { db, type RawAccess } from "rivetkit/db";

import {
  ensureWorkspaceParentExists,
  isAgentFsWorkspacePath,
  mirrorWorkspaceFileToAgentFs,
  readAgentFsMirrorFile,
} from "./agentfs.js";
import { REPO_ROOT } from "./config.js";
import {
  discoverProjects,
  readProjectPackageJson,
  resolveProject,
  runProjectScript,
} from "./projects.js";

type SessionMode = "plan" | "act" | "yolo";
type ChatRole = "assistant" | "system" | "user";

type SessionRecord = {
  createdAt: string;
  id: string;
  mode: SessionMode;
  model: string;
  title: string;
  updatedAt: string;
};

type ChatMessage = {
  content: string;
  createdAt: string;
  id: string;
  role: ChatRole;
  turnIndex: number;
};

type SessionArtifact = {
  createdAt: string;
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  sessionId: string;
};

type ApprovalStatus = "approved" | "failed" | "pending" | "rejected";

type ToolExecutionStatus =
  | "approval_required"
  | "completed"
  | "failed"
  | "rejected";

type ToolExecutionTrace = {
  approvalId?: string;
  error?: string;
  finishedAt: string;
  input: unknown;
  name: string;
  outputPreview: string;
  startedAt: string;
  status: ToolExecutionStatus;
};

type ApprovalRecord = {
  createdAt: string;
  error: string;
  id: string;
  input: Record<string, unknown>;
  outputPreview: string;
  sessionId: string;
  status: ApprovalStatus;
  subAgentId: string | null;
  toolName: string;
  updatedAt: string;
};

type SubAgentStatus = "completed" | "failed" | "queued" | "running";
type TaskStatus = "completed" | "failed" | "idle" | "running" | "waiting_approval";

type SubAgentRun = {
  createdAt: string;
  error: string;
  executionMode: ToolExecutionMode;
  finalResponse: string;
  id: string;
  lastResumedAt: string;
  pendingApprovals: string[];
  prompt: string;
  resumeCount: number;
  resumeReadyAt: string;
  selectedProject: string;
  sessionId: string;
  status: SubAgentStatus;
  toolCalls: ToolExecutionTrace[];
  updatedAt: string;
};

type SessionSnapshot = {
  approvals: ApprovalRecord[];
  artifacts: SessionArtifact[];
  messages: ChatMessage[];
  subAgents: SubAgentRun[];
  task: TaskState | null;
  session: SessionRecord;
};

type TaskState = {
  continueCount: number;
  createdAt: string;
  goal: string;
  lastError: string;
  lastResponse: string;
  selectedProject: string;
  sessionId: string;
  settings: BackendSettings | null;
  status: TaskStatus;
  updatedAt: string;
};

type CompactResult = {
  artifact: SessionArtifact | null;
  changed: boolean;
  messages: ChatMessage[];
  session: SessionRecord;
};

type BackendSettings = {
  apiKey: string;
  baseUrl: string;
  maxTokens: number;
  model: string;
  systemPrompt: string;
  temperature: number;
};

type OpenAiToolCall = {
  function: {
    arguments?: string;
    name: string;
  };
  id: string;
  type: "function";
};

type OpenAiMessage = {
  content?: string | null;
  role: "assistant" | "system" | "tool" | "user";
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
};

type AgentRunArtifactPayload = {
  executionMode: "act" | "plan" | "read-only" | "yolo";
  finalResponse: string;
  pendingApprovals: string[];
  prompt: string;
  runId: string;
  selectedProject: string;
  toolCalls: ToolExecutionTrace[];
};

type AgentToolEventArtifactPayload = {
  error?: string;
  eventId: string;
  executionMode: ToolExecutionMode;
  finishedAt?: string;
  input: Record<string, unknown>;
  name: string;
  outputPreview?: string;
  phase: "finished" | "started";
  prompt: string;
  runId: string;
  selectedProject: string;
  startedAt: string;
  status: "running" | ToolExecutionStatus;
};

type AgentLoopResult = {
  finalResponse: string;
  pendingApprovals: ApprovalRecord[];
  toolCalls: ToolExecutionTrace[];
};

type AgentTurnResult = {
  approvals: ApprovalRecord[];
  artifact: SessionArtifact;
  message: ChatMessage;
  pendingApproval: boolean;
  session: SessionRecord;
  task: TaskState | null;
  toolCalls: ToolExecutionTrace[];
};

const execFileAsync = promisify(execFile);
const MUTATING_TOOL_NAMES = new Set([
  "continueSubAgentTask",
  "replaceInFile",
  "runScript",
  "writeFile",
]);

type ToolExecutionMode = "act" | "plan" | "read-only" | "yolo";
type AssistantDeltaCallback = (fullText: string) => Promise<void> | void;
type AgentLoopEventHooks = {
  onAssistantDelta?: AssistantDeltaCallback;
  onToolFinished?: (event: AgentToolEventArtifactPayload) => Promise<void> | void;
  onToolStarted?: (event: AgentToolEventArtifactPayload) => Promise<void> | void;
  runId: string;
};

function nowIso() {
  return new Date().toISOString();
}

async function runGit(args: string[]) {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd: REPO_ROOT,
      timeout: 20_000,
      maxBuffer: 1024 * 1024 * 2,
    });

    return { ok: true, stdout, stderr };
  } catch (error) {
    const typed = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: typed.stdout ?? "",
      stderr: typed.stderr ?? typed.message,
    };
  }
}

async function searchCode(query: string, maxResults: number) {
  const { stdout } = await execFileAsync(
    "rg",
    [
      "-n",
      "--hidden",
      "--glob",
      "!**/node_modules/**",
      "--glob",
      "!**/.git/**",
      "--glob",
      "!tools/agentos-dev/node_modules/**",
      query,
      REPO_ROOT,
    ],
    {
      cwd: REPO_ROOT,
      timeout: 20_000,
      maxBuffer: 1024 * 1024 * 4,
    },
  );

  const lines = stdout.trim().split("\n").filter(Boolean);
  return lines.slice(0, maxResults);
}

const CODING_TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "listProjects",
      description: "List pnpm projects available in this monorepo.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "projectInfo",
      description: "Inspect one project and list its package.json scripts.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          project: { type: "string" },
        },
        required: ["project"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchCode",
      description: "Search the repository with ripgrep and return matching lines.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string" },
          maxResults: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "listFiles",
      description: "List files and directories inside one repository directory.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          maxEntries: { type: "number" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "readFile",
      description: "Read one UTF-8 text file from the repository.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "writeFile",
      description: "Write one UTF-8 text file inside the repository.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "replaceInFile",
      description: "Replace one exact string in a UTF-8 file. Fails if the target text is missing.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          search: { type: "string" },
          replace: { type: "string" },
          replaceAll: { type: "boolean" },
        },
        required: ["path", "search", "replace"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gitStatus",
      description: "Read current git branch and status.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "gitDiffStat",
      description: "Read a compact git diff summary.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runScript",
      description: "Run a pnpm script in one project and capture stdout/stderr.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          project: { type: "string" },
          script: { type: "string" },
          timeoutMs: { type: "number" },
        },
        required: ["project", "script"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "runParallelAgentTasks",
      description:
        "Spawn up to 4 sub-agents for independent subtasks and return each result. Use this when the work can be split into parallel branches.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          prompts: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 4,
          },
          executionMode: {
            type: "string",
            enum: ["read-only", "plan", "act", "yolo"],
          },
          project: { type: "string" },
        },
        required: ["prompts"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "continueSubAgentTask",
      description:
        "Continue one paused sub-agent after its required approvals were resolved and return the refreshed sub-agent result.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          subAgentId: { type: "string" },
        },
        required: ["subAgentId"],
      },
    },
  },
] as const;

const SUB_AGENT_TOOL_SCHEMAS = CODING_TOOL_SCHEMAS.filter(
  (tool) =>
    tool.function.name !== "continueSubAgentTask" &&
    tool.function.name !== "runParallelAgentTasks",
);

async function persistMessage(
  dbClient: RawAccess,
  sessionId: string,
  role: ChatRole,
  content: string,
) {
  const snapshot = await requireSnapshot(dbClient, sessionId);
  const trimmed = content.trim();
  const createdAt = nowIso();
  const turnIndex = snapshot.messages.length;
  const message = {
    id: crypto.randomUUID(),
    role,
    content: trimmed,
    createdAt,
    turnIndex,
  } satisfies ChatMessage;

  let nextTitle = snapshot.session.title;
  if (role === "user" && (!nextTitle || nextTitle === "New session")) {
    nextTitle = trimmed.replace(/\s+/g, " ").slice(0, 36) || "New session";
  }

  await dbClient.execute(
    `
      INSERT INTO messages(id, session_id, role, content_json, created_at, turn_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    message.id,
    sessionId,
    message.role,
    JSON.stringify({ text: message.content }),
    message.createdAt,
    message.turnIndex,
  );

  await dbClient.execute(
    `
      UPDATE sessions
      SET title = ?, updated_at = ?
      WHERE id = ?
    `,
    nextTitle,
    createdAt,
    sessionId,
  );

  return {
    message,
    session: {
      ...snapshot.session,
      title: nextTitle,
      updatedAt: createdAt,
    } satisfies SessionRecord,
  };
}

async function persistArtifact(
  dbClient: RawAccess,
  sessionId: string,
  kind: string,
  payload: Record<string, unknown>,
) {
  const artifact = {
    id: crypto.randomUUID(),
    sessionId,
    kind,
    createdAt: nowIso(),
    payload,
  } satisfies SessionArtifact;

  await dbClient.execute(
    `
      INSERT OR REPLACE INTO artifacts(id, session_id, kind, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?)
    `,
    artifact.id,
    artifact.sessionId,
    artifact.kind,
    JSON.stringify(artifact.payload),
    artifact.createdAt,
  );

  await dbClient.execute(
    `
      UPDATE sessions
      SET updated_at = ?
      WHERE id = ?
    `,
    artifact.createdAt,
    sessionId,
  );

  return artifact;
}

async function persistAgentToolEvent(
  dbClient: RawAccess,
  sessionId: string,
  payload: AgentToolEventArtifactPayload,
) {
  await persistArtifact(dbClient, sessionId, "agent_tool_event", payload);
}

async function createApproval(
  dbClient: RawAccess,
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>,
  subAgentId: string | null = null,
) {
  const createdAt = nowIso();
  const approval = {
    id: crypto.randomUUID(),
    sessionId,
    toolName,
    input,
    status: "pending" as const,
    subAgentId,
    outputPreview: "",
    error: "",
    createdAt,
    updatedAt: createdAt,
  } satisfies ApprovalRecord;

  await dbClient.execute(
    `
      INSERT INTO approvals(
        id, session_id, tool_name, input_json, status, sub_agent_id, output_preview, error_text, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    approval.id,
    approval.sessionId,
    approval.toolName,
    JSON.stringify(approval.input),
    approval.status,
    approval.subAgentId,
    approval.outputPreview,
    approval.error,
    approval.createdAt,
    approval.updatedAt,
  );

  return approval;
}

async function getApproval(dbClient: RawAccess, approvalId: string) {
  const rows = await dbClient.execute<{
    created_at: string;
    error_text: string;
    id: string;
    input_json: string;
    output_preview: string;
    session_id: string;
    status: ApprovalStatus;
    sub_agent_id: string | null;
    tool_name: string;
    updated_at: string;
  }>(
    `
      SELECT
        id, session_id, tool_name, input_json, status, sub_agent_id, output_preview, error_text, created_at, updated_at
      FROM approvals
      WHERE id = ?
    `,
    approvalId,
  );

  const row = rows[0];
  if (!row) return null;

  return {
    id: row.id,
    sessionId: row.session_id,
    toolName: row.tool_name,
    input: JSON.parse(row.input_json) as Record<string, unknown>,
    status: row.status,
    subAgentId: row.sub_agent_id,
    outputPreview: row.output_preview,
    error: row.error_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies ApprovalRecord;
}

async function updateApproval(
  dbClient: RawAccess,
  approvalId: string,
  patch: Pick<ApprovalRecord, "error" | "outputPreview" | "status" | "updatedAt">,
) {
  await dbClient.execute(
    `
      UPDATE approvals
      SET status = ?, output_preview = ?, error_text = ?, updated_at = ?
      WHERE id = ?
    `,
    patch.status,
    patch.outputPreview,
    patch.error,
    patch.updatedAt,
    approvalId,
  );

  return await getApproval(dbClient, approvalId);
}

async function createSubAgent(
  dbClient: RawAccess,
  sessionId: string,
  prompt: string,
  selectedProject: string,
  executionMode: ToolExecutionMode,
) {
  const createdAt = nowIso();
  const subAgent = {
    id: crypto.randomUUID(),
    sessionId,
    prompt,
    selectedProject,
    executionMode,
    status: "queued" as const,
    finalResponse: "",
    error: "",
    lastResumedAt: "",
    pendingApprovals: [],
    toolCalls: [],
    resumeCount: 0,
    resumeReadyAt: "",
    createdAt,
    updatedAt: createdAt,
  } satisfies SubAgentRun;

  await dbClient.execute(
    `
      INSERT INTO sub_agents(
        id, session_id, prompt, selected_project, status, result_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    subAgent.id,
    subAgent.sessionId,
    subAgent.prompt,
    subAgent.selectedProject,
    subAgent.status,
    JSON.stringify({
      executionMode: subAgent.executionMode,
      finalResponse: subAgent.finalResponse,
      error: subAgent.error,
      lastResumedAt: subAgent.lastResumedAt,
      pendingApprovals: subAgent.pendingApprovals,
      resumeCount: subAgent.resumeCount,
      resumeReadyAt: subAgent.resumeReadyAt,
      toolCalls: subAgent.toolCalls,
    }),
    subAgent.createdAt,
    subAgent.updatedAt,
  );

  return subAgent;
}

async function getTaskState(dbClient: RawAccess, sessionId: string) {
  const rows = await dbClient.execute<{
    continue_count: number;
    created_at: string;
    goal: string;
    last_error: string;
    last_response: string;
    selected_project: string;
    session_id: string;
    settings_json: string;
    status: TaskStatus;
    updated_at: string;
  }>(
    `
      SELECT
        session_id, goal, selected_project, status, last_response, last_error,
        continue_count, settings_json, created_at, updated_at
      FROM task_state
      WHERE session_id = ?
    `,
    sessionId,
  );

  const row = rows[0];
  if (!row) return null;

  return {
    sessionId: row.session_id,
    goal: row.goal,
    selectedProject: row.selected_project,
    status: row.status,
    lastResponse: row.last_response,
    lastError: row.last_error,
    continueCount: Number(row.continue_count),
    settings: row.settings_json.trim()
      ? (JSON.parse(row.settings_json) as BackendSettings)
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } satisfies TaskState;
}

async function saveTaskState(
  dbClient: RawAccess,
  task: Omit<TaskState, "createdAt" | "updatedAt"> & {
    createdAt?: string;
    updatedAt?: string;
  },
) {
  const createdAt = task.createdAt ?? nowIso();
  const updatedAt = task.updatedAt ?? createdAt;

  await dbClient.execute(
    `
      INSERT INTO task_state(
        session_id, goal, selected_project, status, last_response, last_error,
        continue_count, settings_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        goal = excluded.goal,
        selected_project = excluded.selected_project,
        status = excluded.status,
        last_response = excluded.last_response,
        last_error = excluded.last_error,
        continue_count = excluded.continue_count,
        settings_json = excluded.settings_json,
        updated_at = excluded.updated_at
    `,
    task.sessionId,
    task.goal,
    task.selectedProject,
    task.status,
    task.lastResponse,
    task.lastError,
    task.continueCount,
    JSON.stringify(task.settings ?? null),
    createdAt,
    updatedAt,
  );

  return await getTaskState(dbClient, task.sessionId);
}

async function updateSubAgent(
  dbClient: RawAccess,
  subAgentId: string,
  patch: Pick<
    SubAgentRun,
    | "error"
    | "executionMode"
    | "finalResponse"
    | "lastResumedAt"
    | "pendingApprovals"
    | "resumeCount"
    | "resumeReadyAt"
    | "status"
    | "toolCalls"
    | "updatedAt"
  >,
) {
  await dbClient.execute(
    `
      UPDATE sub_agents
      SET status = ?, result_json = ?, updated_at = ?
      WHERE id = ?
    `,
    patch.status,
    JSON.stringify({
      executionMode: patch.executionMode,
      finalResponse: patch.finalResponse,
      error: patch.error,
      lastResumedAt: patch.lastResumedAt,
      pendingApprovals: patch.pendingApprovals,
      resumeCount: patch.resumeCount,
      resumeReadyAt: patch.resumeReadyAt,
      toolCalls: patch.toolCalls,
    }),
    patch.updatedAt,
    subAgentId,
  );
}

function trimToolOutput(result: unknown) {
  const text = JSON.stringify(result, null, 2);
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…truncated…` : text;
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function sessionModeToExecutionMode(mode: SessionMode): ToolExecutionMode {
  if (mode === "plan") return "plan";
  if (mode === "yolo") return "yolo";
  return "act";
}

function normalizeToolExecutionMode(
  value: unknown,
  fallback: ToolExecutionMode,
): ToolExecutionMode {
  return value === "read-only" || value === "plan" || value === "act" || value === "yolo"
    ? value
    : fallback;
}

function getNestedParallelExecutionMode(
  input: Record<string, unknown>,
  fallback: ToolExecutionMode,
) {
  return normalizeToolExecutionMode(input.executionMode, fallback);
}

function getToolRestriction(
  name: string,
  input: Record<string, unknown>,
  executionMode: ToolExecutionMode,
) {
  if (name === "runParallelAgentTasks") {
    const nestedMode = getNestedParallelExecutionMode(input, executionMode);
    if (executionMode === "read-only" && nestedMode !== "read-only") {
      return {
        approvalRequired: false,
        rejectReason:
          "Read-only mode cannot start parallel sub-agents in plan, act, or yolo mode.",
      };
    }
    if (executionMode === "plan" && (nestedMode === "act" || nestedMode === "yolo")) {
      return {
        approvalRequired: true,
        rejectReason: "",
      };
    }
    return {
      approvalRequired: false,
      rejectReason: "",
    };
  }

  if (executionMode === "read-only" && MUTATING_TOOL_NAMES.has(name)) {
    return {
      approvalRequired: false,
      rejectReason: "Sub-agents are read-only and cannot execute mutating tools.",
    };
  }

  return {
    approvalRequired: executionMode === "plan" && MUTATING_TOOL_NAMES.has(name),
    rejectReason: "",
  };
}

function createAgentSystemPrompt(
  selectedProject: string,
  extraPrompt: string,
  executionMode: ToolExecutionMode,
) {
  return [
    "You are the coding mode of vibe-local running on top of agentOS.",
    "Use tools whenever the user asks about repository state, files, scripts, or code changes.",
    "Do not pretend to inspect files or run scripts without a tool call.",
    "Keep answers concise, practical, and directly tied to the current repository.",
    executionMode === "yolo"
      ? "YOLO mode is enabled. Take bold end-to-end steps, prefer finishing the task in one pass, and do not pause for intermediate confirmation unless the tool layer blocks you."
      : "",
    selectedProject ? `Prefer the project: ${selectedProject}` : "",
    extraPrompt.trim(),
  ]
    .filter(Boolean)
    .join("\n");
}

async function callOpenAiCompatible(
  settings: BackendSettings,
  messages: OpenAiMessage[],
  includeTools = true,
  toolSchemas: ReadonlyArray<(typeof CODING_TOOL_SCHEMAS)[number]> = CODING_TOOL_SCHEMAS,
) {
  const normalizedMessages = normalizeOpenAiMessages(messages);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort("Agent request timed out.");
  }, 45_000);
  let response: Response;
  try {
    response = await fetch(`${settings.baseUrl.trim().replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: settings.model,
        messages: normalizedMessages,
        ...(includeTools
          ? {
              tools: toolSchemas,
              tool_choice: "auto",
            }
          : {}),
        temperature: settings.temperature,
        max_tokens: settings.maxTokens,
        stream: false,
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Agent request timed out after 45s.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`Agent request failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: OpenAiMessage;
    }>;
  };

  const message = payload.choices?.[0]?.message;
  if (!message) {
    throw new Error("No assistant message was returned.");
  }

  return message;
}

async function streamOpenAiCompatibleText(
  settings: BackendSettings,
  messages: OpenAiMessage[],
  onDelta?: AssistantDeltaCallback,
) {
  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const resetIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
    idleTimer = setTimeout(() => {
      controller.abort("Agent stream became idle.");
    }, 2_500);
  };

  const normalizedMessages = normalizeOpenAiMessages(messages);
  const response = await fetch(`${settings.baseUrl.trim().replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}),
    },
    signal: controller.signal,
    body: JSON.stringify({
      model: settings.model,
      messages: normalizedMessages,
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      stream: true,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Agent stream request failed: ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  resetIdleTimer();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const lines = frame
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            return fullText.trim();
          }

          const payload = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string };
              finish_reason?: string | null;
              message?: { content?: string };
            }>;
          };
          const finishReason = payload.choices?.[0]?.finish_reason;
          const textDelta =
            payload.choices?.[0]?.delta?.content ??
            payload.choices?.[0]?.message?.content ??
            "";

          if (finishReason) {
            return fullText.trim();
          }

          if (!textDelta) {
            continue;
          }

          resetIdleTimer();
          fullText += textDelta;
          await onDelta?.(fullText);
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError" && fullText.trim()) {
      return fullText.trim();
    }
    throw error;
  } finally {
    if (idleTimer) {
      clearTimeout(idleTimer);
    }
  }

  return fullText.trim();
}

function normalizeOpenAiMessages(messages: OpenAiMessage[]) {
  const systemContents = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content?.trim() ?? "")
    .filter(Boolean);
  const nonSystemMessages = messages.filter((message) => message.role !== "system");

  if (systemContents.length === 0) {
    return nonSystemMessages;
  }

  return [
    {
      role: "system" as const,
      content: systemContents.join("\n\n"),
    },
    ...nonSystemMessages,
  ];
}

async function executeCodingTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case "listProjects":
      return await discoverProjects();
    case "projectInfo":
      return {
        ...(await resolveProject(String(args.project ?? ""))),
        packageJson: await readProjectPackageJson(String(args.project ?? "")),
      };
    case "listFiles": {
      const target = resolveRepoPath(String(args.path ?? ""));
      const maxEntries = Math.max(1, Math.min(Number(args.maxEntries ?? 200), 500));
      const entries = await readdir(target.absolutePath, { withFileTypes: true });
      const enriched = await Promise.all(
        entries.slice(0, maxEntries).map(async (entry) => {
          const entryAbsolutePath = path.join(target.absolutePath, entry.name);
          const details = await stat(entryAbsolutePath);
          return {
            name: entry.name,
            path: path.relative(REPO_ROOT, entryAbsolutePath),
            kind: entry.isDirectory() ? "dir" : "file",
            size: details.size,
          };
        }),
      );
      return {
        path: target.relativePath,
        entries: enriched,
      };
    }
    case "searchCode":
      return {
        query: String(args.query ?? ""),
        matches: await searchCode(String(args.query ?? ""), Number(args.maxResults ?? 20)),
      };
    case "readFile":
      return await readFile(resolveRepoPath(String(args.path ?? "")).absolutePath, "utf8");
    case "writeFile": {
      const target = resolveRepoPath(String(args.path ?? ""));
      const content = String(args.content ?? "");
      await mkdir(path.dirname(target.absolutePath), { recursive: true });
      await writeFile(target.absolutePath, content, "utf8");
      const mirrorResult = isAgentFsWorkspacePath(target.relativePath)
        ? await mirrorWorkspaceFileToAgentFs(target.relativePath, content)
        : null;
      return {
        ok: true,
        path: target.relativePath,
        bytes: mirrorResult?.bytes ?? Buffer.byteLength(content, "utf8"),
      };
    }
    case "replaceInFile": {
      const target = resolveRepoPath(String(args.path ?? ""));
      const search = String(args.search ?? "");
      if (!search) {
        throw new Error("replaceInFile requires a non-empty search string.");
      }
      const replace = String(args.replace ?? "");
      const replaceAll = Boolean(args.replaceAll);
      const current = await readFile(target.absolutePath, "utf8");
      if (!current.includes(search)) {
        throw new Error(`replaceInFile could not find the target text in ${target.relativePath}`);
      }
      const updated = replaceAll ? current.split(search).join(replace) : current.replace(search, replace);
      await writeFile(target.absolutePath, updated, "utf8");
      if (isAgentFsWorkspacePath(target.relativePath)) {
        await mirrorWorkspaceFileToAgentFs(target.relativePath, updated);
      }
      return {
        ok: true,
        path: target.relativePath,
        replaceAll,
      };
    }
    case "gitStatus": {
      const branch = await runGit(["branch", "--show-current"]);
      const status = await runGit(["status", "--short"]);
      return {
        branch: branch.stdout.trim(),
        status: status.stdout.trim().split("\n").filter(Boolean),
      };
    }
    case "gitDiffStat": {
      const diff = await runGit(["diff", "--stat"]);
      return {
        ok: diff.ok,
        diffStat: diff.stdout.trim(),
        stderr: diff.stderr.trim(),
      };
    }
    case "runScript":
      return await runProjectScript(
        String(args.project ?? ""),
        String(args.script ?? ""),
        Number(args.timeoutMs ?? 120_000),
      );
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function executeParallelAgentTasks(
  dbClient: RawAccess,
  sessionId: string,
  prompts: string[],
  settings: BackendSettings,
  selectedProject = "",
  executionMode: ToolExecutionMode = "read-only",
) {
  const snapshot = await requireSnapshot(dbClient, sessionId);
  const trimmedPrompts = prompts.map((prompt) => prompt.trim()).filter(Boolean).slice(0, 4);
  if (trimmedPrompts.length === 0) {
    throw new Error("At least one sub-agent prompt is required.");
  }

  const subAgents = await Promise.all(
    trimmedPrompts.map(
      async (prompt) => await createSubAgent(dbClient, sessionId, prompt, selectedProject, executionMode),
    ),
  );

  await Promise.all(
    subAgents.map(async (subAgent) => {
      await updateSubAgent(dbClient, subAgent.id, {
        executionMode: subAgent.executionMode,
        status: "running",
        finalResponse: "",
        error: "",
        lastResumedAt: subAgent.lastResumedAt,
        pendingApprovals: [],
        resumeCount: subAgent.resumeCount,
        resumeReadyAt: subAgent.resumeReadyAt,
        toolCalls: [],
        updatedAt: nowIso(),
      });

      try {
        const result = await runAgentLoop(
          dbClient,
          snapshot,
          subAgent.prompt,
          settings,
          selectedProject,
          subAgent.executionMode,
          {
            runId: crypto.randomUUID(),
          },
          subAgent.id,
        );
        await updateSubAgent(dbClient, subAgent.id, {
          executionMode: subAgent.executionMode,
          status: "completed",
          finalResponse: result.finalResponse,
          error: "",
          lastResumedAt: subAgent.lastResumedAt,
          pendingApprovals: result.pendingApprovals.map((approval) => approval.id),
          resumeCount: subAgent.resumeCount,
          resumeReadyAt: result.pendingApprovals.length > 0 ? nowIso() : subAgent.resumeReadyAt,
          toolCalls: result.toolCalls,
          updatedAt: nowIso(),
        });
      } catch (caughtError) {
        await updateSubAgent(dbClient, subAgent.id, {
          executionMode: subAgent.executionMode,
          status: "failed",
          finalResponse: "",
          error: toErrorMessage(caughtError),
          lastResumedAt: subAgent.lastResumedAt,
          pendingApprovals: [],
          resumeCount: subAgent.resumeCount,
          resumeReadyAt: subAgent.resumeReadyAt,
          toolCalls: [],
          updatedAt: nowIso(),
        });
      }
    }),
  );

  const refreshed = await requireSnapshot(dbClient, sessionId);
  await persistArtifact(dbClient, sessionId, "parallel_agent_run", {
    count: trimmedPrompts.length,
    executionMode,
    selectedProject,
    subAgentIds: subAgents.map((subAgent) => subAgent.id),
  });

  return {
    session: refreshed.session,
    subAgents: refreshed.subAgents.filter((subAgent) =>
      subAgents.some((created) => created.id === subAgent.id),
    ),
  };
}

function summarizeParallelAgentTasksResult(
  result: Awaited<ReturnType<typeof executeParallelAgentTasks>>,
) {
  return {
    count: result.subAgents.length,
    subAgents: result.subAgents.map((subAgent) => ({
      id: subAgent.id,
      prompt: subAgent.prompt,
      executionMode: subAgent.executionMode,
      status: subAgent.status,
      pendingApprovals: subAgent.pendingApprovals,
      finalResponse: subAgent.finalResponse,
      error: subAgent.error,
    })),
  };
}

function createApprovalRequiredPreview(toolName: string, approvalId: string, input: Record<string, unknown>) {
  return trimToolOutput({
    ok: false,
    approvalRequired: true,
    approvalId,
    toolName,
    input,
  });
}

function getSubAgent(snapshot: SessionSnapshot, subAgentId: string) {
  return snapshot.subAgents.find((subAgent) => subAgent.id === subAgentId) ?? null;
}

function buildSubAgentReplayMessages(approvals: ApprovalRecord[]): OpenAiMessage[] {
  return approvals.flatMap((approval) => {
    const toolCallId = `resume-${approval.id}`;
    return [
      {
        role: "assistant" as const,
        content: "",
        tool_calls: [
          {
            id: toolCallId,
            type: "function" as const,
            function: {
              name: approval.toolName,
              arguments: JSON.stringify(approval.input),
            },
          },
        ],
      },
      {
        role: "tool" as const,
        tool_call_id: toolCallId,
        content: approval.outputPreview,
      },
    ];
  });
}

async function executeContinueSubAgentTask(
  dbClient: RawAccess,
  sessionId: string,
  subAgentId: string,
  settings: BackendSettings,
) {
  const snapshot = await requireSnapshot(dbClient, sessionId);
  const subAgent = getSubAgent(snapshot, subAgentId);
  if (!subAgent) {
    throw new Error(`Unknown sub-agent: ${subAgentId}`);
  }
  if (subAgent.status === "queued" || subAgent.status === "running") {
    throw new Error(`Sub-agent ${subAgentId} is still ${subAgent.status}.`);
  }
  if (subAgent.pendingApprovals.length > 0) {
    return {
      approvals: snapshot.approvals.filter((approval) => approval.subAgentId === subAgentId),
      noop: true,
      reason: `Sub-agent ${subAgentId} still has pending approvals.`,
      session: snapshot.session,
      subAgent,
    };
  }

  const resolvedApprovals = snapshot.approvals
    .filter(
      (approval) =>
        approval.subAgentId === subAgent.id &&
        approval.status === "approved" &&
        (!subAgent.lastResumedAt || approval.updatedAt > subAgent.lastResumedAt),
    )
    .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  if (resolvedApprovals.length === 0) {
    return {
      approvals: snapshot.approvals.filter((approval) => approval.subAgentId === subAgentId),
      noop: true,
      reason: `Sub-agent ${subAgentId} has no newly approved tools to continue from.`,
      session: snapshot.session,
      subAgent,
    };
  }

  await updateSubAgent(dbClient, subAgent.id, {
    executionMode: subAgent.executionMode,
    status: "running",
    finalResponse: subAgent.finalResponse,
    error: "",
    lastResumedAt: subAgent.lastResumedAt,
    pendingApprovals: [],
    resumeCount: subAgent.resumeCount,
    resumeReadyAt: subAgent.resumeReadyAt,
    toolCalls: subAgent.toolCalls,
    updatedAt: nowIso(),
  });

  try {
    const loopResult = await runAgentLoop(
      dbClient,
      snapshot,
      [
        "Continue this sub-agent task from the already approved tool results.",
        `Original sub-agent prompt: ${subAgent.prompt}`,
        "Only work on the original sub-agent prompt. Ignore sibling sub-agents and unrelated files.",
        "If the approved tool result already satisfies the original prompt, stop and answer with completion.",
        "Do not repeat already completed tool calls unless the inputs must change.",
        "Take the next smallest useful step for this exact prompt only.",
      ].join("\n"),
      settings,
      subAgent.selectedProject,
      subAgent.executionMode,
      {
        runId: crypto.randomUUID(),
      },
      subAgent.id,
      [
        {
          role: "system",
          content:
            "The following tool results were already approved and executed. Treat them as completed work for this exact sub-agent only.",
        },
        ...buildSubAgentReplayMessages(resolvedApprovals),
      ],
    );
    const resumedAt = nowIso();
    await updateSubAgent(dbClient, subAgent.id, {
      executionMode: subAgent.executionMode,
      status: "completed",
      finalResponse: loopResult.finalResponse,
      error: "",
      lastResumedAt: resumedAt,
      pendingApprovals: loopResult.pendingApprovals.map((approval) => approval.id),
      resumeCount: subAgent.resumeCount + 1,
      resumeReadyAt: loopResult.pendingApprovals.length > 0 ? resumedAt : subAgent.resumeReadyAt,
      toolCalls: [...subAgent.toolCalls, ...loopResult.toolCalls],
      updatedAt: resumedAt,
    });
    await persistArtifact(dbClient, sessionId, "sub_agent_continue", {
      approvedToolIds: resolvedApprovals.map((approval) => approval.id),
      finalResponse: loopResult.finalResponse,
      selectedProject: subAgent.selectedProject,
      subAgentId,
      toolCalls: loopResult.toolCalls,
    });
    const refreshed = await requireSnapshot(dbClient, sessionId);
    const nextSubAgent = getSubAgent(refreshed, subAgentId);
    if (!nextSubAgent) {
      throw new Error(`Sub-agent ${subAgentId} disappeared after continuation.`);
    }
    return {
      approvals: refreshed.approvals.filter((approval) => approval.subAgentId === subAgentId),
      noop: false,
      reason: "",
      session: refreshed.session,
      subAgent: nextSubAgent,
    };
  } catch (caughtError) {
    await updateSubAgent(dbClient, subAgent.id, {
      executionMode: subAgent.executionMode,
      status: "failed",
      finalResponse: subAgent.finalResponse,
      error: toErrorMessage(caughtError),
      lastResumedAt: subAgent.lastResumedAt,
      pendingApprovals: [],
      resumeCount: subAgent.resumeCount,
      resumeReadyAt: subAgent.resumeReadyAt,
      toolCalls: subAgent.toolCalls,
      updatedAt: nowIso(),
    });
    throw caughtError;
  }
}

function summarizeContinueSubAgentTaskResult(
  result: Awaited<ReturnType<typeof executeContinueSubAgentTask>>,
) {
  return {
    noop: result.noop,
    reason: result.reason,
    approvals: result.approvals.map((approval) => ({
      id: approval.id,
      status: approval.status,
      toolName: approval.toolName,
    })),
    subAgent: {
      id: result.subAgent.id,
      prompt: result.subAgent.prompt,
      executionMode: result.subAgent.executionMode,
      status: result.subAgent.status,
      pendingApprovals: result.subAgent.pendingApprovals,
      resumeCount: result.subAgent.resumeCount,
      finalResponse: result.subAgent.finalResponse,
      error: result.subAgent.error,
    },
  };
}

async function runAgentLoop(
  dbClient: RawAccess,
  snapshot: SessionSnapshot,
  prompt: string,
  settings: BackendSettings,
  selectedProject: string,
  executionMode: ToolExecutionMode,
  hooks: AgentLoopEventHooks,
  ownerSubAgentId: string | null = null,
  extraMessages: OpenAiMessage[] = [],
) {
  const toolCalls: ToolExecutionTrace[] = [];
  const pendingApprovals: ApprovalRecord[] = [];
  const messages: OpenAiMessage[] = [
    {
      role: "system",
      content: createAgentSystemPrompt(selectedProject, settings.systemPrompt, executionMode),
    },
    ...snapshot.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    ...extraMessages,
    {
      role: "user",
      content: prompt,
    },
  ];
  const availableToolSchemas = ownerSubAgentId ? SUB_AGENT_TOOL_SCHEMAS : CODING_TOOL_SCHEMAS;

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const assistant = await callOpenAiCompatible(settings, messages, true, availableToolSchemas);
    if (assistant.tool_calls?.length) {
      let usedParallelAgentTool = false;
      messages.push({
        role: "assistant",
        content: assistant.content ?? "",
        tool_calls: assistant.tool_calls,
      });

      for (const toolCall of assistant.tool_calls) {
        const startedAt = nowIso();
        const eventId = crypto.randomUUID();
        const trace: ToolExecutionTrace = {
          name: toolCall.function.name,
          input: {},
          outputPreview: "",
          startedAt,
          finishedAt: startedAt,
          status: "completed",
        };

        let input: Record<string, unknown> = {};
        let result: unknown;
        try {
          input = toolCall.function.arguments?.trim()
            ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
            : {};
        } catch (error) {
          trace.status = "failed";
          trace.error = `Invalid JSON tool arguments: ${toErrorMessage(error)}`;
          result = {
            ok: false,
            error: trace.error,
          };
        }

        trace.input = input;
        await hooks.onToolStarted?.({
          eventId,
          executionMode,
          input,
          name: trace.name,
          phase: "started",
          prompt,
          runId: hooks.runId,
          selectedProject,
          startedAt,
          status: "running",
        });

        if (result === undefined) {
          const restriction = getToolRestriction(trace.name, input, executionMode);
          if (restriction.rejectReason) {
            trace.status = "rejected";
            trace.error = restriction.rejectReason;
            result = {
              ok: false,
              error: trace.error,
            };
          } else if (restriction.approvalRequired) {
            const approval = await createApproval(
              dbClient,
              snapshot.session.id,
              trace.name,
              input,
              ownerSubAgentId,
            );
            pendingApprovals.push(approval);
            trace.status = "approval_required";
            trace.approvalId = approval.id;
            result = {
              ok: false,
              approvalRequired: true,
              approvalId: approval.id,
              toolName: trace.name,
            };
          } else {
            try {
              if (trace.name === "runParallelAgentTasks") {
                usedParallelAgentTool = true;
                result = summarizeParallelAgentTasksResult(
                  await executeParallelAgentTasks(
                    dbClient,
                    snapshot.session.id,
                    Array.isArray(input.prompts)
                      ? input.prompts.map((value) => String(value))
                      : [],
                    settings,
                    String(input.project ?? selectedProject),
                    getNestedParallelExecutionMode(input, executionMode),
                  ),
                );
              } else if (trace.name === "continueSubAgentTask") {
                result = summarizeContinueSubAgentTaskResult(
                  await executeContinueSubAgentTask(
                    dbClient,
                    snapshot.session.id,
                    String(input.subAgentId ?? ""),
                    settings,
                  ),
                );
              } else {
                result = await executeCodingTool(trace.name, input);
              }
            } catch (error) {
              trace.status = "failed";
              trace.error = toErrorMessage(error);
              result = {
                ok: false,
                error: trace.error,
              };
            }
          }
        }

        trace.finishedAt = nowIso();
        trace.outputPreview =
          trace.status === "approval_required" && trace.approvalId
            ? createApprovalRequiredPreview(trace.name, trace.approvalId, input)
            : trimToolOutput(result);
        toolCalls.push(trace);
        await hooks.onToolFinished?.({
          eventId,
          error: trace.error,
          executionMode,
          finishedAt: trace.finishedAt,
          input,
          name: trace.name,
          outputPreview: trace.outputPreview,
          phase: "finished",
          prompt,
          runId: hooks.runId,
          selectedProject,
          startedAt: trace.startedAt,
          status: trace.status,
        });
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: trace.outputPreview,
        });
      }

      if (usedParallelAgentTool) {
        const synthesizer = await callOpenAiCompatible(
          settings,
          [
            ...messages,
            {
              role: "system",
              content:
                "You now have the parallel sub-agent results. Do not call more tools. Synthesize them into one concise final answer.",
            },
          ],
          false,
        );
        const finalResponse = synthesizer.content?.trim();
        if (finalResponse) {
          return {
            finalResponse,
            pendingApprovals,
            toolCalls,
          } satisfies AgentLoopResult;
        }
      }

      if (executionMode === "plan" && pendingApprovals.length > 0) {
        const planner = await callOpenAiCompatible(
          settings,
          [
            ...messages,
            {
              role: "system",
              content:
                "One or more mutating tools now require approval. Do not call more tools. Briefly summarize the intended changes and mention the approval ids.",
            },
          ],
          false,
        );
        return {
          finalResponse:
            planner.content?.trim() ??
            `Pending approvals: ${pendingApprovals.map((approval) => approval.id).join(", ")}`,
          pendingApprovals,
          toolCalls,
        } satisfies AgentLoopResult;
      }

      continue;
    }

    const finalResponse =
      (await streamOpenAiCompatibleText(settings, messages, hooks.onAssistantDelta)) ||
      assistant.content?.trim();
    if (!finalResponse) {
      messages.push({
        role: "system",
        content:
          "Your previous reply did not include a usable final answer. Reply with either valid tool calls or one short final answer.",
      });
      continue;
    }

    return {
      finalResponse,
      pendingApprovals,
      toolCalls,
    } satisfies AgentLoopResult;
  }

  throw new Error("Agent turn exceeded the tool iteration limit.");
}

function resolveRepoPath(relativePath: string) {
  const normalized = relativePath.trim();
  if (!normalized) {
    throw new Error("Missing path");
  }

  const absolutePath = path.resolve(REPO_ROOT, normalized);
  const repoPrefix = `${REPO_ROOT}${path.sep}`;
  if (absolutePath !== REPO_ROOT && !absolutePath.startsWith(repoPrefix)) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }

  return {
    absolutePath,
    relativePath: path.relative(REPO_ROOT, absolutePath),
  };
}

async function migrateVibeLocalTables(dbClient: RawAccess) {
  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      mode TEXT NOT NULL
    );
  `);

  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      turn_index INTEGER NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL,
      status TEXT NOT NULL,
      sub_agent_id TEXT,
      output_preview TEXT NOT NULL,
      error_text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS sub_agents (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      selected_project TEXT NOT NULL,
      status TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);

  try {
    await dbClient.execute(`
      ALTER TABLE approvals
      ADD COLUMN sub_agent_id TEXT
    `);
  } catch {
    // Column already exists on migrated databases.
  }

  await dbClient.execute(`
    CREATE TABLE IF NOT EXISTS task_state (
      session_id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      selected_project TEXT NOT NULL,
      status TEXT NOT NULL,
      last_response TEXT NOT NULL,
      last_error TEXT NOT NULL,
      continue_count INTEGER NOT NULL,
      settings_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
  `);
}

async function listSnapshots(dbClient: RawAccess): Promise<SessionSnapshot[]> {
  const sessionRows = await dbClient.execute<{
    id: string;
    title: string;
    model: string;
    mode: SessionMode;
    created_at: string;
    updated_at: string;
  }>(`
    SELECT id, title, model, mode, created_at, updated_at
    FROM sessions
    ORDER BY updated_at DESC
  `);

  if (sessionRows.length === 0) {
    return [];
  }

  const messageRows = await dbClient.execute<{
    id: string;
    session_id: string;
    role: ChatRole;
    content_json: string;
    created_at: string;
    turn_index: number;
  }>(`
    SELECT id, session_id, role, content_json, created_at, turn_index
    FROM messages
    ORDER BY turn_index ASC
  `);

  const artifactRows = await dbClient.execute<{
    id: string;
    session_id: string;
    kind: string;
    payload_json: string;
    created_at: string;
  }>(`
    SELECT id, session_id, kind, payload_json, created_at
    FROM artifacts
    ORDER BY created_at DESC
  `);

  const approvalRows = await dbClient.execute<{
    created_at: string;
    error_text: string;
    id: string;
    input_json: string;
    output_preview: string;
    session_id: string;
    status: ApprovalStatus;
    sub_agent_id: string | null;
    tool_name: string;
    updated_at: string;
  }>(`
    SELECT
      id, session_id, tool_name, input_json, status, sub_agent_id, output_preview, error_text, created_at, updated_at
    FROM approvals
    ORDER BY created_at DESC
  `);

  const subAgentRows = await dbClient.execute<{
    created_at: string;
    id: string;
    prompt: string;
    result_json: string;
    selected_project: string;
    session_id: string;
    status: SubAgentStatus;
    updated_at: string;
  }>(`
    SELECT
      id, session_id, prompt, selected_project, status, result_json, created_at, updated_at
    FROM sub_agents
    ORDER BY created_at DESC
  `);

  const taskRows = await dbClient.execute<{
    continue_count: number;
    created_at: string;
    goal: string;
    last_error: string;
    last_response: string;
    selected_project: string;
    session_id: string;
    settings_json: string;
    status: TaskStatus;
    updated_at: string;
  }>(`
    SELECT
      session_id, goal, selected_project, status, last_response, last_error,
      continue_count, settings_json, created_at, updated_at
    FROM task_state
  `);

  const messagesBySession = new Map<string, ChatMessage[]>();
  for (const row of messageRows) {
    const list = messagesBySession.get(row.session_id) ?? [];
    const parsed = JSON.parse(row.content_json) as { text?: string };
    list.push({
      id: row.id,
      role: row.role,
      content: parsed.text ?? "",
      createdAt: row.created_at,
      turnIndex: Number(row.turn_index),
    });
    messagesBySession.set(row.session_id, list);
  }

  const artifactsBySession = new Map<string, SessionArtifact[]>();
  for (const row of artifactRows) {
    const list = artifactsBySession.get(row.session_id) ?? [];
    list.push({
      id: row.id,
      sessionId: row.session_id,
      kind: row.kind,
      createdAt: row.created_at,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    });
    artifactsBySession.set(row.session_id, list);
  }

  const approvalsBySession = new Map<string, ApprovalRecord[]>();
  for (const row of approvalRows) {
    const list = approvalsBySession.get(row.session_id) ?? [];
    list.push({
      id: row.id,
      sessionId: row.session_id,
      toolName: row.tool_name,
      input: JSON.parse(row.input_json) as Record<string, unknown>,
      status: row.status,
      subAgentId: row.sub_agent_id,
      outputPreview: row.output_preview,
      error: row.error_text,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    approvalsBySession.set(row.session_id, list);
  }

  const subAgentsBySession = new Map<string, SubAgentRun[]>();
  for (const row of subAgentRows) {
    const list = subAgentsBySession.get(row.session_id) ?? [];
    const parsed = JSON.parse(row.result_json) as {
      executionMode?: ToolExecutionMode;
      error?: string;
      finalResponse?: string;
      lastResumedAt?: string;
      pendingApprovals?: string[];
      resumeCount?: number;
      resumeReadyAt?: string;
      toolCalls?: ToolExecutionTrace[];
    };
    list.push({
      id: row.id,
      sessionId: row.session_id,
      prompt: row.prompt,
      selectedProject: row.selected_project,
      executionMode: parsed.executionMode ?? "read-only",
      status: row.status,
      finalResponse: parsed.finalResponse ?? "",
      error: parsed.error ?? "",
      lastResumedAt: parsed.lastResumedAt ?? "",
      pendingApprovals: parsed.pendingApprovals ?? [],
      resumeCount: parsed.resumeCount ?? 0,
      resumeReadyAt: parsed.resumeReadyAt ?? "",
      toolCalls: parsed.toolCalls ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    subAgentsBySession.set(row.session_id, list);
  }

  const taskBySession = new Map<string, TaskState>();
  for (const row of taskRows) {
    taskBySession.set(row.session_id, {
      sessionId: row.session_id,
      goal: row.goal,
      selectedProject: row.selected_project,
      status: row.status,
      lastResponse: row.last_response,
      lastError: row.last_error,
      continueCount: Number(row.continue_count),
      settings: row.settings_json.trim()
        ? (JSON.parse(row.settings_json) as BackendSettings)
        : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  return sessionRows.map((row) => ({
    session: {
      id: row.id,
      title: row.title,
      model: row.model,
      mode: row.mode,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    approvals: approvalsBySession.get(row.id) ?? [],
    messages: messagesBySession.get(row.id) ?? [],
    artifacts: artifactsBySession.get(row.id) ?? [],
    subAgents: subAgentsBySession.get(row.id) ?? [],
    task: taskBySession.get(row.id) ?? null,
  }));
}

async function getSnapshot(dbClient: RawAccess, sessionId: string) {
  const snapshots = await listSnapshots(dbClient);
  return snapshots.find((entry) => entry.session.id === sessionId) ?? null;
}

async function requireSnapshot(dbClient: RawAccess, sessionId: string) {
  const snapshot = await getSnapshot(dbClient, sessionId);
  if (!snapshot) {
    throw new Error(`Unknown session: ${sessionId}`);
  }
  return snapshot;
}

async function finalizeAgentTurn(
  dbClient: RawAccess,
  snapshot: SessionSnapshot,
  prompt: string,
  runId: string,
  settings: BackendSettings,
  selectedProject: string,
  executionMode: ToolExecutionMode,
  loopResult: AgentLoopResult,
  continueCount: number,
): Promise<AgentTurnResult> {
  const persistedAssistant = await persistMessage(
    dbClient,
    snapshot.session.id,
    "assistant",
    loopResult.finalResponse,
  );
  const artifact = await persistArtifact(dbClient, snapshot.session.id, "agent_run", {
    executionMode,
    finalResponse: loopResult.finalResponse,
    pendingApprovals: loopResult.pendingApprovals.map((approval) => approval.id),
    prompt,
    runId,
    selectedProject,
    toolCalls: loopResult.toolCalls,
  } satisfies AgentRunArtifactPayload);

  const task = await saveTaskState(dbClient, {
    sessionId: snapshot.session.id,
    goal: prompt,
    selectedProject,
    status:
      loopResult.pendingApprovals.length > 0
        ? "waiting_approval"
        : "completed",
    lastResponse: loopResult.finalResponse,
    lastError: "",
    continueCount,
    settings,
  });

  return {
    approvals: loopResult.pendingApprovals,
    artifact,
    message: persistedAssistant.message,
    pendingApproval: loopResult.pendingApprovals.length > 0,
    session: persistedAssistant.session,
    task,
    toolCalls: loopResult.toolCalls,
  };
}

async function executeAgentTurnWithProgress(
  dbClient: RawAccess,
  snapshot: SessionSnapshot,
  prompt: string,
  settings: BackendSettings,
  selectedProject: string,
  executionMode: ToolExecutionMode,
  continueCount: number,
  ownerSubAgentId: string | null = null,
  extraMessages: OpenAiMessage[] = [],
) {
  const runId = crypto.randomUUID();
  const runningTaskCreatedAt = snapshot.task?.createdAt ?? nowIso();
  let latestPartialResponse = "";
  let lastPersistedAt = 0;
  let lastPersistedLength = 0;

  await saveTaskState(dbClient, {
    sessionId: snapshot.session.id,
    goal: prompt,
    selectedProject,
    status: "running",
    lastResponse: "",
    lastError: "",
    continueCount,
    settings,
    createdAt: runningTaskCreatedAt,
    updatedAt: nowIso(),
  });
  await persistArtifact(dbClient, snapshot.session.id, "agent_run_started", {
    executionMode,
    prompt,
    runId,
    selectedProject,
  });

  try {
    const loopResult = await runAgentLoop(
      dbClient,
      snapshot,
      prompt,
      settings,
      selectedProject,
      executionMode,
      {
        runId,
        onAssistantDelta: async (fullText) => {
          latestPartialResponse = fullText;
          const now = Date.now();
          if (
            now - lastPersistedAt < 120 &&
            fullText.length - lastPersistedLength < 48
          ) {
            return;
          }
          lastPersistedAt = now;
          lastPersistedLength = fullText.length;
          await saveTaskState(dbClient, {
            sessionId: snapshot.session.id,
            goal: prompt,
            selectedProject,
            status: "running",
            lastResponse: fullText,
            lastError: "",
            continueCount,
            settings,
            createdAt: runningTaskCreatedAt,
            updatedAt: nowIso(),
          });
        },
        onToolStarted: async (event) => {
          await persistAgentToolEvent(dbClient, snapshot.session.id, event);
        },
        onToolFinished: async (event) => {
          await persistAgentToolEvent(dbClient, snapshot.session.id, event);
        },
      },
      ownerSubAgentId,
      extraMessages,
    );
    return await finalizeAgentTurn(
      dbClient,
      snapshot,
      prompt,
      runId,
      settings,
      selectedProject,
      executionMode,
      loopResult,
      continueCount,
    );
  } catch (error) {
    const message = toErrorMessage(error);
    await saveTaskState(dbClient, {
      sessionId: snapshot.session.id,
      goal: prompt,
      selectedProject,
      status: "failed",
      lastResponse: latestPartialResponse,
      lastError: message,
      continueCount,
      settings,
      createdAt: runningTaskCreatedAt,
      updatedAt: nowIso(),
    });
    await persistArtifact(dbClient, snapshot.session.id, "agent_run_failed", {
      error: message,
      executionMode,
      prompt,
      runId,
      selectedProject,
    });
    throw error;
  }
}

async function continueExistingTask(
  dbClient: RawAccess,
  snapshot: SessionSnapshot,
  task: TaskState,
  settings: BackendSettings,
): Promise<AgentTurnResult> {
  const executionMode = sessionModeToExecutionMode(snapshot.session.mode);
  const continuePrompt = [
    "Continue the active task until you either finish it, need approval, or hit a concrete blocker.",
    `Active task: ${task.goal}`,
    task.selectedProject ? `Selected project: ${task.selectedProject}` : "",
    "Use the latest repository state and do not repeat already completed work.",
  ]
    .filter(Boolean)
    .join("\n");
  return await executeAgentTurnWithProgress(
    dbClient,
    snapshot,
    task.goal,
    settings,
    task.selectedProject,
    executionMode,
    task.continueCount + 1,
    null,
    [
      {
        role: "system",
        content: continuePrompt,
      },
    ],
  );
}

export const vibeLocalActor = actor({
  options: {
    actionTimeout: 180_000,
  },
  createState: async () => ({}),
  db: db({
    onMigrate: migrateVibeLocalTables,
  }),
  actions: {
    hydrate: async (c) => {
      return {
        sessions: await listSnapshots(c.db),
      };
    },
    createSession: async (c, title = "") => {
      const createdAt = nowIso();
      const session = {
        id: crypto.randomUUID(),
        title: title.trim() || "New session",
        model: "",
        mode: "plan" as const,
        createdAt,
        updatedAt: createdAt,
      };

      await c.db.execute(
        `
          INSERT INTO sessions(id, title, model, mode, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        session.id,
        session.title,
        session.model,
        session.mode,
        session.createdAt,
        session.updatedAt,
      );

      return {
        session,
        approvals: [],
        messages: [],
        artifacts: [],
        subAgents: [],
        task: null,
      } satisfies SessionSnapshot;
    },
    setSessionConfig: async (c, sessionId: string, model: string, mode: SessionMode) => {
      const snapshot = await requireSnapshot(c.db, sessionId);
      const updatedAt = nowIso();
      await c.db.execute(
        `
          UPDATE sessions
          SET model = ?, mode = ?, updated_at = ?
          WHERE id = ?
        `,
        model,
        mode,
        updatedAt,
        sessionId,
      );

      return {
        ...snapshot.session,
        model,
        mode,
        updatedAt,
      } satisfies SessionRecord;
    },
    appendMessage: async (c, sessionId: string, role: ChatRole, content: string) => {
      return await persistMessage(c.db, sessionId, role, content);
    },
    compactSession: async (c, sessionId: string) => {
      const snapshot = await requireSnapshot(c.db, sessionId);
      if (snapshot.messages.length <= 8) {
        return {
          changed: false,
          messages: snapshot.messages,
          artifact: null,
          session: snapshot.session,
        } satisfies CompactResult;
      }

      const oldMessages = snapshot.messages.slice(0, -8);
      const keepMessages = snapshot.messages.slice(-8);
      const summary = oldMessages
        .map((message) => `${message.role}: ${message.content.replace(/\s+/g, " ").trim()}`)
        .join(" | ")
        .slice(0, 2000);

      const artifact = {
        id: crypto.randomUUID(),
        sessionId,
        kind: "compaction_summary",
        createdAt: nowIso(),
        payload: {
          compactedMessageCount: oldMessages.length,
          summary,
        },
      } satisfies SessionArtifact;

      await c.db.execute("DELETE FROM messages WHERE session_id = ?", sessionId);
      for (const [turnIndex, message] of keepMessages.entries()) {
        await c.db.execute(
          `
            INSERT INTO messages(id, session_id, role, content_json, created_at, turn_index)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
          message.id,
          sessionId,
          message.role,
          JSON.stringify({ text: message.content }),
          message.createdAt,
          turnIndex,
        );
      }

      await c.db.execute(
        `
          INSERT OR REPLACE INTO artifacts(id, session_id, kind, payload_json, created_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        artifact.id,
        artifact.sessionId,
        artifact.kind,
        JSON.stringify(artifact.payload),
        artifact.createdAt,
      );

      await c.db.execute(
        `
          UPDATE sessions
          SET updated_at = ?
          WHERE id = ?
        `,
        artifact.createdAt,
        sessionId,
      );

      return {
        changed: true,
        messages: keepMessages.map((message, turnIndex) => ({
          ...message,
          turnIndex,
        })),
        artifact,
        session: {
          ...snapshot.session,
          updatedAt: artifact.createdAt,
        },
      } satisfies CompactResult;
    },
    exportSession: async (c, sessionId: string) => {
      return await getSnapshot(c.db, sessionId);
    },
    listProjects: async () => {
      return await discoverProjects();
    },
    projectInfo: async (_c, project: string) => {
      const info = await resolveProject(project);
      const pkg = await readProjectPackageJson(project);
      return {
        ...info,
        packageJson: pkg,
      };
    },
    searchCode: async (_c, query: string, maxResults = 50) => {
      return {
        query,
        matches: await searchCode(query, maxResults),
      };
    },
    gitStatus: async () => {
      const branch = await runGit(["branch", "--show-current"]);
      const status = await runGit(["status", "--short"]);
      return {
        branch: branch.stdout.trim(),
        status: status.stdout.trim().split("\n").filter(Boolean),
      };
    },
    gitDiffStat: async () => {
      const diff = await runGit(["diff", "--stat"]);
      return {
        ok: diff.ok,
        diffStat: diff.stdout.trim(),
        stderr: diff.stderr.trim(),
      };
    },
    runScript: async (_c, project: string, script: string, timeoutMs = 120_000) => {
      return await runProjectScript(project, script, timeoutMs);
    },
    readFile: async (_c, relativePath: string) => {
      const target = resolveRepoPath(relativePath);
      return {
        path: target.relativePath,
        content: await readFile(target.absolutePath, "utf8"),
      };
    },
    readAgentFsMirror: async (_c, relativePath: string) => {
      const target = resolveRepoPath(relativePath);
      if (!isAgentFsWorkspacePath(target.relativePath)) {
        throw new Error(`Path is outside the AgentFS workspace mirror: ${target.relativePath}`);
      }
      return {
        path: target.relativePath,
        content: await readAgentFsMirrorFile(target.relativePath),
      };
    },
    writeFile: async (_c, relativePath: string, content: string) => {
      const target = resolveRepoPath(relativePath);
      await mkdir(path.dirname(target.absolutePath), { recursive: true });
      await writeFile(target.absolutePath, content, "utf8");
      const mirrorResult = isAgentFsWorkspacePath(target.relativePath)
        ? await mirrorWorkspaceFileToAgentFs(target.relativePath, content)
        : null;
      return {
        bytes: mirrorResult?.bytes ?? Buffer.byteLength(content, "utf8"),
        path: target.relativePath,
        updatedAt: nowIso(),
      };
    },
    runAgentTurn: async (
      c,
      sessionId: string,
      prompt: string,
      settings: BackendSettings,
      selectedProject = "",
    ) => {
      const existing = await requireSnapshot(c.db, sessionId);
      const persistedUser = await persistMessage(c.db, sessionId, "user", prompt);
      const executionMode = sessionModeToExecutionMode(existing.session.mode);
      return await executeAgentTurnWithProgress(
        c.db,
        existing,
        persistedUser.message.content,
        settings,
        selectedProject,
        executionMode,
        0,
      );
    },
    continueAgentTask: async (c, sessionId: string, settings?: BackendSettings) => {
      const snapshot = await requireSnapshot(c.db, sessionId);
      const task = await getTaskState(c.db, sessionId);
      if (!task) {
        throw new Error("No active task was found for this session.");
      }
      const resolvedSettings = settings ?? task.settings;
      if (!resolvedSettings) {
        throw new Error("No backend settings were stored for this task.");
      }
      return await continueExistingTask(c.db, snapshot, task, resolvedSettings);
    },
    approveToolCall: async (
      c,
      sessionId: string,
      approvalId: string,
      decision: "approve" | "reject",
      continueAfter = false,
      settings?: BackendSettings,
    ) => {
      const snapshot = await requireSnapshot(c.db, sessionId);
      const approval = await getApproval(c.db, approvalId);
      if (!approval || approval.sessionId !== sessionId) {
        throw new Error(`Unknown approval: ${approvalId}`);
      }
      if (approval.status !== "pending") {
        throw new Error(`Approval ${approvalId} is already ${approval.status}.`);
      }

      const updatedAt = nowIso();
      if (decision === "reject") {
        const rejected = await updateApproval(c.db, approvalId, {
          status: "rejected",
          outputPreview: approval.outputPreview,
          error: "",
          updatedAt,
        });
        if (!rejected) {
          throw new Error(`Failed to update approval ${approvalId}.`);
        }
        if (approval.subAgentId) {
          const refreshed = await requireSnapshot(c.db, sessionId);
          const subAgent = getSubAgent(refreshed, approval.subAgentId);
          if (subAgent) {
            await updateSubAgent(c.db, subAgent.id, {
              executionMode: subAgent.executionMode,
              status: "failed",
              finalResponse: subAgent.finalResponse,
              error: "One of the required approvals was rejected.",
              lastResumedAt: subAgent.lastResumedAt,
              pendingApprovals: subAgent.pendingApprovals.filter((candidate) => candidate !== approvalId),
              resumeCount: subAgent.resumeCount,
              resumeReadyAt: subAgent.resumeReadyAt,
              toolCalls: subAgent.toolCalls,
              updatedAt,
            });
          }
        }
        const session = await requireSnapshot(c.db, sessionId);
        return {
          approval: rejected,
          session: session.session,
          continuation: null,
          toolResult: null,
        };
      }

      let toolResult: unknown;
      let status: ApprovalStatus = "approved";
      let error = "";
      try {
        toolResult = await executeCodingTool(approval.toolName, approval.input);
      } catch (caughtError) {
        status = "failed";
        error = toErrorMessage(caughtError);
        toolResult = {
          ok: false,
          error,
        };
      }

      const resolved = await updateApproval(c.db, approvalId, {
        status,
        outputPreview: trimToolOutput(toolResult),
        error,
        updatedAt: nowIso(),
      });
      if (!resolved) {
        throw new Error(`Failed to update approval ${approvalId}.`);
      }
      await persistArtifact(c.db, sessionId, "approval_resolution", {
        approvalId,
        decision,
        error,
        selectedProject: "",
        status,
        toolName: approval.toolName,
      });

      if (approval.subAgentId) {
        const refreshed = await requireSnapshot(c.db, sessionId);
        const subAgent = getSubAgent(refreshed, approval.subAgentId);
        if (subAgent) {
          await updateSubAgent(c.db, subAgent.id, {
            executionMode: subAgent.executionMode,
            status: status === "approved" ? "completed" : "failed",
            finalResponse: subAgent.finalResponse,
            error: status === "approved" ? "" : error,
            lastResumedAt: subAgent.lastResumedAt,
            pendingApprovals: subAgent.pendingApprovals.filter((candidate) => candidate !== approvalId),
            resumeCount: subAgent.resumeCount,
            resumeReadyAt: status === "approved" ? updatedAt : subAgent.resumeReadyAt,
            toolCalls: subAgent.toolCalls,
            updatedAt,
          });
        }
      }

      const taskBeforeContinuation = await getTaskState(c.db, sessionId);
      let continuation: AgentTurnResult | null = null;
      if (continueAfter && status === "approved" && taskBeforeContinuation) {
        const resolvedSettings = settings ?? taskBeforeContinuation.settings;
        if (!resolvedSettings) {
          throw new Error("No backend settings were stored for this task.");
        }
        continuation = await continueExistingTask(c.db, await requireSnapshot(c.db, sessionId), taskBeforeContinuation, resolvedSettings);
      } else if (taskBeforeContinuation) {
        const refreshed = await requireSnapshot(c.db, sessionId);
        const remainingPendingApprovals = refreshed.approvals.filter(
          (candidate) => candidate.status === "pending",
        );
        await saveTaskState(c.db, {
          ...taskBeforeContinuation,
          status:
            status !== "approved"
              ? "failed"
              : remainingPendingApprovals.length > 0
                ? "waiting_approval"
                : "completed",
          lastError: error,
          updatedAt: nowIso(),
        });
      }

      return {
        approval: resolved,
        continuation,
        session: snapshot.session,
        toolResult,
      };
    },
    continueSubAgentTask: async (c, sessionId: string, subAgentId: string, settings: BackendSettings) => {
      return await executeContinueSubAgentTask(c.db, sessionId, subAgentId, settings);
    },
    runParallelAgentTasks: async (
      c,
      sessionId: string,
      prompts: string[],
      settings: BackendSettings,
      selectedProject = "",
      executionMode: ToolExecutionMode = "read-only",
    ) =>
      await executeParallelAgentTasks(
        c.db,
        sessionId,
        prompts,
        settings,
        selectedProject,
        executionMode,
      ),
    rewriteFileWithAgent: async (
      c,
      sessionId: string,
      relativePath: string,
      prompt: string,
      settings: BackendSettings,
      selectedProject = "",
    ) => {
      const target = resolveRepoPath(relativePath);
      const currentContent = await readFile(target.absolutePath, "utf8").catch(() => "");
      const userPrompt = [
        `Rewrite the file ${target.relativePath}.`,
        "Return only the complete UTF-8 file contents.",
        "Do not wrap the response in markdown fences.",
        prompt.trim(),
        "",
        `Current file (${target.relativePath}):`,
        currentContent,
      ]
        .filter(Boolean)
        .join("\n");

      await persistMessage(c.db, sessionId, "user", userPrompt);

      const assistant = await callOpenAiCompatible(
        settings,
        [
          {
            role: "system",
            content: [
              createAgentSystemPrompt(selectedProject, settings.systemPrompt, "act"),
              `Return only the full contents of ${target.relativePath}.`,
              "No markdown fences. No commentary. No diff format.",
            ].join("\n"),
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
        false,
      );

      const nextContent = assistant.content?.trim();
      if (!nextContent) {
        throw new Error("Agent file rewrite finished without file contents.");
      }

      if (isAgentFsWorkspacePath(target.relativePath)) {
        const absolutePath = await ensureWorkspaceParentExists(target.relativePath);
        await writeFile(absolutePath, nextContent, "utf8");
        await mirrorWorkspaceFileToAgentFs(target.relativePath, nextContent);
      } else {
        await mkdir(path.dirname(target.absolutePath), { recursive: true });
        await writeFile(target.absolutePath, nextContent, "utf8");
      }

      const persistedAssistant = await persistMessage(
        c.db,
        sessionId,
        "assistant",
        `Updated ${target.relativePath}`,
      );
      const artifact = await persistArtifact(c.db, sessionId, "agent_file_rewrite", {
        bytes: Buffer.byteLength(nextContent, "utf8"),
        path: target.relativePath,
        prompt,
        selectedProject,
      });

      return {
        artifact,
        path: target.relativePath,
        bytes: Buffer.byteLength(nextContent, "utf8"),
        session: persistedAssistant.session,
      };
    },
  },
});
