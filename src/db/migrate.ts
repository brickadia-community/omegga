import Logger from '@/logger';
import { type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';

export function runMigrations(mainDb: BetterSQLite3Database) {
  Logger.verbose('Running omegga database migrations...');
  migrate(mainDb, { migrationsFolder: path.join(__dirname, 'migrations') });
  Logger.verbose('Database migrations complete.');
}

export function runPluginMigrations(pluginDb: BetterSQLite3Database) {
  Logger.verbose('Running plugin database migrations...');
  migrate(pluginDb, {
    migrationsFolder: path.join(__dirname, 'plugin-migrations'),
  });
  Logger.verbose('Plugin database migrations complete.');
}
