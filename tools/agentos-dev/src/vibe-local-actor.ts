import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { actor } from "rivetkit";
import { db, type RawAccess } from "rivetkit/db";

import { REPO_ROOT } from "./config.js";
import {
  discoverProjects,
  readProjectPackageJson,
  resolveProject,
  runProjectScript,
} from "./projects.js";

type SessionMode = "plan" | "act";
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
  toolName: string;
  updatedAt: string;
};

type SubAgentStatus = "completed" | "failed" | "queued" | "running";

type SubAgentRun = {
  createdAt: string;
  error: string;
  finalResponse: string;
  id: string;
  prompt: string;
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
  session: SessionRecord;
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
  executionMode: "act" | "plan" | "read-only";
  finalResponse: string;
  pendingApprovals: string[];
  prompt: string;
  selectedProject: string;
  toolCalls: ToolExecutionTrace[];
};

type AgentLoopResult = {
  finalResponse: string;
  pendingApprovals: ApprovalRecord[];
  toolCalls: ToolExecutionTrace[];
};

const execFileAsync = promisify(execFile);
const MUTATING_TOOL_NAMES = new Set(["replaceInFile", "runScript", "writeFile"]);

type ToolExecutionMode = "act" | "plan" | "read-only";

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
] as const;

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

async function createApproval(
  dbClient: RawAccess,
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>,
) {
  const createdAt = nowIso();
  const approval = {
    id: crypto.randomUUID(),
    sessionId,
    toolName,
    input,
    status: "pending" as const,
    outputPreview: "",
    error: "",
    createdAt,
    updatedAt: createdAt,
  } satisfies ApprovalRecord;

  await dbClient.execute(
    `
      INSERT INTO approvals(
        id, session_id, tool_name, input_json, status, output_preview, error_text, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    approval.id,
    approval.sessionId,
    approval.toolName,
    JSON.stringify(approval.input),
    approval.status,
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
    tool_name: string;
    updated_at: string;
  }>(
    `
      SELECT
        id, session_id, tool_name, input_json, status, output_preview, error_text, created_at, updated_at
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
) {
  const createdAt = nowIso();
  const subAgent = {
    id: crypto.randomUUID(),
    sessionId,
    prompt,
    selectedProject,
    status: "queued" as const,
    finalResponse: "",
    error: "",
    toolCalls: [],
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
      finalResponse: subAgent.finalResponse,
      error: subAgent.error,
      toolCalls: subAgent.toolCalls,
    }),
    subAgent.createdAt,
    subAgent.updatedAt,
  );

  return subAgent;
}

