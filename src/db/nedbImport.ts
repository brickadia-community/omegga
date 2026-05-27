import Logger from '@/logger';
import soft from '@/softconfig';
import type { PermissionSet } from '@webserver/backend/permissions';
import type BetterSqlite3 from 'better-sqlite3';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import fs from 'fs';
import Datastore from 'nedb-promises';
import path from 'path';
import { openDb } from './connection';
import { runPluginMigrations } from './migrate';
import * as mainSchema from './schema';
import * as pluginSchema from './pluginSchema';

const MARKER_FILE = 'nedb-imported.marker';
const BATCH_SIZE = 500;

// Apply the NeDB data migrations that the old doMigrations() would have run.
// Users v1: convert old NeDB permission format to PermissionSet.
// Server v1: re-encode defaultPermissions from old format.
function migrateUserPermissions(user: any): any {
  const p = user.permissions;
  if (!p || typeof p !== 'object' || !p.scopes) return user;
  // already migrated if scopes values are booleans
  const firstVal = Object.values(p.scopes)[0];
  if (typeof firstVal === 'boolean' || firstVal === undefined) return user;
  // old format: scopes had 'enabled'/'disabled' strings, domains had 'unset'
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
  return {
    ...user,
    permissions: { root, domains, scopes } as PermissionSet,
  };
}

function migrateDefaultPermissions(doc: any): any {
  if (!doc) return doc;
  const root = doc.root === 'unset' ? 'off' : doc.root;
  const domains: Record<string, string> = {};
  for (const [k, v] of Object.entries(doc.domains ?? {})) {
    if (v !== 'unset') domains[k] = v as string;
  }
  const scopes: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(doc.scopes ?? {})) {
    if (v === 'enabled') scopes[k] = true;
    else if (v === 'disabled') scopes[k] = false;
  }
  return { ...doc, root, domains, scopes };
}

async function loadNedb<T = any>(filepath: string): Promise<T[]> {
  if (!fs.existsSync(filepath)) return [];
  const store = Datastore.create({ filename: filepath, autoload: true });
  return (await store.find({})) as T[];
}

function batchInsert(
  sqlite: BetterSqlite3.Database,
  fn: (docs: any[]) => void,
  docs: any[],
) {
  const tx = sqlite.transaction((items: any[]) => {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      fn(items.slice(i, i + BATCH_SIZE));
    }
  });
  tx(docs);
}

