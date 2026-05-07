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
  },
});