async function updateSubAgent(
  dbClient: RawAccess,
  subAgentId: string,
  patch: Pick<SubAgentRun, "error" | "finalResponse" | "status" | "toolCalls" | "updatedAt">,
) {
  await dbClient.execute(
    `
      UPDATE sub_agents
      SET status = ?, result_json = ?, updated_at = ?
      WHERE id = ?
    `,
    patch.status,
    JSON.stringify({
      finalResponse: patch.finalResponse,
      error: patch.error,
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

function createAgentSystemPrompt(selectedProject: string, extraPrompt: string) {
  return [
    "You are the coding mode of vibe-local running on top of agentOS.",
    "Use tools whenever the user asks about repository state, files, scripts, or code changes.",
    "Do not pretend to inspect files or run scripts without a tool call.",
    "Keep answers concise, practical, and directly tied to the current repository.",
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
) {
  const normalizedMessages = normalizeOpenAiMessages(messages);
  const response = await fetch(`${settings.baseUrl.trim().replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}),
    },
    body: JSON.stringify({
      model: settings.model,
      messages: normalizedMessages,
      ...(includeTools
        ? {
            tools: CODING_TOOL_SCHEMAS,
            tool_choice: "auto",
          }
        : {}),
      temperature: settings.temperature,
      max_tokens: settings.maxTokens,
      stream: false,
    }),
  });

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
      await mkdir(path.dirname(target.absolutePath), { recursive: true });
      await writeFile(target.absolutePath, String(args.content ?? ""), "utf8");
      return {
        ok: true,
        path: target.relativePath,
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

function createApprovalRequiredPreview(toolName: string, approvalId: string, input: Record<string, unknown>) {
  return trimToolOutput({
    ok: false,
    approvalRequired: true,
    approvalId,
    toolName,
    input,
  });
}

async function runAgentLoop(
  dbClient: RawAccess,
  snapshot: SessionSnapshot,
  prompt: string,
  settings: BackendSettings,
  selectedProject: string,
  executionMode: ToolExecutionMode,
) {
  const toolCalls: ToolExecutionTrace[] = [];
  const pendingApprovals: ApprovalRecord[] = [];
  const messages: OpenAiMessage[] = [
    {
      role: "system",
      content: createAgentSystemPrompt(selectedProject, settings.systemPrompt),
    },
    ...snapshot.messages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    {
      role: "user",
      content: prompt,
    },
  ];

  for (let iteration = 0; iteration < 6; iteration += 1) {
    const assistant = await callOpenAiCompatible(settings, messages, true);
    if (assistant.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: assistant.content ?? "",
        tool_calls: assistant.tool_calls,
      });

      for (const toolCall of assistant.tool_calls) {
        const startedAt = nowIso();
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

        if (result === undefined) {
          if (executionMode === "read-only" && MUTATING_TOOL_NAMES.has(trace.name)) {
            trace.status = "rejected";
            trace.error = "Sub-agents are read-only and cannot execute mutating tools.";
            result = {
              ok: false,
              error: trace.error,
            };
          } else if (executionMode === "plan" && MUTATING_TOOL_NAMES.has(trace.name)) {
            const approval = await createApproval(dbClient, snapshot.session.id, trace.name, input);
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
              result = await executeCodingTool(trace.name, input);
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
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: trace.outputPreview,
        });
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

    const finalResponse = assistant.content?.trim();
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
    tool_name: string;
    updated_at: string;
  }>(`
    SELECT
      id, session_id, tool_name, input_json, status, output_preview, error_text, created_at, updated_at
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
      error?: string;
      finalResponse?: string;
      toolCalls?: ToolExecutionTrace[];
    };
    list.push({
      id: row.id,
      sessionId: row.session_id,
      prompt: row.prompt,
      selectedProject: row.selected_project,
      status: row.status,
      finalResponse: parsed.finalResponse ?? "",
      error: parsed.error ?? "",
      toolCalls: parsed.toolCalls ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    subAgentsBySession.set(row.session_id, list);
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
    writeFile: async (_c, relativePath: string, content: string) => {
      const target = resolveRepoPath(relativePath);
      await mkdir(path.dirname(target.absolutePath), { recursive: true });
      await writeFile(target.absolutePath, content, "utf8");
      return {
        bytes: Buffer.byteLength(content, "utf8"),
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
      const executionMode = existing.session.mode === "act" ? "act" : "plan";
      const loopResult = await runAgentLoop(
        c.db,
        existing,
        persistedUser.message.content,
        settings,
        selectedProject,
        executionMode,
      );
      const persistedAssistant = await persistMessage(
        c.db,
        sessionId,
        "assistant",
        loopResult.finalResponse,
      );
      const artifact = await persistArtifact(c.db, sessionId, "agent_run", {
        executionMode,
        finalResponse: loopResult.finalResponse,
        pendingApprovals: loopResult.pendingApprovals.map((approval) => approval.id),
        prompt,
        selectedProject,
        toolCalls: loopResult.toolCalls,
      } satisfies AgentRunArtifactPayload);

      return {
        approvals: loopResult.pendingApprovals,
        artifact,
        message: persistedAssistant.message,
        pendingApproval: loopResult.pendingApprovals.length > 0,
        session: persistedAssistant.session,
        toolCalls: loopResult.toolCalls,
      };
    },
    approveToolCall: async (c, sessionId: string, approvalId: string, decision: "approve" | "reject") => {
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
        const session = await requireSnapshot(c.db, sessionId);
        return {
          approval: rejected,
          session: session.session,
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

      return {
        approval: resolved,
        session: snapshot.session,
        toolResult,
      };
    },
    runParallelAgentTasks: async (
      c,
      sessionId: string,
      prompts: string[],
      settings: BackendSettings,
      selectedProject = "",
    ) => {
      const snapshot = await requireSnapshot(c.db, sessionId);
      const trimmedPrompts = prompts.map((prompt) => prompt.trim()).filter(Boolean).slice(0, 4);
      if (trimmedPrompts.length === 0) {
        throw new Error("At least one sub-agent prompt is required.");
      }

      const subAgents = await Promise.all(
        trimmedPrompts.map(async (prompt) => await createSubAgent(c.db, sessionId, prompt, selectedProject)),
      );

      await Promise.all(
        subAgents.map(async (subAgent) => {
          await updateSubAgent(c.db, subAgent.id, {
            status: "running",
            finalResponse: "",
            error: "",
            toolCalls: [],
            updatedAt: nowIso(),
          });

          try {
            const result = await runAgentLoop(
              c.db,
              snapshot,
              subAgent.prompt,
              settings,
              selectedProject,
              "read-only",
            );
            await updateSubAgent(c.db, subAgent.id, {
              status: "completed",
              finalResponse: result.finalResponse,
              error: "",
              toolCalls: result.toolCalls,
              updatedAt: nowIso(),
            });
          } catch (caughtError) {
            await updateSubAgent(c.db, subAgent.id, {
              status: "failed",
              finalResponse: "",
              error: toErrorMessage(caughtError),
              toolCalls: [],
              updatedAt: nowIso(),
            });
          }
        }),
      );

      const refreshed = await requireSnapshot(c.db, sessionId);
      await persistArtifact(c.db, sessionId, "parallel_agent_run", {
        count: trimmedPrompts.length,
        selectedProject,
        subAgentIds: subAgents.map((subAgent) => subAgent.id),
      });

      return {
        session: refreshed.session,
        subAgents: refreshed.subAgents.filter((subAgent) =>
          subAgents.some((created) => created.id === subAgent.id),
        ),
      };
    },
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
              createAgentSystemPrompt(selectedProject, settings.systemPrompt),
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

      await mkdir(path.dirname(target.absolutePath), { recursive: true });
      await writeFile(target.absolutePath, nextContent, "utf8");

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
