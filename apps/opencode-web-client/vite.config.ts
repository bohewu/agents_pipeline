import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

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
    emptyDirFirst: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3456',
        changeOrigin: true,
      },
    },
  },
});
