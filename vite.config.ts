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
    rollupOptions: {
      output: {
        // Cloudflare Pages can briefly serve an older HTML document while hashed
        // dynamic chunks from a newer deployment are not available to that page.
        // The Pixi/Vite runtime then fails before the game can boot with messages
        // like "Failed to fetch dynamically imported module: /assets/browserAll-*.js".
        // DalWorld is a single-entry game client, so inlining dynamic imports is a
        // safer trade-off than risking a broken boot screen from missing chunks.
        inlineDynamicImports: true,
      },
    },
  },
});
