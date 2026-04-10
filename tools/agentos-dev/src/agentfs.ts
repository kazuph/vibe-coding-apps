import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { AgentFS } from "agentfs-sdk";

import {
  AGENTFS_WORKSPACE_DB_PATH,
  REPO_ROOT,
  WRITABLE_WORKSPACE_ROOT,
} from "./config.js";

const WORKSPACE_REPO_PREFIX = path.relative(REPO_ROOT, WRITABLE_WORKSPACE_ROOT).replaceAll("\\", "/");

let workspaceAgentFsPromise: Promise<AgentFS> | null = null;

function normalizeRepoPath(relativePath: string) {
  return relativePath.trim().replaceAll("\\", "/");
}

function toWorkspaceAgentFsPath(relativePath: string) {
  const normalized = normalizeRepoPath(relativePath);
  if (!normalized) {
    throw new Error("Missing path");
  }

  const workspacePrefix = `${WORKSPACE_REPO_PREFIX}/`;
  if (normalized !== WORKSPACE_REPO_PREFIX && !normalized.startsWith(workspacePrefix)) {
    throw new Error(`Path is outside the AgentFS workspace mirror: ${relativePath}`);
  }

  const suffix = normalized.slice(WORKSPACE_REPO_PREFIX.length).replace(/^\/+/, "");
  return suffix ? `/${suffix}` : "/";
}

export function isAgentFsWorkspacePath(relativePath: string) {
  const normalized = normalizeRepoPath(relativePath);
  return normalized === WORKSPACE_REPO_PREFIX || normalized.startsWith(`${WORKSPACE_REPO_PREFIX}/`);
}

export async function getWorkspaceAgentFs() {
  workspaceAgentFsPromise ??= AgentFS.open({
    path: AGENTFS_WORKSPACE_DB_PATH,
  });
  return await workspaceAgentFsPromise;
}

export async function mirrorWorkspaceFileToAgentFs(relativePath: string, content?: string) {
  const normalized = normalizeRepoPath(relativePath);
  const nextContent =
    content ?? (await readFile(path.resolve(REPO_ROOT, normalized), "utf8"));
  const agentFs = await getWorkspaceAgentFs();
  const agentFsPath = toWorkspaceAgentFsPath(normalized);
  await agentFs.fs.writeFile(agentFsPath, nextContent, "utf8");
  const details = await agentFs.fs.stat(agentFsPath);
  return {
    bytes: details.size,
    path: normalized,
    updatedAt: new Date(details.mtime).toISOString(),
  };
}

export async function ensureWorkspaceParentExists(relativePath: string) {
  const absolutePath = path.resolve(REPO_ROOT, normalizeRepoPath(relativePath));
  await mkdir(path.dirname(absolutePath), { recursive: true });
  return absolutePath;
}

export async function readAgentFsMirrorFile(relativePath: string) {
  const agentFs = await getWorkspaceAgentFs();
  return await agentFs.fs.readFile(toWorkspaceAgentFsPath(relativePath), "utf8");
}
