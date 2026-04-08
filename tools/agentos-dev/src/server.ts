import { AGENTOS_PORT, SANDBOX_AGENT_PORT } from "./config.js";
import { describeRegistry, registry } from "./registry.js";

async function main() {
  const summary = await describeRegistry();

  registry.start();

  console.log("");
  console.log("Hybrid agent runtime is up.");
  console.log(`Rivet manager: http://127.0.0.1:${AGENTOS_PORT}`);
  console.log(`Sandbox Agent provider port: ${SANDBOX_AGENT_PORT}`);
  console.log(`Repo mount: ${summary.mounts.repo} -> ${summary.repoRoot}`);
  console.log(`Writable workspace mount: ${summary.mounts.workspace}`);
  console.log(`Discovered projects: ${summary.projects.length}`);

  for (const project of summary.projects) {
    console.log(`- ${project.relativePath} (${project.name})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
