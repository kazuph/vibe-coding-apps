import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import react from "@vitejs/plugin-react";
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
