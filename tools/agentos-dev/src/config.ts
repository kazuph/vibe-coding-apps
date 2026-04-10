import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TOOL_ROOT = path.resolve(__dirname, "..");
export const REPO_ROOT = path.resolve(TOOL_ROOT, "..", "..");
export const STATE_ROOT = path.join(TOOL_ROOT, ".agentos-dev");
export const WRITABLE_WORKSPACE_ROOT = path.join(STATE_ROOT, "workspace");
export const AGENTFS_ROOT = path.join(STATE_ROOT, "agentfs");
export const AGENTFS_WORKSPACE_DB_PATH = path.join(AGENTFS_ROOT, "workspace.db");
export const PI_AGENT_ROOT = path.join(STATE_ROOT, "pi-agent");

export const AGENTOS_PORT = Number.parseInt(process.env.AGENTOS_PORT ?? "6420", 10);
export const SANDBOX_AGENT_PORT = Number.parseInt(
  process.env.SANDBOX_AGENT_PORT ?? "2468",
  10,
);
export const SANDBOX_AGENT_LOG =
  (process.env.SANDBOX_AGENT_LOG as "inherit" | "pipe" | "silent" | undefined) ??
  "inherit";

export const VM_REPO_PATH = "/mnt/repo";
export const VM_WORKSPACE_PATH = "/mnt/workspace";
export const VM_PI_AGENT_PATH = "/home/user/.pi/agent";
export const VM_PI_AGENT_ROOT_PATH = "/root/.pi/agent";

const FORWARDED_ENV_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
  "PORTKEY_API_KEY",
  "LITELLM_API_KEY",
] as const;

mkdirSync(STATE_ROOT, { recursive: true });
mkdirSync(WRITABLE_WORKSPACE_ROOT, { recursive: true });
mkdirSync(AGENTFS_ROOT, { recursive: true });
mkdirSync(PI_AGENT_ROOT, { recursive: true });

export function forwardedAgentEnv(): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of FORWARDED_ENV_KEYS) {
    const value = process.env[key];
    if (value) env[key] = value;
  }

  return env;
}

export function toPosixPath(input: string): string {
  return input.split(path.sep).join(path.posix.sep);
}
