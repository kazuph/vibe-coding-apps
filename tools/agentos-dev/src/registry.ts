import path from "node:path";

import { createHostDirBackend } from "@rivet-dev/agent-os-core";
import common from "@rivet-dev/agent-os-common";
import pi from "@rivet-dev/agent-os-pi";
import { agentOs } from "rivetkit/agent-os";
import { setup } from "rivetkit";
import { sandboxActor } from "rivetkit/sandbox";
import { local } from "rivetkit/sandbox/local";

import {
  AGENTOS_PORT,
  REPO_ROOT,
  SANDBOX_AGENT_LOG,
  SANDBOX_AGENT_PORT,
  TOOL_ROOT,
  VM_REPO_PATH,
  VM_WORKSPACE_PATH,
  WRITABLE_WORKSPACE_ROOT,
  forwardedAgentEnv,
  toPosixPath,
} from "./config.js";
import { discoverProjects } from "./projects.js";
import { gitToolkit, repoToolkit } from "./toolkits.js";

function formatRepoInstructions(): string {
  const writableHost = toPosixPath(path.relative(REPO_ROOT, WRITABLE_WORKSPACE_ROOT));

  return [
    "This VM is attached to the vibe-coding-apps monorepo.",
    `Read the repository from ${VM_REPO_PATH}. Treat it as source-of-truth and read-only unless the user explicitly asks for file changes through host tools or sandbox sessions.`,
    `Use ${VM_WORKSPACE_PATH} for scratch files, generated patches, and temporary outputs. This path persists on the host at ${writableHost}.`,
    "Prefer the host toolkits named repo and git for project discovery, script execution, and repository inspection.",
    "When a project needs a full coding agent such as Codex or Claude Code, hand off to the codingSandbox actor instead of assuming the agent is installed inside agentOS.",
  ].join("\n");
}

const workspaceVm = agentOs({
  options: {
    software: [common, pi],
    moduleAccessCwd: TOOL_ROOT,
    rootFilesystem: {
      type: "overlay",
      mode: "ephemeral",
      disableDefaultBaseLayer: false,
    },
    mounts: [
      {
        path: VM_REPO_PATH,
        driver: createHostDirBackend({
          hostPath: REPO_ROOT,
          readOnly: true,
        }),
        readOnly: true,
      },
      {
        path: VM_WORKSPACE_PATH,
        driver: createHostDirBackend({
          hostPath: WRITABLE_WORKSPACE_ROOT,
          readOnly: false,
        }),
      },
    ],
    additionalInstructions: formatRepoInstructions(),
    toolKits: [repoToolkit, gitToolkit],
  },
  async onSessionEvent(_c, sessionId, event) {
    if (process.env.AGENTOS_DEBUG === "1") {
      console.log(`[workspaceVm] session=${sessionId} method=${event.method}`);
    }
  },
  async onPermissionRequest(_c, sessionId, request) {
    console.warn(
      `[workspaceVm] permission request session=${sessionId} description=${request.description ?? "unknown"}`,
    );
  },
});

const codingSandbox = sandboxActor({
  provider: local({
    port: SANDBOX_AGENT_PORT,
    env: forwardedAgentEnv(),
    log: SANDBOX_AGENT_LOG,
  }),
  options: {
    warningAfterMs: 30_000,
    staleAfterMs: 5 * 60_000,
  },
  async onSessionEvent(_c, sessionId, event) {
    if (process.env.AGENTOS_DEBUG === "1") {
      console.log(`[codingSandbox] session=${sessionId} eventIndex=${event.eventIndex}`);
    }
  },
  async onPermissionRequest(_c, sessionId, request) {
    console.warn(
      `[codingSandbox] permission request session=${sessionId} call=${JSON.stringify(request.toolCall)}`,
    );
  },
});

export const registry = setup({
  managerPort: AGENTOS_PORT,
  managerHost: "127.0.0.1",
  storagePath: path.join(TOOL_ROOT, ".agentos-dev", "rivetkit"),
  noWelcome: true,
  logging: {
    level: process.env.AGENTOS_DEBUG === "1" ? "debug" : "info",
  },
  use: {
    workspaceVm,
    codingSandbox,
  } as any,
});

export async function describeRegistry() {
  const projects = await discoverProjects();

  return {
    endpoint: `http://127.0.0.1:${AGENTOS_PORT}`,
    sandboxAgentPort: SANDBOX_AGENT_PORT,
    repoRoot: REPO_ROOT,
    mounts: {
      repo: VM_REPO_PATH,
      workspace: VM_WORKSPACE_PATH,
    },
    projects,
  };
}
