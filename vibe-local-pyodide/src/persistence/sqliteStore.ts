import { get, set } from "idb-keyval";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

import type {
  BackendSettings,
  ChatMessage,
  CompactResult,
  HydratedState,
  SessionArtifact,
  SessionRecord,
  SessionSnapshot,
} from "../types";

const SQLITE_DB_KEY = "vibe-local-pyodide.sqlite";
const SETTINGS_STORAGE_KEY = "vibe-local-pyodide.settings";

const DEFAULT_SETTINGS: BackendSettings = {
  apiKey: "",
  baseUrl: "http://localhost:11434/v1",
  model: "",
  systemPrompt:
    "You are the browser core of vibe-local. Be concise, careful, and helpful.",
  temperature: 0.2,
  maxTokens: 1200,
};

export function getDefaultBackendSettings(): BackendSettings {
  return { ...DEFAULT_SETTINGS };
}

export function shouldHydrateFromExternalSettings(settings: BackendSettings) {
  return !settings.model.trim() || settings.baseUrl.trim() === DEFAULT_SETTINGS.baseUrl;
}

function toIso(value: unknown) {
  return typeof value === "string" ? value : new Date().toISOString();
}

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readSettingsFromLocalStorage() {
  if (!canUseLocalStorage()) return null;
  const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return null;

  try {
    return {
      ...DEFAULT_SETTINGS,
      ...(JSON.parse(raw) as Partial<BackendSettings>),
    } satisfies BackendSettings;
  } catch {
    return null;
  }
}

