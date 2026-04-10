export type SessionMode = "plan" | "act" | "yolo";
export type ApprovalStatus = "approved" | "failed" | "pending" | "rejected";
export type ToolExecutionStatus = "approval_required" | "completed" | "failed" | "rejected";
export type TaskStatus = "completed" | "failed" | "idle" | "running" | "waiting_approval";

export interface BackendSettings {
  apiKey: string;
  baseUrl: string;
  maxTokens: number;
  model: string;
  systemPrompt: string;
  temperature: number;
}

export interface StoredMessageContent {
  text: string;
}

export interface ChatMessage {
  content: string;
  createdAt: string;
  id: string;
  role: "assistant" | "system" | "user";
  turnIndex: number;
}

export interface SessionArtifact {
  createdAt: string;
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  sessionId: string;
}

export interface ToolExecutionTrace {
  approvalId?: string;
  error?: string;
  finishedAt: string;
  input: unknown;
  name: string;
  outputPreview: string;
  startedAt: string;
  status: ToolExecutionStatus;
}

export interface ApprovalRecord {
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
}

export interface SubAgentRun {
  createdAt: string;
  error: string;
  executionMode: "act" | "plan" | "read-only" | "yolo";
  finalResponse: string;
  id: string;
  lastResumedAt: string;
  pendingApprovals: string[];
  prompt: string;
  resumeCount: number;
  resumeReadyAt: string;
  selectedProject: string;
  sessionId: string;
  status: "completed" | "failed" | "queued" | "running";
  toolCalls: ToolExecutionTrace[];
  updatedAt: string;
}

export interface SessionRecord {
  createdAt: string;
  id: string;
  mode: SessionMode;
  model: string;
  title: string;
  updatedAt: string;
}

export interface TaskState {
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
}

export interface SessionSnapshot {
  approvals: ApprovalRecord[];
  artifacts: SessionArtifact[];
  messages: ChatMessage[];
  subAgents: SubAgentRun[];
  task: TaskState | null;
  session: SessionRecord;
}

export interface HydratedState {
  sessions: SessionSnapshot[];
  settings: BackendSettings;
}

export interface CompactResult {
  artifact: SessionArtifact | null;
  changed: boolean;
  messages: ChatMessage[];
  session: SessionRecord;
}

export interface ChatStreamChunk {
  done: boolean;
  textDelta: string;
}

export interface ProjectInfo {
  absolutePath: string;
  name: string;
  packageManager?: string;
  relativePath: string;
  scripts: string[];
}

export interface ProjectInfoDetails extends ProjectInfo {
  packageJson: {
    name?: string;
    packageManager?: string;
    scripts?: Record<string, string>;
  };
}

export interface GitStatusResult {
  branch: string;
  status: string[];
}

export interface GitDiffStatResult {
  diffStat: string;
  ok: boolean;
  stderr: string;
}

export interface SearchCodeResult {
  matches: string[];
  query: string;
}

export interface ScriptRunResult {
  command: string;
  cwd: string;
  exitCode: number;
  stderr: string;
  stdout: string;
}

export interface RepoFileResult {
  content: string;
  path: string;
}

export interface RepoFileWriteResult {
  bytes: number;
  path: string;
  updatedAt: string;
}

export interface AgentRunArtifactPayload {
  executionMode: "act" | "plan" | "read-only" | "yolo";
  finalResponse: string;
  pendingApprovals: string[];
  prompt: string;
  selectedProject: string;
  toolCalls: ToolExecutionTrace[];
}

export interface AgentRunResult {
  approvals: ApprovalRecord[];
  artifact: SessionArtifact;
  message: ChatMessage;
  pendingApproval: boolean;
  session: SessionRecord;
  task: TaskState | null;
  toolCalls: ToolExecutionTrace[];
}

export interface ApprovalDecisionResult {
  approval: ApprovalRecord;
  continuation: AgentRunResult | null;
  session: SessionRecord;
  toolResult: unknown;
}

export interface ParallelAgentRunResult {
  session: SessionRecord;
  subAgents: SubAgentRun[];
}

export interface SubAgentContinueResult {
  approvals: ApprovalRecord[];
  noop: boolean;
  reason: string;
  session: SessionRecord;
  subAgent: SubAgentRun;
}
