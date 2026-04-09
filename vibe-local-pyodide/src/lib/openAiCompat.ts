import type { BackendSettings, ChatMessage, ChatStreamChunk } from "../types";

type OpenCodeBackendConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/$/, "");
}

export async function fetchModels(settings: BackendSettings) {
  const url = new URL("/__vibe_local/models", window.location.origin);
  url.searchParams.set("baseUrl", normalizeBaseUrl(settings.baseUrl));

  const response = await fetch(url, {
    headers: settings.apiKey ? { "x-vibe-api-key": settings.apiKey } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Model list fetch failed: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ id?: string }>;
    models?: Array<{ name?: string; model?: string }>;
  };

  const openAiModels = (data.data ?? []).map((entry) => entry.id).filter(Boolean) as string[];
  if (openAiModels.length > 0) return openAiModels;

  return (data.models ?? [])
    .map((entry) => entry.model ?? entry.name)
    .filter((entry): entry is string => Boolean(entry));
}

export async function fetchOpenCodeDefaults() {
  const response = await fetch("/__vibe_local/opencode-config");
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`OpenCode config fetch failed: ${await response.text()}`);
  }

  const data = (await response.json()) as Partial<OpenCodeBackendConfig>;
  if (!data.baseUrl?.trim() || !data.model?.trim()) {
    return null;
  }

  return {
    apiKey: data.apiKey?.trim() ?? "",
    baseUrl: data.baseUrl.trim(),
    model: data.model.trim(),
  } satisfies OpenCodeBackendConfig;
}

export async function* streamChatCompletion(
  settings: BackendSettings,
  messages: ChatMessage[],
): AsyncGenerator<ChatStreamChunk, string, void> {
  const response = await fetch("/__vibe_local/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      apiKey: settings.apiKey.trim(),
      baseUrl: normalizeBaseUrl(settings.baseUrl),
      maxTokens: settings.maxTokens,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      model: settings.model,
      systemPrompt: settings.systemPrompt,
      temperature: settings.temperature,
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Chat request failed: ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const lines = frame
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("data: "));

      for (const line of lines) {
        const data = line.slice(6);
        if (data === "[DONE]") {
          yield { done: true, textDelta: "" };
          return fullText;
        }

        const payload = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string };
            message?: { content?: string };
          }>;
        };
        const textDelta =
          payload.choices?.[0]?.delta?.content ??
          payload.choices?.[0]?.message?.content ??
          "";

        if (textDelta) {
          fullText += textDelta;
          yield { done: false, textDelta };
        }
      }
    }
  }

  return fullText;
}
