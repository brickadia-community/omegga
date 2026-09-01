import Logger from '@/logger';
import soft from '@/softconfig';
import {
  decodePermissions,
  type PermissionSet,
  type StoredPermissionSet,
} from '@webserver/backend/permissions';
import type { IChatUser, IWebAuthnCredential } from '@webserver/backend/types';
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

/**
 * A document read out of a legacy NeDB file. These files are plain JSON written
 * by long-dead versions (and occasionally hand-edited), so every field is
 * genuinely unknown until it has been checked.
 */
type NedbDoc = Record<string, unknown>;

/** coerce to a string, falling back for null/undefined/wrong-typed values */
const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

/**
 * Coerce to a finite number. Non-finite is the important case: binding NaN to a
 * NOT NULL integer column stores NULL and throws.
 */
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** coerce to a plain object, for the JSON-typed columns */
const rec = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/** coerce to an array of T, for the JSON-typed columns */
const arr = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

/** a doc's `type` discriminator, which is how one NeDB file holds many kinds */
const isType = (type: string) => (d: NedbDoc) => d.type === type;

/** the chat_logs.action column is a closed union; legacy rows are not */
const CHAT_ACTIONS = ['msg', 'server', 'leave', 'join'] as const;
type ChatAction = (typeof CHAT_ACTIONS)[number];
const chatAction = (value: unknown): ChatAction =>
  CHAT_ACTIONS.includes(value as ChatAction) ? (value as ChatAction) : 'msg';

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
function isLegacyPermissions(p: NedbDoc): boolean {
  if (p.root === 'unset') return true;
  for (const v of Object.values(rec(p.domains))) if (v === 'unset') return true;
  for (const v of Object.values(rec(p.scopes)))
    if (typeof v === 'string') return true;
  return false;
}

// normalize a v1 permission doc to a v2 StoredPermissionSet (still colon-keyed)
function normalizeLegacyPermissions(p: NedbDoc): StoredPermissionSet {
  const root = p.root === 'all' || p.root === 'read' ? p.root : 'off';
  const domains: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(p.domains))) {
    if (typeof v === 'string' && v !== 'unset' && v !== 'none') domains[k] = v;
  }
  const scopes: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(rec(p.scopes))) {
    if (v === 'enabled' || v === true) scopes[k] = true;
    else if (v === 'disabled' || v === false) scopes[k] = false;
  }
  return { root, domains, scopes } as StoredPermissionSet;
}

function migrateUserPermissions(user: NedbDoc): NedbDoc {
  const p = user.permissions;
  if (!p || typeof p !== 'object') return user;
  const doc = p as NedbDoc;
  const stored = isLegacyPermissions(doc)
    ? normalizeLegacyPermissions(doc)
    : (doc as unknown as StoredPermissionSet);
  return { ...user, permissions: decodePermissions(stored) };
}

function migrateDefaultPermissions(doc: NedbDoc | undefined) {
  if (!doc) return undefined;
  const stored = isLegacyPermissions(doc)
    ? normalizeLegacyPermissions(doc)
    : (doc as unknown as StoredPermissionSet);
  return { ...doc, ...decodePermissions(stored) };
}

// legacy nameHistory may predate the {name,displayName,date} object shape (older
// docs stored bare strings) or be hand-edited; coerce to well-formed objects so
// the json_each/REGEXP player search can't hit malformed JSON or null keys
function sanitizeNameHistory(raw: unknown): {
  name: string;
  displayName: string;
  date: number;
}[] {
  return arr<unknown>(raw)
    .filter((h): h is NedbDoc => !!h && typeof h === 'object')
    .map(h => ({
      name: String(h.name ?? ''),
      displayName: String(h.displayName ?? ''),
      date: num(h.date),
    }));
}

async function loadNedb<T = NedbDoc>(filepath: string): Promise<T[]> {
  if (!fs.existsSync(filepath)) return [];
  const store = Datastore.create({ filename: filepath, autoload: true });
  return (await store.find({})) as T[];
}

