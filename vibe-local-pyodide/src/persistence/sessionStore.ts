import type {
  BackendSettings,
  ChatMessage,
  CompactResult,
  HydratedState,
  SessionRecord,
  SessionSnapshot,
} from "../types";

export interface SessionStore {
  readonly mode: "agentos" | "local";
  getHydratedState(): Promise<HydratedState>;
  saveSettings(settings: BackendSettings): Promise<void>;
  createSession(title?: string): Promise<SessionSnapshot>;
  setSessionConfig(sessionId: string, model: string, mode: SessionRecord["mode"]): Promise<SessionRecord>;
  appendMessage(
    sessionId: string,
    role: ChatMessage["role"],
    content: string,
  ): Promise<{ message: ChatMessage; session: SessionRecord }>;
  compactSession(sessionId: string): Promise<CompactResult>;
  exportSession(sessionId: string): Promise<SessionSnapshot | null>;
}
