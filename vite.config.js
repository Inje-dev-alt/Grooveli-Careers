import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          // Phaser is large and only needed by the world routes; keep it out of the
          // main bundle so the UI shell boots fast.
          phaser: ['phaser'],
        },
      },
    },
    chunkSizeWarningLimit: 1600,
  },
});
