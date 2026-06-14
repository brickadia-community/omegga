import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const pluginStore = sqliteTable(
  'plugin_store',
  {
    plugin: text('plugin').notNull(),
    key: text('key').notNull(),
    value: text('value', { mode: 'json' }).notNull().$type<unknown>(),
  },
  table => [primaryKey({ columns: [table.plugin, table.key] })],
);

export const pluginConfig = sqliteTable('plugin_config', {
  plugin: text('plugin').primaryKey(),
  value: text('value', { mode: 'json' })
    .notNull()
    .$type<Record<string, unknown>>(),
});
