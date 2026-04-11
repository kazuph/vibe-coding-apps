import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import react from "@vitejs/plugin-react";
import { createClient } from "rivetkit/client";
import type { Connect } from "vite";
import { defineConfig } from "vite";

type ChatProxyPayload = {
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number;
  messages?: Array<{ role: string; content: string }>;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
};

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

type AgentosPayload = {
  settings?: {
    apiKey: string;
    baseUrl: string;
    maxTokens: number;
    model: string;
    systemPrompt: string;
    temperature: number;
  };
  maxResults?: number;
  path?: string;
  project?: string;
  prompt?: string;
  sessionId?: string;
  selectedProject?: string;
  role?: "assistant" | "system" | "user";
  title?: string;
  content?: string;
  model?: string;
  mode?: "plan" | "act" | "yolo";
  script?: string;
  timeoutMs?: number;
  decision?: "approve" | "reject";
  approvalId?: string;
  prompts?: string[];
  continueAfter?: boolean;
  executionMode?: "act" | "plan" | "read-only" | "yolo";
};

function json(
  res: Parameters<Connect.NextHandleFunction>[1],
  status: number,
  body: unknown,
) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: Connect.IncomingMessage) {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

function createAgentosClient() {
  const endpoint = process.env.AGENTOS_ENDPOINT ?? "http://127.0.0.1:6420";
  return createClient(endpoint) as any;
}

async function callVibeLocalAction<T>(action: string, ...args: unknown[]) {
  const client = createAgentosClient();
  const handle = client.vibeLocal.getOrCreate(["browser-core"]);
  return (await handle[action](...args)) as T;
}

function createOpenAiProxyMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/__vibe_local/opencode-config") {
      try {
        const configPath = join(homedir(), ".config", "opencode", "config.json");
        if (!existsSync(configPath)) {
          json(res, 404, { error: "OpenCode config was not found." });
          return;
        }

        const payload = JSON.parse(readFileSync(configPath, "utf-8")) as OpenCodeConfig;
        const providerEntries = Object.entries(payload.provider ?? {});
        const preferred =
          providerEntries.find(([key]) => key === "qwen-local") ??
          providerEntries.find(([, value]) => Object.keys(value.models ?? {}).length > 0) ??
          null;

        if (!preferred) {
          json(res, 404, { error: "No OpenCode provider with models was found." });
          return;
        }

        const [providerName, providerConfig] = preferred;
        const firstModelEntry = Object.entries(providerConfig.models ?? {})[0];
        if (!firstModelEntry) {
          json(res, 404, { error: "The selected OpenCode provider has no models." });
          return;
        }

        json(res, 200, {
          providerName,
          apiKey: providerConfig.options?.apiKey ?? "",
          baseUrl: providerConfig.options?.baseURL ?? "",
          model: firstModelEntry[0],
          modelName: firstModelEntry[1]?.name ?? firstModelEntry[0],
        });
      } catch (error) {
        json(res, 500, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/__vibe_local/agentos/health") {
      try {
        const payload = await callVibeLocalAction<{ ok: boolean; sessionCount: number }>("health");
        json(res, 200, payload);
      } catch (error) {
        json(res, 503, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/__vibe_local/agentos/hydrate") {
      try {
        const payload = await callVibeLocalAction<{ sessions: unknown[] }>("hydrate");
        json(res, 200, payload);
      } catch (error) {
        json(res, 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/__vibe_local/coding/projects") {
      try {
        const payload = await callVibeLocalAction("listProjects");
        json(res, 200, payload);
      } catch (error) {
        json(res, 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/__vibe_local/coding/project") {
      try {
        const project = url.searchParams.get("project");
        if (!project) {
          json(res, 400, { error: "Missing project query parameter." });
          return;
        }
        const payload = await callVibeLocalAction("projectInfo", project);
        json(res, 200, payload);
      } catch (error) {
        json(res, 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/__vibe_local/coding/git/status") {
      try {
        const payload = await callVibeLocalAction("gitStatus");
        json(res, 200, payload);
      } catch (error) {
        json(res, 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/__vibe_local/coding/git/diff") {
      try {
        const payload = await callVibeLocalAction("gitDiffStat");
        json(res, 200, payload);
      } catch (error) {
        json(res, 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/__vibe_local/coding/search") {
      try {
        const query = url.searchParams.get("query");
        if (!query?.trim()) {
          json(res, 400, { error: "Missing query parameter." });
          return;
        }
        const maxResults = Number.parseInt(url.searchParams.get("maxResults") ?? "20", 10);
        const payload = await callVibeLocalAction("searchCode", query, maxResults);
        json(res, 200, payload);
      } catch (error) {
        json(res, 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/__vibe_local/coding/file") {
      try {
        const filePath = url.searchParams.get("path");
        if (!filePath?.trim()) {
          json(res, 400, { error: "Missing path query parameter." });
          return;
        }
        const payload = await callVibeLocalAction("readFile", filePath);
        json(res, 200, payload);
      } catch (error) {
        json(res, 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/__vibe_local/agentos/export") {
      try {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          json(res, 400, { error: "Missing sessionId query parameter." });
          return;
        }
        const payload = await callVibeLocalAction("exportSession", sessionId);
        json(res, 200, payload);
      } catch (error) {
        json(res, 503, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (
      req.method === "POST" &&
      (url.pathname.startsWith("/__vibe_local/agentos/") ||
        url.pathname.startsWith("/__vibe_local/coding/"))
    ) {
      const raw = await readRequestBody(req);
      const payload = (raw ? JSON.parse(raw) : {}) as AgentosPayload;

      try {
        if (url.pathname === "/__vibe_local/agentos/session") {
          json(res, 200, await callVibeLocalAction("createSession", payload.title ?? ""));
          return;
        }

        if (url.pathname === "/__vibe_local/agentos/session/config") {
          if (!payload.sessionId || !payload.model || !payload.mode) {
            json(res, 400, { error: "sessionId, model, and mode are required." });
            return;
          }
          json(
            res,
            200,
            await callVibeLocalAction(
              "setSessionConfig",
              payload.sessionId,
              payload.model,
              payload.mode,
            ),
          );
          return;
        }

        if (url.pathname === "/__vibe_local/agentos/session/message") {
          if (!payload.sessionId || !payload.role || payload.content === undefined) {
            json(res, 400, { error: "sessionId, role, and content are required." });
            return;
          }
          json(
            res,
            200,
            await callVibeLocalAction(
              "appendMessage",
              payload.sessionId,
              payload.role,
              payload.content,
            ),
          );
          return;
        }

        if (url.pathname === "/__vibe_local/agentos/session/compact") {
          if (!payload.sessionId) {
            json(res, 400, { error: "sessionId is required." });
            return;
          }
          json(res, 200, await callVibeLocalAction("compactSession", payload.sessionId));
          return;
        }

        if (url.pathname === "/__vibe_local/agentos/session/agent-run") {
          if (!payload.sessionId || !payload.prompt || !payload.settings) {
            json(res, 400, { error: "sessionId, prompt, and settings are required." });
            return;
          }
          json(
            res,
            200,
            await callVibeLocalAction(
              "runAgentTurn",
              payload.sessionId,
              payload.prompt,
              payload.settings,
              payload.selectedProject ?? "",
            ),
          );
          return;
        }

        if (url.pathname === "/__vibe_local/agentos/session/continue") {
          if (!payload.sessionId) {
            json(res, 400, { error: "sessionId is required." });
            return;
          }
          json(
            res,
            200,
            await callVibeLocalAction(
              "continueAgentTask",
              payload.sessionId,
              payload.settings,
            ),
          );
          return;
        }

        if (url.pathname === "/__vibe_local/agentos/session/approval") {
          if (!payload.sessionId || !payload.approvalId || !payload.decision) {
            json(res, 400, { error: "sessionId, approvalId, and decision are required." });
            return;
          }
          json(
            res,
            200,
            await callVibeLocalAction(
              "approveToolCall",
              payload.sessionId,
              payload.approvalId,
              payload.decision,
              Boolean(payload.continueAfter),
              payload.settings,
            ),
          );
          return;
        }

        if (url.pathname === "/__vibe_local/agentos/session/sub-agents") {
          if (!payload.sessionId || !payload.settings || !payload.prompts?.length) {
            json(res, 400, { error: "sessionId, settings, and prompts are required." });
            return;
          }
          json(
            res,
            200,
            await callVibeLocalAction(
              "runParallelAgentTasks",
              payload.sessionId,
              payload.prompts,
              payload.settings,
              payload.selectedProject ?? "",
              payload.executionMode ?? "read-only",
            ),
          );
          return;
        }

        if (url.pathname === "/__vibe_local/agentos/session/sub-agent/continue") {
          if (!payload.sessionId || !payload.subAgentId || !payload.settings) {
            json(res, 400, { error: "sessionId, subAgentId, and settings are required." });
            return;
          }
          json(
            res,
            200,
            await callVibeLocalAction(
              "continueSubAgentTask",
              payload.sessionId,
              payload.subAgentId,
              payload.settings,
            ),
          );
          return;
        }

        if (url.pathname === "/__vibe_local/coding/run-script") {
          if (!payload.project || !payload.script) {
            json(res, 400, { error: "project and script are required." });
            return;
          }
          json(
            res,
            200,
            await callVibeLocalAction(
              "runScript",
              payload.project,
              payload.script,
              payload.timeoutMs ?? 120_000,
            ),
          );
          return;
        }

        if (url.pathname === "/__vibe_local/coding/file") {
          const filePath = payload.path ?? "";
          if (!filePath.trim() || payload.content === undefined) {
            json(res, 400, { error: "path and content are required." });
            return;
          }
          json(res, 200, await callVibeLocalAction("writeFile", filePath, payload.content));
          return;
        }
      } catch (error) {
        json(res, 503, {
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
    }

    if (req.method === "GET" && url.pathname === "/__vibe_local/models") {
      const baseUrl = url.searchParams.get("baseUrl");
      const apiKey = req.headers["x-vibe-api-key"];
      if (!baseUrl) {
        json(res, 400, { error: "Missing baseUrl query parameter." });
        return;
      }

      try {
        const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
        });
        const body = await upstream.text();
        res.statusCode = upstream.status;
        res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
        res.end(body);
      } catch (error) {
        json(res, 502, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/__vibe_local/chat") {
      const raw = await readRequestBody(req);
      const payload = JSON.parse(raw) as ChatProxyPayload;
      if (!payload.baseUrl || !payload.model || !payload.messages?.length) {
        json(res, 400, { error: "baseUrl, model, and messages are required." });
        return;
      }

      const upstreamMessages = payload.systemPrompt?.trim()
        ? [{ role: "system", content: payload.systemPrompt.trim() }, ...payload.messages]
        : payload.messages;

      try {
        const upstream = await fetch(`${payload.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(payload.apiKey ? { Authorization: `Bearer ${payload.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: payload.model,
            messages: upstreamMessages,
            temperature: payload.temperature,
            max_tokens: payload.maxTokens,
            stream: true,
          }),
        });

        res.statusCode = upstream.status;
        upstream.headers.forEach((value, key) => {
          if (key.toLowerCase() === "content-encoding") return;
          res.setHeader(key, value);
        });

        if (!upstream.body) {
          const body = await upstream.text();
          res.end(body);
          return;
        }

        Readable.fromWeb(upstream.body as never).pipe(res);
      } catch (error) {
        json(res, 502, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    next();
  };
}

const openAiProxy = createOpenAiProxyMiddleware();

export default defineConfig({
  plugins: [
    react(),
    {
      name: "vibe-local-openai-proxy",
      configureServer(server) {
        server.middlewares.use(openAiProxy);
      },
      configurePreviewServer(server) {
        server.middlewares.use(openAiProxy);
      },
    },
  ],
});
