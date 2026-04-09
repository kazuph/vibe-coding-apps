export type SessionMode = "plan" | "act";

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

export interface SessionRecord {
  createdAt: string;
  id: string;
  mode: SessionMode;
  model: string;
  title: string;
  updatedAt: string;
}

export interface SessionSnapshot {
  artifacts: SessionArtifact[];
  messages: ChatMessage[];
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
