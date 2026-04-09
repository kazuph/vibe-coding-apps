import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import dns from "node:dns/promises";
import os from "node:os";
import path from "node:path";

import { PI_AGENT_ROOT } from "./config.js";

interface OpenCodeConfig {
  provider?: Record<
    string,
    {
      name?: string;
      npm?: string;
      options?: {
        baseURL?: string;
      };
      models?: Record<
        string,
        {
          name?: string;
          limit?: {
            context?: number;
            output?: number;
          };
        }
      >;
    }
  >;
}

interface PiModel {
  id: string;
  name?: string;
  reasoning: boolean;
  input: string[];
  contextWindow: number;
  maxTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

interface PiProvider {
  baseUrl: string;
  api: "openai-completions";
  apiKey: string;
  compat: {
    supportsDeveloperRole: boolean;
    supportsReasoningEffort: boolean;
    maxTokensField: "max_tokens";
  };
  models: PiModel[];
}

const MIN_PI_CONTEXT_WINDOW = 8192;

function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function listLmStudioModels(baseUrl: string): Promise<string[]> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/models`);
    if (!response.ok) return [];
    const data = (await response.json()) as {
      data?: Array<{ id?: string }>;
    };
    return (data.data ?? []).map((entry) => entry.id).filter((entry): entry is string => Boolean(entry));
  } catch {
    return [];
  }
}

async function normalizeProviderBaseUrl(baseUrl: string): Promise<string> {
  try {
    const url = new URL(baseUrl);
    if (!/^100\./.test(url.hostname)) return baseUrl;

    const names = await dns.reverse(url.hostname);
    const magicDnsHost = names.find((name) => name.endsWith(".ts.net"));
    if (!magicDnsHost) return baseUrl;

    url.hostname = magicDnsHost.replace(/\.$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return baseUrl;
  }
}

async function toPiProvider(
  providerId: string,
  provider: NonNullable<OpenCodeConfig["provider"]>[string],
): Promise<PiProvider | null> {
  const baseUrl = provider.options?.baseURL;
  if (!baseUrl) return null;
  if (provider.npm !== "@ai-sdk/openai-compatible") return null;

  const normalizedBaseUrl = await normalizeProviderBaseUrl(baseUrl);

  const models = Object.entries(provider.models ?? {}).map(([modelId, modelConfig]) => ({
    id: modelId,
    name: modelConfig.name ?? `${provider.name ?? providerId}/${modelId}`,
    reasoning: false,
    input: ["text"],
    contextWindow: modelConfig.limit?.context ?? 4096,
    maxTokens: modelConfig.limit?.output ?? 2048,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
  }));

  if (models.length === 0) return null;

  return {
    baseUrl: normalizedBaseUrl,
    api: "openai-completions",
    apiKey: providerId,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      maxTokensField: "max_tokens",
    },
    models,
  };
}

async function main() {
  const opencodeConfigPath = path.join(os.homedir(), ".config", "opencode", "config.json");
  const opencodeConfig = readJsonFile<OpenCodeConfig>(opencodeConfigPath);

  if (!opencodeConfig?.provider) {
    throw new Error(`OpenCode config not found: ${opencodeConfigPath}`);
  }

  const providers = Object.fromEntries(
    (
      await Promise.all(
        Object.entries(opencodeConfig.provider).map(async ([providerId, provider]) => [
          providerId,
          await toPiProvider(providerId, provider),
        ]),
      )
    ).filter((entry): entry is [string, PiProvider] => Boolean(entry[1])),
  );

  if (Object.keys(providers).length === 0) {
    throw new Error("No OpenAI-compatible providers found in OpenCode config.");
  }

  const lmStudioProvider = providers.lmstudio;
  const loadedLmStudioModels = lmStudioProvider
    ? await listLmStudioModels(lmStudioProvider.baseUrl)
    : [];

  const lmStudioDefault = lmStudioProvider
    ? lmStudioProvider.models.find((model) => loadedLmStudioModels.includes(model.id)) ??
      lmStudioProvider.models[0]
    : undefined;

  const providerEntries = Object.entries(providers);
  const roomyDefault = providerEntries
    .flatMap(([providerId, provider]) =>
      provider.models.map((model) => ({
        providerId,
        model,
      })),
    )
    .find(({ model }) => model.contextWindow >= MIN_PI_CONTEXT_WINDOW);

  const firstProviderId = Object.keys(providers)[0];
  const firstProvider = providers[firstProviderId];
  const defaultProvider =
    roomyDefault?.providerId ?? (lmStudioDefault ? "lmstudio" : firstProviderId);
  const defaultModel =
    roomyDefault?.model.id ?? lmStudioDefault?.id ?? firstProvider.models[0]?.id;

  if (!defaultModel) {
    throw new Error("No default Pi model could be resolved.");
  }

  mkdirSync(PI_AGENT_ROOT, { recursive: true });

  writeFileSync(
    path.join(PI_AGENT_ROOT, "models.json"),
    JSON.stringify({ providers }, null, 2) + "\n",
    "utf8",
  );

  writeFileSync(
    path.join(PI_AGENT_ROOT, "settings.json"),
    JSON.stringify(
      {
        defaultProvider,
        defaultModel,
        defaultThinkingLevel: "off",
        quietStartup: true,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  console.log("Pi config synced.");
  console.log(`- source: ${opencodeConfigPath}`);
  console.log(`- target: ${PI_AGENT_ROOT}`);
  console.log(`- providers: ${Object.keys(providers).join(", ")}`);
  console.log(`- default model: ${defaultProvider}/${defaultModel}`);
  if (loadedLmStudioModels.length > 0) {
    console.log(`- LM Studio loaded models: ${loadedLmStudioModels.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
