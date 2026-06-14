import Logger from '@/logger';
import soft from '@/softconfig';
import {
  decodePermissions,
  type StoredPermissionSet,
} from '@webserver/backend/permissions';
import type BetterSqlite3 from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import fs from 'fs';
import Datastore from 'nedb-promises';
import path from 'path';
import { openDb } from './connection';
import { runMigrations, runPluginMigrations } from './migrate';
import * as mainSchema from './schema';
import * as pluginSchema from './pluginSchema';

const MARKER_FILE = 'nedb-imported.marker';
const BATCH_SIZE = 500;

// legacy NeDB database filenames; the one-time import is their only consumer
export const NEDB_FILES = {
  users: 'users.db',
  chat: 'chat.db',
  players: 'players.db',
  status: 'status.db',
  server: 'store.db',
  plugins: 'plugins.db',
} as const;

// Apply the NeDB data migrations that the old doMigrations() would have run.
// Users v1: convert old NeDB permission format to PermissionSet.
// Server v1: re-encode defaultPermissions from old format.
// NeDB stored scope keys colon-encoded ('chat:send'); runtime lookups use
// dotted keys, so every path below must run decodePermissions.

// the v1 format used 'unset' sentinels and 'enabled'/'disabled' scope strings,
// none of which are valid v2 values. detect by the presence of any sentinel so
// an empty-scopes v1 doc (which a scopes-only check would miss) is still
// normalized, while a valid v2 'none' domain is preserved.
function isLegacyPermissions(p: any): boolean {
  if (p.root === 'unset') return true;
  for (const v of Object.values(p.domains ?? {}))
    if (v === 'unset') return true;
  for (const v of Object.values(p.scopes ?? {}))
    if (typeof v === 'string') return true;
  return false;
}

// normalize a v1 permission doc to a v2 StoredPermissionSet (still colon-keyed)
function normalizeLegacyPermissions(p: any): StoredPermissionSet {
  const root = p.root === 'all' || p.root === 'read' ? p.root : 'off';
  const domains: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.domains ?? {})) {
    if (v !== 'unset' && v !== 'none') domains[k] = v as string;
  }
  const scopes: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(p.scopes ?? {})) {
    if (v === 'enabled' || v === true) scopes[k] = true;
    else if (v === 'disabled' || v === false) scopes[k] = false;
  }
  return { root, domains, scopes } as StoredPermissionSet;
}

function migrateUserPermissions(user: any): any {
  const p = user.permissions;
  if (!p || typeof p !== 'object') return user;
  const stored = isLegacyPermissions(p) ? normalizeLegacyPermissions(p) : p;
  return { ...user, permissions: decodePermissions(stored) };
}

function migrateDefaultPermissions(doc: any): any {
  if (!doc) return doc;
  const stored = isLegacyPermissions(doc)
    ? normalizeLegacyPermissions(doc)
    : doc;
  return { ...doc, ...decodePermissions(stored) };
}

// legacy nameHistory may predate the {name,displayName,date} object shape (older
// docs stored bare strings) or be hand-edited; coerce to well-formed objects so
// the json_each/REGEXP player search can't hit malformed JSON or null keys
function sanitizeNameHistory(raw: any): {
  name: string;
  displayName: string;
  date: number;
}[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(h => h && typeof h === 'object')
    .map(h => ({
      name: String(h.name ?? ''),
      displayName: String(h.displayName ?? ''),
      date: typeof h.date === 'number' ? h.date : 0,
    }));
}

async function loadNedb<T = any>(filepath: string): Promise<T[]> {
  if (!fs.existsSync(filepath)) return [];
  const store = Datastore.create({ filename: filepath, autoload: true });
  return (await store.find({})) as T[];
}

// invoke fn on BATCH_SIZE-sized slices of docs (keeps multi-row inserts under
// SQLite's bound-parameter limit). NOT wrapped in its own transaction — callers
// run all batches inside one outer transaction for atomicity.
function eachBatch(docs: any[], fn: (docs: any[]) => void) {
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    fn(docs.slice(i, i + BATCH_SIZE));
  }
}

// key in server_config marking the main-DB import as committed. checked
// in-band with the data so a crash between commit and marker-file write can't
// cause a re-import (which would duplicate the append-only tables).
const IMPORT_FLAG_KEY = 'nedbImported';

