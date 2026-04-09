import path from "node:path";

import { createAgentosClient, agentosEndpoint, waitForManager } from "./client.js";
import { VM_REPO_PATH } from "./config.js";
import { resolveProject } from "./projects.js";

function parseArgs(argv: string[]) {
  let project = "";

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--project") project = argv[index + 1] ?? "";
  }

  if (!project) {
    throw new Error("Missing --project <path-or-package-name>");
  }

  return { project };
}

async function main() {
  const { project: projectName } = parseArgs(process.argv.slice(2));
  const project = await resolveProject(projectName);
  const endpoint = agentosEndpoint();

  await waitForManager(endpoint);

  const client = createAgentosClient();
  const actor = client.workspaceVm.getOrCreate([`verify-${project.relativePath}`]);
  const vmCwd = path.posix.join(VM_REPO_PATH, project.relativePath.split(path.sep).join(path.posix.sep));
  const session = await actor.createSession("pi", { cwd: vmCwd });
  const prompt = "カレントディレクトリを1行だけで答えて";
  const result = await actor.sendPrompt(session.sessionId, prompt);
  const events = await actor.getEvents(session.sessionId, { limit: 200 });
  const eventText = events
    .map((event: any) => event?.params?.update)
    .filter((update: any) => update?.sessionUpdate === "agent_message_chunk")
    .map((update: any) => update?.content?.text ?? "")
    .join("");
  const text = result.text || eventText;

  console.log(
    JSON.stringify(
      {
        endpoint,
        project: project.relativePath,
        sessionId: session.sessionId,
        prompt,
        text,
        responseStopReason: result.response?.result?.stopReason ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
