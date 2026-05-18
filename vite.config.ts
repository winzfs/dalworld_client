import { defineConfig } from 'vite';

// Local development proxies both realtime sockets and map HTTP APIs to the Worker.
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'http://localhost:8787',
        ws: true,
        changeOrigin: true,
      },
      '/maps': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});