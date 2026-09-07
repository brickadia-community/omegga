import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.frontend.config.mts';

export default mergeConfig(
  viteConfig,
  defineConfig({ test: { root: './frontend/src', environment: 'node' } }),
);
