import { loadPyodide, type PyodideInterface } from "pyodide";

import coreSource from "../py/vibe_local_core.py?raw";
import type {
  ChatMessage,
  CompactResult,
  HydratedState,
  SessionRecord,
  SessionSnapshot,
} from "../types";

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

export class VibeLocalPyodideEngine {
  private pyodide: PyodideInterface | null = null;

  async initialize(state: HydratedState) {
    if (this.pyodide) {
      await this.loadState(state);
      return;
    }

    this.pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/",
    });
    await this.pyodide.runPythonAsync(coreSource);
    await this.loadState(state);
  }

  async loadState(state: HydratedState) {
    const pyodide = this.requireRuntime();
    pyodide.globals.set("payload_json", JSON.stringify({ sessions: state.sessions }));
    try {
      pyodide.runPython("load_state(payload_json)");
    } finally {
      pyodide.globals.delete("payload_json");
    }
  }

  async createSession(title = "") {
    const pyodide = this.requireRuntime();
    pyodide.globals.set("session_title", title);
    try {
      return parseJson<SessionSnapshot>(pyodide.runPython("create_session(session_title)"));
    } finally {
      pyodide.globals.delete("session_title");
    }
  }

  async appendMessage(sessionId: string, role: ChatMessage["role"], content: string) {
    const pyodide = this.requireRuntime();
    pyodide.globals.set("session_id", sessionId);
    pyodide.globals.set("role_name", role);
    pyodide.globals.set("message_content", content);
    try {
      return parseJson<{ message: ChatMessage; session: SessionRecord }>(
        pyodide.runPython("append_message(session_id, role_name, message_content)"),
      );
    } finally {
      pyodide.globals.delete("session_id");
      pyodide.globals.delete("role_name");
      pyodide.globals.delete("message_content");
    }
  }

  async compactSession(sessionId: string) {
    const pyodide = this.requireRuntime();
    pyodide.globals.set("session_id", sessionId);
    try {
      return parseJson<CompactResult>(pyodide.runPython("compact_session(session_id)"));
    } finally {
      pyodide.globals.delete("session_id");
    }
  }

  async listSessions() {
    return parseJson<SessionRecord[]>(this.requireRuntime().runPython("list_sessions()"));
  }

  async getMessages(sessionId: string) {
    const pyodide = this.requireRuntime();
    pyodide.globals.set("session_id", sessionId);
    try {
      return parseJson<ChatMessage[]>(pyodide.runPython("get_session_messages(session_id)"));
    } finally {
      pyodide.globals.delete("session_id");
    }
  }

  async setSessionConfig(sessionId: string, model: string, mode: SessionRecord["mode"]) {
    const pyodide = this.requireRuntime();
    pyodide.globals.set("session_id", sessionId);
    pyodide.globals.set("model_name", model);
    pyodide.globals.set("mode_name", mode);
    try {
      return parseJson<SessionRecord>(
        pyodide.runPython("set_session_config(session_id, model_name, mode_name)"),
      );
    } finally {
      pyodide.globals.delete("session_id");
      pyodide.globals.delete("model_name");
      pyodide.globals.delete("mode_name");
    }
  }

  private requireRuntime() {
    if (!this.pyodide) {
      throw new Error("Pyodide is not initialized yet.");
    }

    return this.pyodide;
  }
}

export const vibeLocalEngine = new VibeLocalPyodideEngine();
