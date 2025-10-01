import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.backend.config.mjs';

export default mergeConfig(
  viteConfig,
  defineConfig({ test: { root: './src', environment: 'node' } }),
);
