import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';
import { defineConfig, type PluginOption } from 'vite';
import { vitePluginNativeImportMaps } from 'vite-plugin-native-import-maps';
import sass from 'vite-plugin-sass';

// TODO: this might be useful for letting plugins import omegga components
// import dts from 'vite-plugin-dts';

// https://vite.dev/config/
export default defineConfig({
  root: resolve(__dirname, 'frontend'),
  plugins: [
    sass(),
    react(),
    // dts(),
    // Provide an import-map for plugins to provide custom ui
    vitePluginNativeImportMaps({
      shared: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@tabler/icons-react',
        'nanostores',
        '@nanostores/react',
        'wouter',
        { name: '@components', entry: 'frontend/src/components/index.ts' },
        { name: '@utils', entry: 'frontend/src/utils.ts' },
        { name: '@hooks', entry: 'frontend/src/hooks/index.ts' },
      ],
      sharedOutDir: 'shared',
      log: true,
    }) as PluginOption,
  ],
  publicDir: 'public',
  resolve: {
    alias: {
      '@components': resolve(__dirname, 'frontend/src/components'),
      '@utils': resolve(__dirname, 'frontend/src/utils'),
      '@hooks': resolve(__dirname, 'frontend/src/hooks'),
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        auth: resolve(__dirname, 'frontend/react.auth.html'),
        app: resolve(__dirname, 'frontend/react.app.html'),
      },
    },
    outDir: resolve(__dirname, 'frontend/public'),
    copyPublicDir: false,
    chunkSizeWarningLimit: 8000,
  },
});
