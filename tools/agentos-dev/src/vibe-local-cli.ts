import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { createAgentosClient, waitForManager, agentosEndpoint } from "./client.js";

type OpenCodeConfig = {
  provider?: Record<
    string,
    {
      models?: Record<string, { name?: string }>;
      options?: {
        apiKey?: string;
        baseURL?: string;
      };
    }
  >;
};

type BackendSettings = {
  apiKey: string;
  baseUrl: string;
  maxTokens: number;
  model: string;
  systemPrompt: string;
  temperature: number;
};

type SessionSnapshot = Awaited<ReturnType<Awaited<ReturnType<typeof getActor>>["exportSession"]>>;

function summarizeCliToolInput(input: Record<string, unknown>) {
  const entries = Object.entries(input);
  if (entries.length === 0) {
    return "入力なし";
  }
  return entries
    .map(([key, value]) =>
      `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`,
    )
    .join(" ");
}

function formatCliToolEvent(payload: Record<string, unknown>) {
  const name = typeof payload.name === "string" ? payload.name : "unknown";
  const input =
    payload.input && typeof payload.input === "object" && !Array.isArray(payload.input)
      ? (payload.input as Record<string, unknown>)
      : {};
  const status = typeof payload.status === "string" ? payload.status : "running";
  return `[tool:${status}] ${name} ${summarizeCliToolInput(input)}`.trim();
}

