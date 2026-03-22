/**
 * Local test server that proxies CDN resources through localhost.
 * This is needed because headless Chromium in CI environments often
 * cannot access external CDN URLs directly.
 *
 * Usage:
 *   1. Download CDN resources first:
 *      curl -sL -o /tmp/cdn-cache/ruby-umd.js 'https://cdn.jsdelivr.net/npm/@ruby/wasm-wasi@2.6.2/dist/browser.umd.js'
 *      curl -sL -o /tmp/cdn-cache/ruby-wasm.wasm 'https://cdn.jsdelivr.net/npm/@ruby/3.3-wasm-wasi@2.6.2/dist/ruby+stdlib.wasm'
 *   2. node test-server.cjs
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const STATIC_DIR = path.join(__dirname);
const CACHE_DIR = process.env.CDN_CACHE_DIR || '/tmp/cdn-cache';
const PORT = parseInt(process.env.TEST_PORT || '8767', 10);

const CDN_FILES = {
  '/cdn/npm/@ruby/wasm-wasi@2.6.2/dist/browser.umd.js': {
    cache: path.join(CACHE_DIR, 'ruby-umd.js'),
    url: 'https://cdn.jsdelivr.net/npm/@ruby/wasm-wasi@2.6.2/dist/browser.umd.js',
  },
  '/cdn/npm/@ruby/3.3-wasm-wasi@2.6.2/dist/ruby+stdlib.wasm': {
    cache: path.join(CACHE_DIR, 'ruby-wasm.wasm'),
    url: 'https://cdn.jsdelivr.net/npm/@ruby/3.3-wasm-wasi@2.6.2/dist/ruby+stdlib.wasm',
  },
};

// Download CDN files if not cached
async function ensureCached() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  for (const [, info] of Object.entries(CDN_FILES)) {
    if (fs.existsSync(info.cache) && fs.statSync(info.cache).size > 0) continue;
    console.log(`Downloading ${info.url}...`);
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(info.cache);
      https.get(info.url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          https.get(res.headers.location, (redir) => {
            redir.pipe(file);
            file.on('finish', () => { file.close(); resolve(); });
          }).on('error', reject);
        } else {
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }
      }).on('error', reject);
    });
    console.log(`  Cached: ${info.cache} (${fs.statSync(info.cache).size} bytes)`);
  }
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];

    // Serve cached CDN files
    if (CDN_FILES[url]) {
      const cacheFile = CDN_FILES[url].cache;
      if (!fs.existsSync(cacheFile)) {
        res.writeHead(500);
        res.end('CDN cache missing: ' + cacheFile);
        return;
      }
      const data = fs.readFileSync(cacheFile);
      const ct = url.endsWith('.js') ? 'application/javascript' : 'application/wasm';
      res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
      res.end(data);
      return;
    }

    // Serve static files with CDN URL rewriting
    const filePath = path.join(STATIC_DIR, url === '/' ? 'index.html' : url);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    let data = fs.readFileSync(filePath);
    if (filePath.endsWith('.html')) {
      data = data.toString('utf8').replace(/https:\/\/cdn\.jsdelivr\.net/g, '/cdn');
    }

    const ext = path.extname(filePath);
    const types = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.wasm': 'application/wasm',
    };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.log(`Test server ready on http://127.0.0.1:${PORT}`);
  });

  return server;
}

// If run directly, start the server
if (require.main === module) {
  ensureCached().then(startServer).catch(e => {
    console.error('Failed to start:', e.message);
    process.exit(1);
  });
}

module.exports = { ensureCached, startServer, PORT };
