import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import wails from "@wailsio/runtime/plugins/vite";

export default defineConfig({
  plugins: [
      preact(),
      wails("./bindings")
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:8080',
      '/ws': {
        target: 'ws://127.0.0.1:8080',
        ws: true,
      },
    },
  },
});