function writeSettingsToLocalStorage(settings: BackendSettings) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export class SqliteSessionStore {
  private db: Database | null = null;
  private sqlJs: SqlJsStatic | null = null;

  async initialize() {
    if (this.db) return;

    this.sqlJs = await initSqlJs({
      locateFile: () => sqlWasmUrl,
    });

    const stored = await get<Uint8Array>(SQLITE_DB_KEY);
    this.db = stored ? new this.sqlJs.Database(stored) : new this.sqlJs.Database();
    this.applySchema();
    await this.persist();
  }

  async getHydratedState(): Promise<HydratedState> {
    await this.initialize();
    return {
      sessions: this.listSessionSnapshots(),
      settings: this.getSettings(),
    };
  }

  async saveSettings(next: BackendSettings) {
    await this.initialize();
    writeSettingsToLocalStorage(next);
  }

  getSettings(): BackendSettings {
    const localSettings = readSettingsFromLocalStorage();
    if (localSettings) {
      return localSettings;
    }

    const db = this.requireDb();
    const result = db.exec("SELECT key, value_json FROM settings");
    if (!result[0]) return { ...DEFAULT_SETTINGS };

    const settings = { ...DEFAULT_SETTINGS };
    const { columns, values } = result[0];
    const keyIndex = columns.indexOf("key");
    const valueIndex = columns.indexOf("value_json");
    for (const row of values) {
      const key = String(row[keyIndex]);
      const value = JSON.parse(String(row[valueIndex]));
      (settings as Record<string, unknown>)[key] = value;
    }

    writeSettingsToLocalStorage(settings);
    return settings;
  }

  async insertSession(snapshot: SessionSnapshot) {
    await this.initialize();
    this.upsertSession(snapshot.session);
    await this.persist();
  }

  async saveSession(session: SessionRecord) {
    await this.initialize();
    this.upsertSession(session);
    await this.persist();
  }

  async appendMessage(sessionId: string, message: ChatMessage, session: SessionRecord) {
    await this.initialize();
    const db = this.requireDb();
    this.upsertSession(session);
    const statement = db.prepare(`
      INSERT INTO messages(id, session_id, role, content_json, created_at, turn_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    statement.run([
      message.id,
      sessionId,
      message.role,
      JSON.stringify({ text: message.content }),
      message.createdAt,
      message.turnIndex,
    ]);
    statement.free();
    await this.persist();
  }

  async applyCompaction(result: CompactResult) {
    await this.initialize();
    const db = this.requireDb();
    this.upsertSession(result.session);
    db.run("DELETE FROM messages WHERE session_id = ?", [result.session.id]);
    const messageStatement = db.prepare(`
      INSERT INTO messages(id, session_id, role, content_json, created_at, turn_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const message of result.messages) {
      messageStatement.run([
        message.id,
        result.session.id,
        message.role,
        JSON.stringify({ text: message.content }),
        message.createdAt,
        message.turnIndex,
      ]);
    }
    messageStatement.free();

    if (result.artifact) {
      const artifactStatement = db.prepare(`
        INSERT OR REPLACE INTO artifacts(id, session_id, kind, payload_json, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      artifactStatement.run([
        result.artifact.id,
        result.artifact.sessionId,
        result.artifact.kind,
        JSON.stringify(result.artifact.payload),
        result.artifact.createdAt,
      ]);
      artifactStatement.free();
    }

    await this.persist();
  }

  async exportSession(sessionId: string) {
    await this.initialize();
    const snapshots = this.listSessionSnapshots();
    return snapshots.find((entry) => entry.session.id === sessionId) ?? null;
  }

  private listSessionSnapshots(): SessionSnapshot[] {
    const db = this.requireDb();
    const sessionsResult = db.exec(`
      SELECT id, title, model, mode, created_at, updated_at
      FROM sessions
      ORDER BY updated_at DESC
    `);

    if (!sessionsResult[0]) return [];

    const messageResult = db.exec(`
      SELECT id, session_id, role, content_json, created_at, turn_index
      FROM messages
      ORDER BY turn_index ASC
    `);
    const artifactResult = db.exec(`
      SELECT id, session_id, kind, payload_json, created_at
      FROM artifacts
      ORDER BY created_at DESC
    `);

    const messagesBySession = new Map<string, ChatMessage[]>();
    for (const row of messageResult[0]?.values ?? []) {
      const [id, sessionId, role, contentJson, createdAt, turnIndex] = row;
      const content = JSON.parse(String(contentJson)) as { text?: string };
      const list = messagesBySession.get(String(sessionId)) ?? [];
      list.push({
        id: String(id),
        role: String(role) as ChatMessage["role"],
        content: content.text ?? "",
        createdAt: toIso(createdAt),
        turnIndex: Number(turnIndex),
      });
      messagesBySession.set(String(sessionId), list);
    }

    const artifactsBySession = new Map<string, SessionArtifact[]>();
    for (const row of artifactResult[0]?.values ?? []) {
      const [id, sessionId, kind, payloadJson, createdAt] = row;
      const list = artifactsBySession.get(String(sessionId)) ?? [];
      list.push({
        id: String(id),
        sessionId: String(sessionId),
        kind: String(kind),
        createdAt: toIso(createdAt),
        payload: JSON.parse(String(payloadJson)) as Record<string, unknown>,
      });
      artifactsBySession.set(String(sessionId), list);
    }

    return sessionsResult[0].values.map((row: readonly unknown[]) => {
      const [id, title, model, mode, createdAt, updatedAt] = row;
      const sessionId = String(id);
      return {
        session: {
          id: sessionId,
          title: String(title || "New session"),
          model: String(model || ""),
          mode: String(mode || "plan") as SessionRecord["mode"],
          createdAt: toIso(createdAt),
          updatedAt: toIso(updatedAt),
        },
        approvals: [],
        messages: messagesBySession.get(sessionId) ?? [],
        artifacts: artifactsBySession.get(sessionId) ?? [],
        subAgents: [],
      };
    });
  }

  private upsertSession(session: SessionRecord) {
    const db = this.requireDb();
    const statement = db.prepare(`
      INSERT INTO sessions(id, title, model, mode, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        model = excluded.model,
        mode = excluded.mode,
        updated_at = excluded.updated_at
    `);
    statement.run([
      session.id,
      session.title,
      session.model,
      session.mode,
      session.createdAt,
      session.updatedAt,
    ]);
    statement.free();
  }

  private async persist() {
    const db = this.requireDb();
    await set(SQLITE_DB_KEY, db.export());
  }

  private requireDb() {
    if (!this.db) {
      throw new Error("SQLite DB is not initialized.");
    }

    return this.db;
  }

  private applySchema() {
    const db = this.requireDb();
    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        title TEXT NOT NULL,
        model TEXT NOT NULL,
        mode TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        turn_index INTEGER NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );
    `);
  }
}

export const sqliteStore = new SqliteSessionStore();
