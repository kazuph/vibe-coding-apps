import { discoverProjects } from "./projects.js";

async function main() {
  const projects = await discoverProjects();

  console.log(`Discovered ${projects.length} projects`);
  for (const project of projects) {
    const scripts = project.scripts.length > 0 ? project.scripts.join(", ") : "(no scripts)";
    console.log(`- ${project.relativePath} | ${project.name} | ${scripts}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
