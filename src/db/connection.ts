import Logger from '@/logger';
import BetterSqlite3 from 'better-sqlite3';

export function openDb(filepath: string): BetterSqlite3.Database {
  Logger.verbose('Opening database', filepath);
  const db = new BetterSqlite3(filepath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  db.function(
    'regexp',
    { deterministic: true },
    (pattern: string, value: string) =>
      new RegExp(pattern, 'i').test(value) ? 1 : 0,
  );
  return db;
}
