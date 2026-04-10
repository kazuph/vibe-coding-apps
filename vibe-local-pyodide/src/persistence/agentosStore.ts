import type { SessionStore } from "./sessionStore";
import { sqliteStore } from "./sqliteStore";
import type {
  ChatMessage,
  CompactResult,
  HydratedState,
  SessionRecord,
  SessionSnapshot,
} from "../types";

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}

export const agentosStore: SessionStore & {
  isAvailable(): Promise<boolean>;
} = {
  mode: "agentos",
  async isAvailable() {
    try {
      const response = await requestJson<{ ok: boolean }>("/__vibe_local/agentos/health");
      return response.ok;
    } catch {
      return false;
    }
  },
  async getHydratedState(): Promise<HydratedState> {
    const settingsState = await sqliteStore.getHydratedState();
    const payload = await requestJson<{ sessions: SessionSnapshot[] }>("/__vibe_local/agentos/hydrate");
    return {
      settings: settingsState.settings,
      sessions: payload.sessions,
    };
  },
  async saveSettings(settings) {
    await sqliteStore.saveSettings(settings);
  },
  async createSession(title = "") {
    return await requestJson<SessionSnapshot>("/__vibe_local/agentos/session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    });
  },
  async setSessionConfig(sessionId, model, mode) {
    return await requestJson<SessionRecord>("/__vibe_local/agentos/session/config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId, model, mode }),
    });
  },
  async appendMessage(sessionId, role, content) {
    return await requestJson<{ message: ChatMessage; session: SessionRecord }>(
      "/__vibe_local/agentos/session/message",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionId, role, content }),
      },
    );
  },
  async compactSession(sessionId) {
    return await requestJson<CompactResult>("/__vibe_local/agentos/session/compact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    });
  },
  async exportSession(sessionId) {
    return await requestJson<SessionSnapshot | null>(
      `/__vibe_local/agentos/export?sessionId=${encodeURIComponent(sessionId)}`,
    );
  },
};
