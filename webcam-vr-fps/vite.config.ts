import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: 'public',
  server: {
    port: 3000,
    host: true,
    strictPort: true,
  }
})