// invoke fn on BATCH_SIZE-sized slices of docs (keeps multi-row inserts under
// SQLite's bound-parameter limit). NOT wrapped in its own transaction — callers
// run all batches inside one outer transaction for atomicity.
function eachBatch<T>(docs: T[], fn: (docs: T[]) => void) {
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
    const byCreated = (a: NedbDoc, b: NedbDoc) =>
      num(a.created) - num(b.created);

    const users = (await loadNedb(filePath(NEDB_FILES.users)))
      .filter(isType('user'))
      .map(migrateUserPermissions);
    const chatMessages = (await loadNedb(filePath(NEDB_FILES.chat)))
      .filter(isType('chat'))
      .sort(byCreated);
    const playerDocs = await loadNedb(filePath(NEDB_FILES.players));
    const histories = playerDocs.filter(isType('userHistory'));
    const bans = playerDocs.filter(isType('banHistory'));
    const kicks = playerDocs.filter(isType('kickHistory'));
    const notes = playerDocs.filter(isType('note'));
    const statusDocs = await loadNedb(filePath(NEDB_FILES.status));
    const hbDocs = statusDocs.filter(isType('heartbeat')).sort(byCreated);
    const pcDocs = statusDocs.filter(isType('punchcard'));
    const serverDocs = await loadNedb(filePath(NEDB_FILES.server));
    const instances = serverDocs.filter(isType('app:start'));
    const roles = serverDocs.filter(isType('webRole'));
    const rawDefaultPerms = serverDocs.find(isType('defaultPermissions'));
    const autoRestart = serverDocs.find(isType('autoRestartConfig'));

    // warn about user rows that will be dropped by the new UNIQUE(username):
    // NeDB had no such constraint, so legacy data can hold duplicates
    const seenUsernames = new Set<string>();
    for (const u of users) {
      const name = str(u.username);
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
          d => d.type === 'store' && d.value != null,
        );
        const skipped =
          pluginDocs.filter(isType('store')).length - storeDocs.length;
        if (skipped > 0)
          Logger.log(
            ':>'.yellow,
            `Skipping ${skipped} plugin store entr${skipped === 1 ? 'y' : 'ies'} with no value`,
          );
        const configDocs = pluginDocs.filter(isType('config'));

        const pluginTx = pluginSqlite.transaction(() => {
          eachBatch(storeDocs, batch =>
            pluginDb
              .insert(pluginSchema.pluginStore)
              .values(
                batch.map(s => ({
                  plugin: str(s.plugin),
                  key: str(s.key),
                  value: s.value as Record<string, unknown>,
                })),
              )
              .onConflictDoNothing()
              .run(),
          );
          eachBatch(configDocs, batch =>
            pluginDb
              .insert(pluginSchema.pluginConfig)
              .values(
                batch.map(c => ({
                  plugin: str(c.plugin),
                  value: rec(c.value),
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
              batch.map(u => ({
                id: str(u._id),
                created: num(u.created, Date.now()),
                lastOnline: num(u.lastOnline),
                username: str(u.username),
                hash: str(u.hash),
                isOwner: !!u.isOwner,
                roles: arr<string>(u.roles),
                playerId: str(u.playerId),
                isBanned: !!u.isBanned,
                // already decoded by migrateUserPermissions above, which the
                // NedbDoc type cannot express
                permissions:
                  (u.permissions as PermissionSet | undefined) ?? null,
                totpSecret:
                  typeof u.totpSecret === 'string' ? u.totpSecret : null,
                totpEnabled: !!u.totpEnabled,
                passkeys: arr<IWebAuthnCredential>(u.passkeys),
                recoveryCodes: arr<string>(u.recoveryCodes),
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
              batch.map(c => ({
                created: num(c.created),
                instanceId: str(c.instanceId),
                action: chatAction(c.action),
                user: rec(c.user) as Partial<IChatUser>,
                message: typeof c.message === 'string' ? c.message : null,
              })),
            )
            .run(),
        );
        if (chatMessages.length) counts.chatMessages = chatMessages.length;

        eachBatch(histories, batch =>
          mainDb
            .insert(mainSchema.playerHistory)
            .values(
              batch.map(p => ({
                id: str(p.id),
                name: str(p.name),
                displayName: str(p.displayName),
                nameHistory: sanitizeNameHistory(p.nameHistory),
                ips: arr<string>(p.ips),
                created: num(p.created),
                lastSeen: num(p.lastSeen),
                lastInstanceId: str(p.lastInstanceId),
                heartbeats: num(p.heartbeats),
                sessions: num(p.sessions),
                instances: num(p.instances),
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
              banned: str(b.banned),
              bannerId: str(b.bannerId),
              // num() rejects NaN as well as the wrong type: binding NaN to a
              // NOT NULL integer column stores NULL and throws
              created: num(b.created),
              expires: num(b.expires),
              reason: str(b.reason),
            })
            .onConflictDoNothing()
            .run();
        }
        if (bans.length) counts.bans = bans.length;

        for (const k of kicks) {
          mainDb
            .insert(mainSchema.kickHistory)
            .values({
              kicked: str(k.kicked),
              kickerId: str(k.kickerId),
              created: num(k.created),
              reason: str(k.reason),
            })
            .onConflictDoNothing()
            .run();
        }
        if (kicks.length) counts.kicks = kicks.length;

        eachBatch(notes, batch =>
          mainDb
            .insert(mainSchema.playerNotes)
            .values(
              batch.map(n => ({
                playerId: str(n.id),
                note: str(n.note),
              })),
            )
            .run(),
        );
        if (notes.length) counts.notes = notes.length;

        eachBatch(hbDocs, batch =>
          mainDb
            .insert(mainSchema.heartbeats)
            .values(
              batch.map(h => ({
                created: num(h.created),
                bricks: num(h.bricks),
                players: arr<string>(h.players),
              })),
            )
            .run(),
        );
        if (hbDocs.length) counts.heartbeats = hbDocs.length;

        for (const p of pcDocs) {
          mainDb
            .insert(mainSchema.punchcards)
            .values({
              kind: str(p.kind, 'playerCount'),
              created: num(p.created),
              updated: num(p.updated),
              month: num(p.month),
              year: num(p.year),
              punchcard: arr<number[]>(p.punchcard),
            })
            .onConflictDoNothing()
            .run();
        }
        if (pcDocs.length) counts.punchcards = pcDocs.length;

        eachBatch(instances, batch =>
          mainDb
            .insert(mainSchema.serverInstances)
            .values(batch.map(i => ({ id: str(i._id), date: num(i.date) })))
            .onConflictDoNothing()
            .run(),
        );
        if (instances.length) counts.serverInstances = instances.length;

        eachBatch(roles, batch =>
          mainDb
            .insert(mainSchema.webRoles)
            .values(
              batch.map(r => ({
                id: str(r._id),
                name: str(r.name),
                description: str(r.description),
                order: num(r.order),
                permissions: decodePermissions(
                  r.permissions as StoredPermissionSet,
                ),
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
