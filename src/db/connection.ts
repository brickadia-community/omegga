import Logger from '@/logger';
import BetterSqlite3 from 'better-sqlite3';

export function openDb(filepath: string): BetterSqlite3.Database {
  Logger.verbose('Opening database', filepath);
  const db = new BetterSqlite3(filepath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  // sqlite calls this per row; cache the compiled pattern (it is identical
  // across a query) so a table scan doesn't recompile it every row. reuse is
  // safe because the regex has no g/y flag, so test() carries no lastIndex
  let cache: { pattern: string; regex: RegExp } | null = null;
  db.function(
    'regexp',
    { deterministic: true },
    (pattern: string, value: string) => {
      if (!cache || cache.pattern !== pattern) {
        cache = { pattern, regex: new RegExp(pattern, 'i') };
      }
      return cache.regex.test(value) ? 1 : 0;
    },
  );
  return db;
}
