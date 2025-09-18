import { defineConfig } from 'vite';
import path, { resolve } from 'path';

export default defineConfig({
  root: 'src',
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    ssr: true,
    target: 'node23',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/main.ts'),
        index: path.resolve(__dirname, 'src/index.ts'),
      },
      output: {
        format: 'cjs',
        exports: 'named',
        entryFileNames: '[name].js',
        // Preserve module structure instead of bundling
        preserveModules: true,
        preserveModulesRoot: 'src',
      },
      // Keep Node.js modules and dependencies external to avoid dynamic require issues
      external: [/^node:/, /node_modules/],
    },
  },
  resolve: {
    alias: {
      '@omegga': path.resolve(__dirname, 'src/omegga'),
      '@cli': path.resolve(__dirname, 'src/cli'),
      '@util': path.resolve(__dirname, 'src/util'),
      '@webserver': path.resolve(__dirname, 'src/webserver'),
      '@brickadia': path.resolve(__dirname, 'src/brickadia'),
      '@config': path.resolve(__dirname, 'src/config'),
      '@': path.resolve(__dirname, 'src'),
    },
  },
  ssr: { noExternal: /node_modules/ },
});