export async function importNedbIfNeeded(
  dataPath: string,
  mainSqlite: BetterSqlite3.Database,
  mainDb: BetterSQLite3Database,
) {
  const markerPath = path.join(dataPath, MARKER_FILE);
  if (fs.existsSync(markerPath)) return;

  const nedbFiles = [
    soft.USER_STORE,
    soft.CHAT_STORE,
    soft.PLAYER_STORE,
    soft.STATUS_STORE,
    soft.SERVER_STORE,
  ];
  const hasNedb = nedbFiles.some(f => fs.existsSync(path.join(dataPath, f)));
  if (!hasNedb) {
    fs.writeFileSync(markerPath, new Date().toISOString());
    return;
  }

  Logger.log('>>'.green, 'Importing NeDB data into SQLite...');
  const counts: Record<string, number> = {};

  // Users
  const users = await loadNedb(path.join(dataPath, soft.USER_STORE));
  const userDocs = users
    .filter((d: any) => d.type === 'user')
    .map(migrateUserPermissions);
  if (userDocs.length > 0) {
    batchInsert(
      mainSqlite,
      batch => {
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
          .run();
      },
      userDocs,
    );
    counts.users = userDocs.length;
  }

  // Chat
  const chatDocs = await loadNedb(path.join(dataPath, soft.CHAT_STORE));
  const chatMessages = chatDocs.filter((d: any) => d.type === 'chat');
  chatMessages.sort((a: any, b: any) => (a.created ?? 0) - (b.created ?? 0));
  if (chatMessages.length > 0) {
    batchInsert(
      mainSqlite,
      batch => {
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
          .run();
      },
      chatMessages,
    );
    counts.chatMessages = chatMessages.length;
  }

  // Players (multiple types in one file)
  const playerDocs = await loadNedb(path.join(dataPath, soft.PLAYER_STORE));

  const histories = playerDocs.filter((d: any) => d.type === 'userHistory');
  if (histories.length > 0) {
    batchInsert(
      mainSqlite,
      batch => {
        mainDb
          .insert(mainSchema.playerHistory)
          .values(
            batch.map((p: any) => ({
              id: p.id,
              name: p.name ?? '',
              displayName: p.displayName ?? '',
              nameHistory: p.nameHistory ?? [],
              ips: p.ips ?? [],
              created: p.created ?? 0,
              lastSeen: p.lastSeen ?? 0,
              lastInstanceId: p.lastInstanceId ?? '',
              heartbeats: p.heartbeats ?? 0,
              sessions: p.sessions ?? 0,
              instances: p.instances ?? 0,
            })),
          )
          .onConflictDoNothing()
          .run();
      },
      histories,
    );
    counts.players = histories.length;
  }

  const bans = playerDocs.filter((d: any) => d.type === 'banHistory');
  if (bans.length > 0) {
    batchInsert(
      mainSqlite,
      batch => {
        for (const b of batch) {
          mainDb
            .insert(mainSchema.banHistory)
            .values({
              banned: b.banned ?? '',
              bannerId: b.bannerId ?? '',
              created:
                typeof b.created === 'number' ? b.created : 0,
              expires:
                typeof b.expires === 'number' ? b.expires : 0,
              reason: b.reason ?? '',
            })
            .onConflictDoNothing()
            .run();
        }
      },
      bans,
    );
    counts.bans = bans.length;
  }

  const kicks = playerDocs.filter((d: any) => d.type === 'kickHistory');
  if (kicks.length > 0) {
    batchInsert(
      mainSqlite,
      batch => {
        for (const k of batch) {
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
      },
      kicks,
    );
    counts.kicks = kicks.length;
  }

  const notes = playerDocs.filter((d: any) => d.type === 'note');
  if (notes.length > 0) {
    batchInsert(
      mainSqlite,
      batch => {
        mainDb
          .insert(mainSchema.playerNotes)
          .values(
            batch.map((n: any) => ({
              playerId: n.id ?? '',
              note: n.note ?? '',
            })),
          )
          .run();
      },
      notes,
    );
    counts.notes = notes.length;
  }

  // Status
  const statusDocs = await loadNedb(path.join(dataPath, soft.STATUS_STORE));

  const hbDocs = statusDocs.filter((d: any) => d.type === 'heartbeat');
  hbDocs.sort((a: any, b: any) => (a.created ?? 0) - (b.created ?? 0));
  if (hbDocs.length > 0) {
    batchInsert(
      mainSqlite,
      batch => {
        mainDb
          .insert(mainSchema.heartbeats)
          .values(
            batch.map((h: any) => ({
              created: h.created ?? 0,
              bricks: h.bricks ?? 0,
              players: h.players ?? [],
            })),
          )
          .run();
      },
      hbDocs,
    );
    counts.heartbeats = hbDocs.length;
  }

  const pcDocs = statusDocs.filter((d: any) => d.type === 'punchcard');
  if (pcDocs.length > 0) {
    batchInsert(
      mainSqlite,
      batch => {
        for (const p of batch) {
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
      },
      pcDocs,
    );
    counts.punchcards = pcDocs.length;
  }

  // Server store
  const serverDocs = await loadNedb(path.join(dataPath, soft.SERVER_STORE));

  const instances = serverDocs.filter((d: any) => d.type === 'app:start');
  if (instances.length > 0) {
    batchInsert(
      mainSqlite,
      batch => {
        mainDb
          .insert(mainSchema.serverInstances)
          .values(batch.map((i: any) => ({ id: i._id, date: i.date ?? 0 })))
          .onConflictDoNothing()
          .run();
      },
      instances,
    );
    counts.serverInstances = instances.length;
  }

  const roles = serverDocs.filter((d: any) => d.type === 'webRole');
  if (roles.length > 0) {
    batchInsert(
      mainSqlite,
      batch => {
        mainDb
          .insert(mainSchema.webRoles)
          .values(
            batch.map((r: any) => ({
              id: r._id,
              name: r.name ?? '',
              description: r.description ?? '',
              order: r.order ?? 0,
              permissions: r.permissions ?? {
                root: 'off',
                domains: {},
                scopes: {},
              },
            })),
          )
          .onConflictDoNothing()
          .run();
      },
      roles,
    );
    counts.roles = roles.length;
  }

  // Singleton configs
  const rawDefaultPerms = serverDocs.find(
    (d: any) => d.type === 'defaultPermissions',
  );
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

  const autoRestart = serverDocs.find(
    (d: any) => d.type === 'autoRestartConfig',
  );
  if (autoRestart) {
    const { _id: _, type: __, ...config } = autoRestart;
    mainDb
      .insert(mainSchema.serverConfig)
      .values({ key: 'autoRestartConfig', value: config })
      .onConflictDoNothing()
      .run();
  }

  // Plugins - open a dedicated connection for the import
  const pluginPath = path.join(dataPath, soft.PLUGIN_STORE);
  if (fs.existsSync(pluginPath)) {
    const pluginSqlite = openDb(path.join(dataPath, soft.PLUGINS_DB));
    const pluginDb = drizzle(pluginSqlite);
    runPluginMigrations(pluginDb);
    const pluginDocs = await loadNedb(pluginPath);
    const storeDocs = pluginDocs.filter((d: any) => d.type === 'store');
    const configDocs = pluginDocs.filter((d: any) => d.type === 'config');

    if (storeDocs.length > 0) {
      batchInsert(
        pluginSqlite,
        batch => {
          for (const s of batch) {
            pluginDb
              .insert(pluginSchema.pluginStore)
              .values({
                plugin: s.plugin ?? '',
                key: s.key ?? '',
                value: s.value,
              })
              .onConflictDoNothing()
              .run();
          }
        },
        storeDocs,
      );
      counts.pluginStoreItems = storeDocs.length;
    }

    if (configDocs.length > 0) {
      batchInsert(
        pluginSqlite,
        batch => {
          for (const c of batch) {
            pluginDb
              .insert(pluginSchema.pluginConfig)
              .values({
                plugin: c.plugin ?? '',
                value: c.value ?? {},
              })
              .onConflictDoNothing()
              .run();
          }
        },
        configDocs,
      );
      counts.pluginConfigs = configDocs.length;
    }

    pluginSqlite.close();
  }

  // Write marker
  fs.writeFileSync(markerPath, new Date().toISOString());

  const parts = Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
  Logger.log('>>'.green, `Imported ${parts}`);
  Logger.log('>>'.green, 'NeDB import complete. Original files preserved.');
}
