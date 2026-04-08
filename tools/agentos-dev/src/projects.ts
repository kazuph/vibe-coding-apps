import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { REPO_ROOT } from "./config.js";

const execFileAsync = promisify(execFile);

const SKIP_DIRS = new Set([
  ".git",
  ".worktree",
  ".artifacts",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "docs",
  "tools",
]);

export interface ProjectInfo {
  name: string;
  relativePath: string;
  absolutePath: string;
  scripts: string[];
  packageManager?: string;
}

interface PackageJsonShape {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
}

async function walkForProjects(dir: string, results: string[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const nextDir = path.join(dir, entry.name);
    const packageJson = path.join(nextDir, "package.json");

    try {
      await readFile(packageJson, "utf8");
      results.push(nextDir);
      continue;
    } catch {
      // Keep walking when package.json is not present.
    }

    await walkForProjects(nextDir, results);
  }
}

async function readProjectInfo(projectDir: string): Promise<ProjectInfo> {
  const raw = await readFile(path.join(projectDir, "package.json"), "utf8");
  const parsed = JSON.parse(raw) as PackageJsonShape;
  const relativePath = path.relative(REPO_ROOT, projectDir);

  return {
    name: parsed.name ?? relativePath,
    relativePath,
    absolutePath: projectDir,
    scripts: Object.keys(parsed.scripts ?? {}).sort(),
    packageManager: parsed.packageManager,
  };
}

export async function discoverProjects(): Promise<ProjectInfo[]> {
  const dirs: string[] = [];
  await walkForProjects(REPO_ROOT, dirs);

  const projects = await Promise.all(dirs.map(readProjectInfo));
  return projects.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function resolveProject(selector: string): Promise<ProjectInfo> {
  const projects = await discoverProjects();
  const normalized = selector.trim();

  const matched =
    projects.find((project) => project.relativePath === normalized) ??
    projects.find((project) => project.name === normalized);

  if (!matched) {
    throw new Error(`Unknown project: ${selector}`);
  }

  return matched;
}

export async function readProjectPackageJson(selector: string): Promise<PackageJsonShape> {
  const project = await resolveProject(selector);
  const raw = await readFile(path.join(project.absolutePath, "package.json"), "utf8");
  return JSON.parse(raw) as PackageJsonShape;
}

export interface ScriptRunResult {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runProjectScript(
  selector: string,
  script: string,
  timeoutMs: number,
): Promise<ScriptRunResult> {
  const project = await resolveProject(selector);

  try {
    const { stdout, stderr } = await execFileAsync(
      "pnpm",
      ["--dir", project.absolutePath, "run", script],
      {
        cwd: REPO_ROOT,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 4,
      },
    );

    return {
      command: `pnpm --dir ${project.absolutePath} run ${script}`,
      cwd: project.absolutePath,
      exitCode: 0,
      stdout,
      stderr,
    };
  } catch (error) {
    const typed = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: string | number;
    };

    return {
      command: `pnpm --dir ${project.absolutePath} run ${script}`,
      cwd: project.absolutePath,
      exitCode: typeof typed.code === "number" ? typed.code : 1,
      stdout: typed.stdout ?? "",
      stderr: typed.stderr ?? typed.message,
    };
  }
}