async function watchSessionProgress(
  actor: Awaited<ReturnType<typeof getActor>>,
  sessionId: string,
  work: Promise<unknown>,
) {
  let settled = false;
  let lastAssistantText = "";
  const seenToolEvents = new Set<string>();

  void work.finally(() => {
    settled = true;
  });

  while (!settled) {
    const snapshot = (await actor.exportSession(sessionId)) as SessionSnapshot | null;
    if (snapshot) {
      const orderedArtifacts = [...snapshot.artifacts].sort(
        (left, right) =>
          new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
      );
      for (const artifact of orderedArtifacts) {
        if (artifact.kind !== "agent_tool_event") {
          continue;
        }
        if (seenToolEvents.has(artifact.id)) {
          continue;
        }
        seenToolEvents.add(artifact.id);
        console.log(formatCliToolEvent(artifact.payload));
      }

      const partialText = snapshot.task?.status === "running" ? snapshot.task.lastResponse ?? "" : "";
      if (partialText.startsWith(lastAssistantText) && partialText.length > lastAssistantText.length) {
        process.stdout.write(partialText.slice(lastAssistantText.length));
        lastAssistantText = partialText;
      } else if (partialText && partialText !== lastAssistantText) {
        process.stdout.write(`\n${partialText}`);
        lastAssistantText = partialText;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  const finalSnapshot = (await actor.exportSession(sessionId)) as SessionSnapshot | null;
  const finalText = finalSnapshot?.task?.lastResponse ?? "";
  if (finalText.startsWith(lastAssistantText) && finalText.length > lastAssistantText.length) {
    process.stdout.write(finalText.slice(lastAssistantText.length));
    lastAssistantText = finalText;
  } else if (finalText && finalText !== lastAssistantText) {
    process.stdout.write(`\n${finalText}`);
    lastAssistantText = finalText;
  }

  if (lastAssistantText) {
    process.stdout.write("\n");
  }
}

function usage() {
  console.log(`Usage:
  pnpm vibe-local:cli health
  pnpm vibe-local:cli projects
  pnpm vibe-local:cli project-info <project>
  pnpm vibe-local:cli git-status
  pnpm vibe-local:cli diff-stat
  pnpm vibe-local:cli search <query> [maxResults]
  pnpm vibe-local:cli read-file <path>
  pnpm vibe-local:cli read-agentfs-mirror <path>
  pnpm vibe-local:cli write-file <path> < content.txt
  pnpm vibe-local:cli run-script <project> <script> [timeoutMs]
  pnpm vibe-local:cli agent-run <project> <prompt...>
  pnpm vibe-local:cli agent-plan <project> <prompt...>
  pnpm vibe-local:cli agent-yolo <project> <prompt...>
  pnpm vibe-local:cli sessions
  pnpm vibe-local:cli session <sessionId>
  pnpm vibe-local:cli continue-session <sessionId>
  pnpm vibe-local:cli continue-subagent <sessionId> <subAgentId>
  pnpm vibe-local:cli approval <sessionId> <approvalId> <approve|reject> [--continue]
  pnpm vibe-local:cli parallel-run [--mode read-only|act|plan|yolo] <project> <prompt1> -- <prompt2> [-- <prompt3>...]
  pnpm vibe-local:cli agent-rewrite-file <project> <path> <prompt...>`);
}

async function getActor() {
  const endpoint = agentosEndpoint();
  await waitForManager(endpoint);
  const client = createAgentosClient();
  return client.vibeLocal.getOrCreate(["browser-core"]);
}

function loadBackendSettings(): BackendSettings {
  const configPath = path.join(homedir(), ".config", "opencode", "config.json");
  if (!existsSync(configPath)) {
    throw new Error(`OpenCode config was not found at ${configPath}`);
  }

  const payload = JSON.parse(readFileSync(configPath, "utf8")) as OpenCodeConfig;
  const providerEntries = Object.entries(payload.provider ?? {});
  const preferred =
    providerEntries.find(([key]) => key === "qwen-local") ??
    providerEntries.find(([, value]) => Object.keys(value.models ?? {}).length > 0) ??
    null;

  if (!preferred) {
    throw new Error("No OpenCode provider with models was found.");
  }

  const [providerName, providerConfig] = preferred;
  const firstModelEntry = Object.entries(providerConfig.models ?? {})[0];
  if (!firstModelEntry) {
    throw new Error(`The selected OpenCode provider ${providerName} has no models.`);
  }

  return {
    apiKey: providerConfig.options?.apiKey ?? "",
    baseUrl: providerConfig.options?.baseURL ?? "",
    model: firstModelEntry[0],
    maxTokens: 4000,
    systemPrompt: "You are the browser core of vibe-local. Be concise, careful, and helpful.",
    temperature: 0.2,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [command, ...args] = normalizedArgv;
  if (!command || command === "help" || command === "--help") {
    usage();
    return;
  }

  const actor = await getActor();

  switch (command) {
    case "health": {
      const payload = await actor.hydrate();
      console.log(JSON.stringify({ ok: true, sessionCount: payload.sessions.length }, null, 2));
      return;
    }
    case "projects": {
      console.log(JSON.stringify(await actor.listProjects(), null, 2));
      return;
    }
    case "project-info": {
      const project = args[0];
      if (!project) throw new Error("Missing <project>");
      console.log(JSON.stringify(await actor.projectInfo(project), null, 2));
      return;
    }
    case "git-status": {
      console.log(JSON.stringify(await actor.gitStatus(), null, 2));
      return;
    }
    case "sessions": {
      const payload = await actor.hydrate();
      console.log(
        JSON.stringify(
          payload.sessions.map((entry: any) => ({
            id: entry.session.id,
            title: entry.session.title,
            mode: entry.session.mode,
            model: entry.session.model,
            approvals: (entry.approvals ?? [])
              .filter((approval: any) => approval.status === "pending")
              .map((approval: any) => ({
                id: approval.id,
                toolName: approval.toolName,
                subAgentId: approval.subAgentId ?? null,
              })),
            task: entry.task
              ? {
                  goal: entry.task.goal,
                  status: entry.task.status,
                  continueCount: entry.task.continueCount,
                }
              : null,
          })),
          null,
          2,
        ),
      );
      return;
    }
    case "session": {
      const sessionId = args[0];
      if (!sessionId) throw new Error("Missing <sessionId>");
      console.log(JSON.stringify(await actor.exportSession(sessionId), null, 2));
      return;
    }
    case "diff-stat": {
      console.log(JSON.stringify(await actor.gitDiffStat(), null, 2));
      return;
    }
    case "search": {
      const query = args[0];
      if (!query) throw new Error("Missing <query>");
      const maxResults = Number.parseInt(args[1] ?? "20", 10);
      console.log(JSON.stringify(await actor.searchCode(query, maxResults), null, 2));
      return;
    }
    case "read-file": {
      const filePath = args[0];
      if (!filePath) throw new Error("Missing <path>");
      console.log(JSON.stringify(await actor.readFile(filePath), null, 2));
      return;
    }
    case "read-agentfs-mirror": {
      const filePath = args[0];
      if (!filePath) throw new Error("Missing <path>");
      console.log(JSON.stringify(await actor.readAgentFsMirror(filePath), null, 2));
      return;
    }
    case "write-file": {
      const filePath = args[0];
      if (!filePath) throw new Error("Missing <path>");
      const content = readFileSync(0, "utf8");
      console.log(JSON.stringify(await actor.writeFile(filePath, content), null, 2));
      return;
    }
    case "run-script": {
      const project = args[0];
      const script = args[1];
      if (!project || !script) throw new Error("Missing <project> or <script>");
      const timeoutMs = Number.parseInt(args[2] ?? "120000", 10);
      console.log(JSON.stringify(await actor.runScript(project, script, timeoutMs), null, 2));
      return;
    }
    case "agent-run": {
      const project = args[0];
      const prompt = args.slice(1).join(" ").trim();
      if (!project || !prompt) throw new Error("Missing <project> or <prompt...>");
      const settings = loadBackendSettings();
      const session = await actor.createSession(`CLI ${project}`);
      await actor.setSessionConfig(session.session.id, settings.model, "act");
      const runPromise = actor.runAgentTurn(session.session.id, prompt, settings, project);
      await watchSessionProgress(actor, session.session.id, runPromise);
      console.log(
        JSON.stringify(
          await runPromise,
          null,
          2,
        ),
      );
      return;
    }
    case "continue-session": {
      const sessionId = args[0];
      if (!sessionId) throw new Error("Missing <sessionId>");
      const settings = loadBackendSettings();
      const runPromise = actor.continueAgentTask(sessionId, settings);
      await watchSessionProgress(actor, sessionId, runPromise);
      console.log(
        JSON.stringify(
          await runPromise,
          null,
          2,
        ),
      );
      return;
    }
    case "continue-subagent": {
      const sessionId = args[0];
      const subAgentId = args[1];
      if (!sessionId || !subAgentId) throw new Error("Missing <sessionId> or <subAgentId>");
      const settings = loadBackendSettings();
      console.log(
        JSON.stringify(
          await actor.continueSubAgentTask(sessionId, subAgentId, settings),
          null,
          2,
        ),
      );
      return;
    }
    case "agent-plan": {
      const project = args[0];
      const prompt = args.slice(1).join(" ").trim();
      if (!project || !prompt) throw new Error("Missing <project> or <prompt...>");
      const settings = loadBackendSettings();
      const session = await actor.createSession(`CLI ${project}`);
      await actor.setSessionConfig(session.session.id, settings.model, "plan");
      const runPromise = actor.runAgentTurn(session.session.id, prompt, settings, project);
      await watchSessionProgress(actor, session.session.id, runPromise);
      console.log(
        JSON.stringify(
          await runPromise,
          null,
          2,
        ),
      );
      return;
    }
    case "agent-yolo": {
      const project = args[0];
      const prompt = args.slice(1).join(" ").trim();
      if (!project || !prompt) throw new Error("Missing <project> or <prompt...>");
      const settings = loadBackendSettings();
      const session = await actor.createSession(`CLI ${project}`);
      await actor.setSessionConfig(session.session.id, settings.model, "yolo");
      const runPromise = actor.runAgentTurn(session.session.id, prompt, settings, project);
      await watchSessionProgress(actor, session.session.id, runPromise);
      console.log(
        JSON.stringify(
          await runPromise,
          null,
          2,
        ),
      );
      return;
    }
    case "approval": {
      const sessionId = args[0];
      const approvalId = args[1];
      const decision = args[2];
      const continueAfter = args.includes("--continue");
      if (!sessionId || !approvalId || (decision !== "approve" && decision !== "reject")) {
        throw new Error("Usage: approval <sessionId> <approvalId> <approve|reject> [--continue]");
      }
      const settings = continueAfter ? loadBackendSettings() : undefined;
      const actionPromise = actor.approveToolCall(sessionId, approvalId, decision, continueAfter, settings);
      if (continueAfter) {
        await watchSessionProgress(actor, sessionId, actionPromise);
      }
      console.log(
        JSON.stringify(await actionPromise, null, 2),
      );
      return;
    }
    case "parallel-run": {
      const executionModeIndex = args.findIndex((token) => token === "--mode");
      let executionMode: "act" | "plan" | "read-only" | "yolo" = "read-only";
      let normalizedArgs = [...args];
      if (executionModeIndex >= 0) {
        const candidate = normalizedArgs[executionModeIndex + 1];
        if (candidate !== "act" && candidate !== "plan" && candidate !== "read-only" && candidate !== "yolo") {
          throw new Error("parallel-run --mode must be one of read-only, act, plan, or yolo");
        }
        executionMode = candidate;
        normalizedArgs = normalizedArgs.filter((_, index) => index !== executionModeIndex && index !== executionModeIndex + 1);
      }
      const project = normalizedArgs[0];
      const rawPrompts = normalizedArgs.slice(1);
      const chunks: string[] = [];
      let current: string[] = [];
      for (const token of rawPrompts) {
        if (token === "--") {
          if (current.length > 0) {
            chunks.push(current.join(" ").trim());
            current = [];
          }
          continue;
        }
        current.push(token);
      }
      if (current.length > 0) {
        chunks.push(current.join(" ").trim());
      }
      const prompts = chunks.filter(Boolean);
      if (!project || prompts.length === 0) {
        throw new Error("Usage: parallel-run [--mode read-only|act|plan|yolo] <project> <prompt1> -- <prompt2> [-- <prompt3>...]");
      }
      const settings = loadBackendSettings();
      const session = await actor.createSession(`CLI parallel ${project}`);
      await actor.setSessionConfig(session.session.id, settings.model, "act");
      console.log(
        JSON.stringify(
          await actor.runParallelAgentTasks(session.session.id, prompts, settings, project, executionMode),
          null,
          2,
        ),
      );
      return;
    }
    case "agent-rewrite-file": {
      const project = args[0];
      const filePath = args[1];
      const prompt = args.slice(2).join(" ").trim();
      if (!project || !filePath || !prompt) {
        throw new Error("Missing <project>, <path>, or <prompt...>");
      }
      const settings = loadBackendSettings();
      const session = await actor.createSession(`CLI ${project}`);
      await actor.setSessionConfig(session.session.id, settings.model, "act");
      console.log(
        JSON.stringify(
          await actor.rewriteFileWithAgent(session.session.id, filePath, prompt, settings, project),
          null,
          2,
        ),
      );
      return;
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