// coalesce concurrent import calls for the same data dir (the webserver and the
// plugin loader both bootstrap it). entries are dropped once settled, so this is
// purely a concurrency guard — repeat suppression is the marker file / DB flag.
const importsInFlight = new Map<string, Promise<void>>();

export function importNedbIfNeeded(
  dataPath: string,
  mainSqlite?: BetterSqlite3.Database,
  mainDb?: BetterSQLite3Database,
): Promise<void> {
  const key = path.resolve(dataPath);
  let promise = importsInFlight.get(key);
  if (!promise) {
    promise = importNedb(dataPath, mainSqlite, mainDb).finally(() =>
      importsInFlight.delete(key),
    );
    importsInFlight.set(key, promise);
  }
  return promise;
}

async function importNedb(
  dataPath: string,
  mainSqlite?: BetterSqlite3.Database,
  mainDb?: BetterSQLite3Database,
) {
  const markerPath = path.join(dataPath, MARKER_FILE);
  if (fs.existsSync(markerPath)) return;

  const filePath = (f: string) => path.join(dataPath, f);
  const mainNedbFiles = [
    NEDB_FILES.users,
    NEDB_FILES.chat,
    NEDB_FILES.players,
    NEDB_FILES.status,
    NEDB_FILES.server,
  ];
  const hasMainNedb = mainNedbFiles.some(f => fs.existsSync(filePath(f)));
  const pluginPath = filePath(NEDB_FILES.plugins);
  const hasPluginNedb = fs.existsSync(pluginPath);
  if (!hasMainNedb && !hasPluginNedb) {
    fs.writeFileSync(markerPath, new Date().toISOString());
    return;
  }

  // open a dedicated main-db connection when the caller doesn't have one
  // (the plugin loader bootstraps the import without a webserver)
  let ownConnection = false;
  if (!mainSqlite || !mainDb) {
    ownConnection = true;
    mainSqlite = openDb(filePath(soft.MAIN_DB));
    mainDb = drizzle(mainSqlite);
    runMigrations(mainDb);
  }

  try {
    Logger.log('>>'.green, 'Importing NeDB data into SQLite...');
    const counts: Record<string, number> = {};

    // ---- Load phase: read every NeDB file up front (async). All writes happen
    // afterwards inside a single synchronous transaction so a partial failure
    // rolls back cleanly and a retry can't double-import append-only tables. ----
    const users = (await loadNedb(filePath(NEDB_FILES.users)))
      .filter((d: any) => d.type === 'user')
      .map(migrateUserPermissions);
    const chatMessages = (await loadNedb(filePath(NEDB_FILES.chat)))
      .filter((d: any) => d.type === 'chat')
      .sort((a: any, b: any) => (a.created ?? 0) - (b.created ?? 0));
    const playerDocs = await loadNedb(filePath(NEDB_FILES.players));
    const histories = playerDocs.filter((d: any) => d.type === 'userHistory');
    const bans = playerDocs.filter((d: any) => d.type === 'banHistory');
    const kicks = playerDocs.filter((d: any) => d.type === 'kickHistory');
    const notes = playerDocs.filter((d: any) => d.type === 'note');
    const statusDocs = await loadNedb(filePath(NEDB_FILES.status));
    const hbDocs = statusDocs
      .filter((d: any) => d.type === 'heartbeat')
      .sort((a: any, b: any) => (a.created ?? 0) - (b.created ?? 0));
    const pcDocs = statusDocs.filter((d: any) => d.type === 'punchcard');
    const serverDocs = await loadNedb(filePath(NEDB_FILES.server));
    const instances = serverDocs.filter((d: any) => d.type === 'app:start');
    const roles = serverDocs.filter((d: any) => d.type === 'webRole');
    const rawDefaultPerms = serverDocs.find(
      (d: any) => d.type === 'defaultPermissions',
    );
    const autoRestart = serverDocs.find(
      (d: any) => d.type === 'autoRestartConfig',
    );

    // warn about user rows that will be dropped by the new UNIQUE(username):
    // NeDB had no such constraint, so legacy data can hold duplicates
    const seenUsernames = new Set<string>();
    for (const u of users) {
      const name = u.username ?? '';
      if (seenUsernames.has(name))
        Logger.error(
          '!>'.red,
          `Duplicate username ${JSON.stringify(name)} in legacy data; user ${u._id} will not be imported`,
        );
      else seenUsernames.add(name);
    }

    // ---- Plugins: a separate connection/DB, imported first and idempotently
    // (onConflictDoNothing against real unique constraints), so re-running after
    // a main-DB failure is a safe no-op. ----
    if (hasPluginNedb) {
      const pluginSqlite = openDb(filePath(soft.PLUGINS_DB));
      try {
        const pluginDb = drizzle(pluginSqlite);
        runPluginMigrations(pluginDb);
        const pluginDocs = await loadNedb(pluginPath);
        // NeDB allowed store.set(key, null/undefined); the new value column is
        // NOT NULL, so skip those rows
        const storeDocs = pluginDocs.filter(
          (d: any) => d.type === 'store' && d.value != null,
        );
        const skipped =
          pluginDocs.filter((d: any) => d.type === 'store').length -
          storeDocs.length;
        if (skipped > 0)
          Logger.log(
            ':>'.yellow,
            `Skipping ${skipped} plugin store entr${skipped === 1 ? 'y' : 'ies'} with no value`,
          );
        const configDocs = pluginDocs.filter((d: any) => d.type === 'config');

        const pluginTx = pluginSqlite.transaction(() => {
          eachBatch(storeDocs, batch =>
            pluginDb
              .insert(pluginSchema.pluginStore)
              .values(
                batch.map((s: any) => ({
                  plugin: s.plugin ?? '',
                  key: s.key ?? '',
                  value: s.value,
                })),
              )
              .onConflictDoNothing()
              .run(),
          );
          eachBatch(configDocs, batch =>
            pluginDb
              .insert(pluginSchema.pluginConfig)
              .values(
                batch.map((c: any) => ({
                  plugin: c.plugin ?? '',
                  value: c.value ?? {},
                })),
              )
              .onConflictDoNothing()
              .run(),
          );
        });
        pluginTx();
        if (storeDocs.length) counts.pluginStoreItems = storeDocs.length;
        if (configDocs.length) counts.pluginConfigs = configDocs.length;
      } finally {
        pluginSqlite.close();
      }
    }

    // ---- Main DB: one atomic transaction. The completion flag is written in
    // the same transaction as the data, so either both commit or neither does —
    // a crash before the marker file is written can't trigger a re-import. ----
    const alreadyImported = mainDb
      .select()
      .from(mainSchema.serverConfig)
      .where(eq(mainSchema.serverConfig.key, IMPORT_FLAG_KEY))
      .get();

    if (!alreadyImported && hasMainNedb) {
      const tx = mainSqlite.transaction(() => {
        eachBatch(users, batch =>
          mainDb
            .insert(mainSchema.users)
            .values(
              batch.map((u: any) => ({
                id: u._id,
                created: u.created ?? Date.now(),
                lastOnline: u.lastOnline ?? 0,
                username: u.username ?? '',
                hash: u.hash ?? '',
                isOwner: !!u.isOwner,
                roles: u.roles ?? [],
                playerId: u.playerId ?? '',
                isBanned: !!u.isBanned,
                permissions: u.permissions ?? null,
                totpSecret: u.totpSecret ?? null,
                totpEnabled: !!u.totpEnabled,
                passkeys: u.passkeys ?? [],
                recoveryCodes: u.recoveryCodes ?? [],
              })),
            )
            .onConflictDoNothing()
            .run(),
        );
        if (users.length) counts.users = users.length;

        eachBatch(chatMessages, batch =>
          mainDb
            .insert(mainSchema.chatLogs)
            .values(
              batch.map((c: any) => ({
                created: c.created ?? 0,
                instanceId: c.instanceId ?? '',
                action: c.action ?? 'msg',
                user: c.user ?? {},
                message: c.message ?? null,
              })),
            )
            .run(),
        );
        if (chatMessages.length) counts.chatMessages = chatMessages.length;

        eachBatch(histories, batch =>
          mainDb
            .insert(mainSchema.playerHistory)
            .values(
              batch.map((p: any) => ({
                id: p.id,
                name: p.name ?? '',
                displayName: p.displayName ?? '',
                nameHistory: sanitizeNameHistory(p.nameHistory),
                ips: Array.isArray(p.ips) ? p.ips : [],
                created: p.created ?? 0,
                lastSeen: p.lastSeen ?? 0,
                lastInstanceId: p.lastInstanceId ?? '',
                heartbeats: p.heartbeats ?? 0,
                sessions: p.sessions ?? 0,
                instances: p.instances ?? 0,
              })),
            )
            .onConflictDoNothing()
            .run(),
        );
        if (histories.length) counts.players = histories.length;

        for (const b of bans) {
          mainDb
            .insert(mainSchema.banHistory)
            .values({
              banned: b.banned ?? '',
              bannerId: b.bannerId ?? '',
              created: typeof b.created === 'number' ? b.created : 0,
              expires: typeof b.expires === 'number' ? b.expires : 0,
              reason: b.reason ?? '',
            })
            .onConflictDoNothing()
            .run();
        }
        if (bans.length) counts.bans = bans.length;

        for (const k of kicks) {
          mainDb
            .insert(mainSchema.kickHistory)
            .values({
              kicked: k.kicked ?? '',
              kickerId: k.kickerId ?? '',
              created: k.created ?? 0,
              reason: k.reason ?? '',
            })
            .onConflictDoNothing()
            .run();
        }
        if (kicks.length) counts.kicks = kicks.length;

        eachBatch(notes, batch =>
          mainDb
            .insert(mainSchema.playerNotes)
            .values(
              batch.map((n: any) => ({
                playerId: n.id ?? '',
                note: n.note ?? '',
              })),
            )
            .run(),
        );
        if (notes.length) counts.notes = notes.length;

        eachBatch(hbDocs, batch =>
          mainDb
            .insert(mainSchema.heartbeats)
            .values(
              batch.map((h: any) => ({
                created: h.created ?? 0,
                bricks: h.bricks ?? 0,
                players: Array.isArray(h.players) ? h.players : [],
              })),
            )
            .run(),
        );
        if (hbDocs.length) counts.heartbeats = hbDocs.length;

        for (const p of pcDocs) {
          mainDb
            .insert(mainSchema.punchcards)
            .values({
              kind: p.kind ?? 'playerCount',
              created: p.created ?? 0,
              updated: p.updated ?? 0,
              month: p.month ?? 0,
              year: p.year ?? 0,
              punchcard: p.punchcard ?? [],
            })
            .onConflictDoNothing()
            .run();
        }
        if (pcDocs.length) counts.punchcards = pcDocs.length;

        eachBatch(instances, batch =>
          mainDb
            .insert(mainSchema.serverInstances)
            .values(batch.map((i: any) => ({ id: i._id, date: i.date ?? 0 })))
            .onConflictDoNothing()
            .run(),
        );
        if (instances.length) counts.serverInstances = instances.length;

        eachBatch(roles, batch =>
          mainDb
            .insert(mainSchema.webRoles)
            .values(
              batch.map((r: any) => ({
                id: r._id,
                name: r.name ?? '',
                description: r.description ?? '',
                order: r.order ?? 0,
                permissions: decodePermissions(r.permissions),
              })),
            )
            .onConflictDoNothing()
            .run(),
        );
        if (roles.length) counts.roles = roles.length;

        const defaultPerms = migrateDefaultPermissions(rawDefaultPerms);
        if (defaultPerms) {
          mainDb
            .insert(mainSchema.serverConfig)
            .values({
              key: 'defaultPermissions',
              value: {
                root: defaultPerms.root,
                domains: defaultPerms.domains,
                scopes: defaultPerms.scopes,
              },
            })
            .onConflictDoNothing()
            .run();
        }

        if (autoRestart) {
          const { _id: _, type: __, ...config } = autoRestart;
          mainDb
            .insert(mainSchema.serverConfig)
            .values({ key: 'autoRestartConfig', value: config })
            .onConflictDoNothing()
            .run();
        }

        // commit the completion flag atomically with the data above
        mainDb
          .insert(mainSchema.serverConfig)
          .values({ key: IMPORT_FLAG_KEY, value: new Date().toISOString() })
          .onConflictDoNothing()
          .run();
      });
      tx();
    }

    // marker file enables the cheap fast-path skip on subsequent boots
    fs.writeFileSync(markerPath, new Date().toISOString());

    const parts = Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ');
    Logger.log('>>'.green, `Imported ${parts || 'no records'}`);
    Logger.log('>>'.green, 'NeDB import complete. Original files preserved.');
  } finally {
    if (ownConnection) mainSqlite.close();
  }
}
