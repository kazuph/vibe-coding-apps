import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

import { REPO_ROOT, TOOL_ROOT, VM_REPO_PATH } from "./config.js";
import { createAgentosClient, waitForManager } from "./client.js";

async function getFreePort(preferred: number): Promise<number> {
  const tryPort = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.on("error", reject);
      server.listen(port, "127.0.0.1", () => {
        const address = server.address();
        const resolved =
          typeof address === "object" && address ? address.port : preferred;
        server.close(() => resolve(resolved));
      });
    });

  try {
    return await tryPort(preferred);
  } catch {
    return tryPort(0);
  }
}

async function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const managerPort = await getFreePort(6420);
  const sandboxPort = await getFreePort(2468);
  const endpoint = `http://127.0.0.1:${managerPort}`;
  const tsxPath = path.join(TOOL_ROOT, "node_modules", ".bin", "tsx");
  const smokeKey = `smoke-${Date.now()}`;

  const child = spawn(tsxPath, ["src/server.ts"], {
    cwd: TOOL_ROOT,
    env: {
      ...process.env,
      AGENTOS_PORT: String(managerPort),
      SANDBOX_AGENT_PORT: String(sandboxPort),
      SANDBOX_AGENT_LOG: "silent",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let logs = "";
  child.stdout.on("data", (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    logs += chunk.toString();
  });

  let failure: unknown;

  try {
    await waitForManager(endpoint);

    process.env.AGENTOS_ENDPOINT = endpoint;
    const client = createAgentosClient();

    const workspace = client.workspaceVm.getOrCreate([smokeKey]);
    const repoEntries = (await workspace.readdir(VM_REPO_PATH)) as string[];
    const rootPackage = await workspace.readFile(`${VM_REPO_PATH}/package.json`);
    const availableAgentTypes = (await workspace.listAgents()) as Array<{ id: string }>;

    const sandbox = client.codingSandbox.getOrCreate([smokeKey]);
    const health = (await sandbox.getHealth()) as { status: string };
    const sandboxAgents = (await sandbox.listAgents()) as {
      agents: Array<{ id: string }>;
    };
    const processResult = (await sandbox.runProcess({
      command: "pwd",
      cwd: REPO_ROOT,
      timeoutMs: 15_000,
    })) as { stdout: string };

    console.log("Smoke test passed.");
    console.log(`- manager endpoint: ${endpoint}`);
    console.log(`- repo entries visible in agentOS: ${repoEntries.length}`);
    console.log(`- root package bytes visible in agentOS: ${rootPackage.byteLength}`);
    console.log(
      `- agentOS installed agents: ${availableAgentTypes.map((entry) => entry.id).join(", ")}`,
    );
    console.log(`- sandbox health: ${health.status}`);
    console.log(
      `- sandbox agents: ${sandboxAgents.agents.map((agent) => agent.id).join(", ")}`,
    );
    console.log(`- runProcess pwd: ${processResult.stdout.trim()}`);
  } catch (error) {
    failure = error;
  } finally {
    child.kill("SIGINT");
    await waitForExit(child, 2_000);
    if (child.exitCode === null) {
      child.kill("SIGKILL");
      await waitForExit(child, 2_000);
    }
    if (logs.trim()) {
      console.log("");
      console.log("server logs");
      console.log(logs.trim());
    }

    if (failure) {
      console.error(failure);
      process.exit(1);
    }

    process.exit(0);
  }
}

void main();
