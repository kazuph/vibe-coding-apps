import path from "node:path";

import { createAgentosClient, agentosEndpoint, waitForManager } from "./client.js";
import { REPO_ROOT, VM_REPO_PATH } from "./config.js";
import { resolveProject } from "./projects.js";

type Surface = "sandbox" | "workspace";

interface OpenOptions {
  project: string;
  surface: Surface;
  agent: string;
}

function parseArgs(argv: string[]): OpenOptions {
  const options: OpenOptions = {
    project: "",
    surface: "workspace",
    agent: "pi",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--project") options.project = argv[index + 1] ?? "";
    if (value === "--surface") options.surface = (argv[index + 1] as Surface | undefined) ?? "sandbox";
    if (value === "--agent") options.agent = argv[index + 1] ?? options.agent;
  }

  if (!options.project) {
    throw new Error("Missing --project <path-or-package-name>");
  }

  return options;
}

function slug(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function openSandboxProject(client: any, project: Awaited<ReturnType<typeof resolveProject>>, agent: string) {
  const actor = client.codingSandbox.getOrCreate([`project-${slug(project.relativePath)}`]);
  const sessionId = `${slug(project.relativePath)}-${slug(agent) || "agent"}`;
  const session = await actor.resumeOrCreateSession({
    id: sessionId,
    agent,
    cwd: project.absolutePath,
  });
  const pwd = await actor.runProcess({
    command: "sh",
    args: ["-lc", "pwd && node -p \"require('./package.json').name\""],
    cwd: project.absolutePath,
    timeoutMs: 15_000,
  });

  return {
    actor: "codingSandbox",
    sessionId: session.id,
    agent,
    cwd: project.absolutePath,
    verification: pwd.stdout.trim().split("\n"),
  };
}

async function openWorkspaceProject(client: any, project: Awaited<ReturnType<typeof resolveProject>>, agent: string) {
  const actor = client.workspaceVm.getOrCreate([`project-${slug(project.relativePath)}`]);
  const vmCwd = path.posix.join(VM_REPO_PATH, project.relativePath.split(path.sep).join(path.posix.sep));
  const session = await actor.createSession(agent, {
    cwd: vmCwd,
  });
  const packageBytes = await actor.readFile(`${vmCwd}/package.json`);
  const sessions = await actor.listSessions();

  return {
    actor: "workspaceVm",
    sessionId: session.sessionId,
    agent,
    cwd: vmCwd,
    packageBytes: packageBytes.byteLength,
    openSessions: sessions.map((entry: { sessionId: string; agentType: string }) => ({
      sessionId: entry.sessionId,
      agentType: entry.agentType,
    })),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const project = await resolveProject(options.project);
  const endpoint = agentosEndpoint();

  await waitForManager(endpoint);

  const client = createAgentosClient();
  let result;
  try {
    result =
      options.surface === "sandbox"
        ? await openSandboxProject(client, project, options.agent)
        : await openWorkspaceProject(client, project, options.agent);
  } catch (error) {
    if (options.surface === "sandbox") {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Sandbox session start failed for agent "${options.agent}". ` +
          `Use the default workspace surface, or pass a sandbox agent that is installed locally.\n${message}`,
      );
    }

    throw error;
  }

  console.log(JSON.stringify({
    endpoint,
    repoRoot: REPO_ROOT,
    project: {
      name: project.name,
      relativePath: project.relativePath,
      absolutePath: project.absolutePath,
    },
    result,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
