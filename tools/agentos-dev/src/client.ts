import { createClient } from "rivetkit/client";

import { AGENTOS_PORT } from "./config.js";

export function agentosEndpoint() {
  return process.env.AGENTOS_ENDPOINT ?? `http://127.0.0.1:${AGENTOS_PORT}`;
}

export async function waitForManager(endpoint: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(endpoint);
      if (response.ok || response.status === 404) return;
    } catch {
      // Keep polling until the manager is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for Rivet manager at ${endpoint}`);
}

export function createAgentosClient() {
  return createClient(agentosEndpoint()) as any;
}
