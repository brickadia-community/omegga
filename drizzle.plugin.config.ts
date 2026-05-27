import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/pluginSchema.ts',
  out: './src/db/plugin-migrations',
});
