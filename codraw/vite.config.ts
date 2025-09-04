import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const basicPass = env.BASIC_AUTH_PASSWORD || env.VITE_BASIC_AUTH_PASSWORD || '';
    const basicHeader = basicPass ? 'Basic ' + Buffer.from(`kazuph:${basicPass}`).toString('base64') : undefined;
    return {
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      server: {
        proxy: {
          '/api': {
            target: 'http://127.0.0.1:8787',
            changeOrigin: true,
            headers: basicHeader ? { Authorization: basicHeader } : {},
          }
        }
      }
    };
});
