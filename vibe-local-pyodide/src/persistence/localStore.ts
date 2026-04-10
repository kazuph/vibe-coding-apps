import { sqliteStore } from "./sqliteStore";
import { vibeLocalEngine } from "../pyodide/engine";
import type { SessionStore } from "./sessionStore";

export const localStore: SessionStore = {
  mode: "local",
  async getHydratedState() {
    const hydrated = await sqliteStore.getHydratedState();
    await vibeLocalEngine.initialize(hydrated);
    return hydrated;
  },
  async saveSettings(settings) {
    await sqliteStore.saveSettings(settings);
  },
  async createSession(title = "") {
    const snapshot = await vibeLocalEngine.createSession(title);
    await sqliteStore.insertSession(snapshot);
    return snapshot;
  },
  async setSessionConfig(sessionId, model, mode) {
    const session = await vibeLocalEngine.setSessionConfig(sessionId, model, mode);
    await sqliteStore.saveSession(session);
    return session;
  },
  async appendMessage(sessionId, role, content) {
    const result = await vibeLocalEngine.appendMessage(sessionId, role, content);
    await sqliteStore.appendMessage(sessionId, result.message, result.session);
    return result;
  },
  async compactSession(sessionId) {
    const result = await vibeLocalEngine.compactSession(sessionId);
    if (result.changed) {
      await sqliteStore.applyCompaction(result);
    }
    return result;
  },
  async exportSession(sessionId) {
    return await sqliteStore.exportSession(sessionId);
  },
};
