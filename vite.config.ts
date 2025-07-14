import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { defineConfig } from 'vite';
import sass from 'vite-plugin-sass';

// https://vite.dev/config/
export default defineConfig({
  plugins: [sass(), react()],
  publicDir: 'public',
  root: resolve(__dirname, 'frontend'),
  build: {
    rollupOptions: {
      input: {
        auth: resolve(__dirname, 'frontend/react.auth.html'),
        app: resolve(__dirname, 'frontend/react.app.html'),
      },
    },
    outDir: resolve(__dirname, 'frontend/public'),
    copyPublicDir: false,
  },
});
