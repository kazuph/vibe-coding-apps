#!/usr/bin/env node
import { spawn } from 'node:child_process';

const procs = [];

function run(name, cmd, args) {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: true });
  procs.push(p);
  p.on('exit', (code, signal) => {
    if (code !== 0) {
      console.error(`[${name}] exited with code ${code}${signal ? ` (signal ${signal})` : ''}`);
      // If one dies, bring down the rest
      shutdown(1);
    }
  });
}

function shutdown(code = 0) {
  for (const p of procs) {
    if (!p.killed) {
      try { p.kill('SIGINT'); } catch {}
    }
  }
  // Small delay to let children terminate
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('worker', 'npm', ['run', 'dev:worker']);
run('vite', 'npm', ['run', 'dev']);

