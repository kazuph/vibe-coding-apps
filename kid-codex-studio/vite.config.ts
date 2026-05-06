import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiPort = Number(env.PORT || 4177);
  const vitePort = Number(env.VITE_PORT || 5277);
  const https =
    env.HTTPS === 'true' && env.HTTPS_KEY && env.HTTPS_CERT
      ? {
          key: fs.readFileSync(env.HTTPS_KEY),
          cert: fs.readFileSync(env.HTTPS_CERT)
        }
      : undefined;

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: vitePort,
      strictPort: true,
      allowedHosts: true,
      https,
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
        '/assets': `http://127.0.0.1:${apiPort}`
      }
    },
    build: {
      outDir: 'dist/client'
    }
  };
});
