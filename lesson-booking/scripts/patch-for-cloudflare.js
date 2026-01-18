#!/usr/bin/env node
// Cloudflare Workers向けパッチスクリプト
// MoonBit生成コードのグローバルスコープ制限を回避する
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node patch-for-cloudflare.js <file>');
  process.exit(1);
}

let content = readFileSync(file, 'utf-8');
let patched = false;

// 1. random_seed をコメントアウトして固定値に置換
// Pattern: const moonbitlang$core$builtin$$seed = moonbitlang$core$builtin$$random_seed();
// Note: MoonBit compiler uses 'const', not 'var'
// Note: In JS replace(), $$ outputs a single $, so we need $$$$ to output $$
const seedPattern = /^(const moonbitlang\$core\$builtin\$\$seed = moonbitlang\$core\$builtin\$\$random_seed\(\);)$/m;
if (seedPattern.test(content)) {
  content = content.replace(
    seedPattern,
    '// $1\nconst moonbitlang$$core$$builtin$$$$seed = 123456789;'
  );
  patched = true;
  console.log('  Patched: random_seed() -> fixed value');
}

// 2. run() の即時実行を削除 (Sol Framework が自動で呼び出すが、Cloudflare では不要)
const runPattern = /^\(\(\) => \{\s*mizchi\$luna\$sol\$\$run\([^)]+\);\s*\}\)\(\);$/m;
if (runPattern.test(content)) {
  content = content.replace(
    runPattern,
    '// run() removed for Cloudflare Workers'
  );
  patched = true;
  console.log('  Patched: run() immediate execution removed');
}

// 3. ffi_serve 関数を no-op に置換
// Cloudflare Workers では Node.js の @hono/node-server が使えないため、関数を空実装に
// Pattern matches:
// const mizchi$luna$sol$$ffi_serve = (app, port) => {
//   import('@hono/node-server').then(({ serve }) => {
//     serve({ fetch: app.fetch, port });
//   });
// };
const ffiServePattern = /const mizchi\$luna\$sol\$\$ffi_serve = \(app, port\) => \{\s*import\('@hono\/node-server'\)\.then\(\(\{ serve \}\) => \{\s*serve\(\{ fetch: app\.fetch, port \}\);\s*\}\);\s*\};/g;
const hasNodeServerImport = content.includes("import('@hono/node-server')");
if (hasNodeServerImport) {
  content = content.replace(
    ffiServePattern,
    'const mizchi$luna$sol$$ffi_serve = (app, port) => { /* noop for Cloudflare Workers */ };'
  );
  patched = true;
  console.log('  Patched: ffi_serve function replaced with noop');
}

if (patched) {
  writeFileSync(file, content);
  console.log(`Patched: ${file}`);
} else {
  console.log(`No patches needed: ${file}`);
}

// =============================================================================
// Patch .sol/prod/server/main.js for D1 binding and static file serving
// Sol Framework auto-generates a simple Hono export, but we need to wrap it
// to set globalThis.__D1_DB from Cloudflare Workers env binding
// =============================================================================
const solServerMainPath = join(projectRoot, '.sol/prod/server/main.js');
if (existsSync(solServerMainPath)) {
  let solContent = readFileSync(solServerMainPath, 'utf-8');

  // Check if already patched
  if (!solContent.includes('globalThis.__D1_DB')) {
    // Find the line: export default app;
    // Replace with a wrapped export that sets D1 binding
    const exportPattern = /^export default app;$/m;
    if (exportPattern.test(solContent)) {
      solContent = solContent.replace(
        exportPattern,
        `// Wrapped export to set D1 binding from Cloudflare Workers env
// Also fixes MIME type for JS files (Miniflare sometimes returns text/plain)
export default {
  fetch: async (request, env, ctx) => {
    globalThis.__D1_DB = env.DB;

    // Let Hono handle the request first
    const response = await app.fetch(request, env, ctx);

    // Fix MIME type for JS files if incorrectly set
    const url = new URL(request.url);
    if (url.pathname.endsWith('.js') && response.headers.get('content-type')?.includes('text/plain')) {
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/javascript');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }

    return response;
  }
};`
      );
      writeFileSync(solServerMainPath, solContent);
      console.log(`Patched: ${solServerMainPath}`);
      console.log('  Patched: D1 binding wrapper and static serving added');
    } else {
      console.log(`No export default app found in: ${solServerMainPath}`);
    }
  } else {
    console.log(`Already patched: ${solServerMainPath}`);
  }
}
