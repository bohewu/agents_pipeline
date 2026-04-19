import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const backendTarget = process.env.OPENCODE_WEB_DEV_BACKEND_URL ?? 'http://127.0.0.1:3456';

export default defineConfig({
  plugins: [react()],
  root: '.',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@assistant-ui/')) {
            return 'assistant-ui';
          }

          if (
            id.includes('/node_modules/react-markdown/') ||
            id.includes('/node_modules/remark-gfm/')
          ) {
            return 'markdown';
          }

          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
});
