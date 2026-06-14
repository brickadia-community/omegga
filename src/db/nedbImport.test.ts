import soft from '@/softconfig';
import BetterSqlite3 from 'better-sqlite3';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'fs';
import Datastore from 'nedb-promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importNedbIfNeeded, NEDB_FILES } from './nedbImport';
import * as mainSchema from './schema';
import * as pluginSchema from './pluginSchema';

let tmpDir: string;
let mainSqlite: BetterSqlite3.Database;
let mainDb: BetterSQLite3Database;

function openTestDb() {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: path.join(__dirname, 'migrations') });
  return { sqlite, db };
}

async function writeNedb(filepath: string, docs: any[]) {
  const store = Datastore.create({ filename: filepath, autoload: true });
  for (const doc of docs) {
    await store.insert(doc);
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nedb-import-test-'));
  const t = openTestDb();
  mainSqlite = t.sqlite;
  mainDb = t.db;
});

afterEach(() => {
  mainSqlite.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('importNedbIfNeeded', () => {
  it('skips import and writes marker on fresh install (no nedb files)', async () => {
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);
    expect(fs.existsSync(path.join(tmpDir, 'nedb-imported.marker'))).toBe(true);
    expect(mainDb.select().from(mainSchema.users).all()).toHaveLength(0);
  });

  it('skips import if marker already exists', async () => {
    fs.writeFileSync(path.join(tmpDir, 'nedb-imported.marker'), 'done');
    await writeNedb(path.join(tmpDir, NEDB_FILES.users), [
      {
        type: 'user',
        _id: 'u1',
        username: 'should-not-import',
        hash: 'h',
        created: 1,
        lastOnline: 0,
        isOwner: false,
        roles: [],
        playerId: '',
      },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);
    expect(mainDb.select().from(mainSchema.users).all()).toHaveLength(0);
  });

  it('imports users', async () => {
    await writeNedb(path.join(tmpDir, NEDB_FILES.users), [
      {
        type: 'user',
        _id: 'u1',
        username: 'admin',
        hash: 'hashed',
        created: 1000,
        lastOnline: 2000,
        isOwner: true,
        roles: ['r1'],
        playerId: 'p1',
        isBanned: false,
        permissions: { root: 'off', domains: {}, scopes: {} },
        totpEnabled: false,
        passkeys: [],
        recoveryCodes: [],
      },
      {
        type: 'user',
        _id: 'u2',
        username: 'regular',
        hash: 'h2',
        created: 3000,
        lastOnline: 0,
        isOwner: false,
        roles: [],
        playerId: '',
        permissions: { root: 'read', domains: {}, scopes: {} },
      },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const users = mainDb.select().from(mainSchema.users).all();
    expect(users).toHaveLength(2);
    expect(users.find(u => u.id === 'u1')!.username).toBe('admin');
    expect(users.find(u => u.id === 'u1')!.isOwner).toBe(true);
    expect(users.find(u => u.id === 'u2')!.username).toBe('regular');
  });

  it('migrates old permission format during import', async () => {
    // NeDB rejects dots in field names, so write the file directly
    // using the colon-encoded format that old omegga actually stored
    const line = JSON.stringify({
      type: 'user',
      _id: 'old',
      username: 'olduser',
      hash: 'h',
      created: 1,
      lastOnline: 0,
      isOwner: false,
      roles: [],
      playerId: '',
      permissions: {
        root: 'unset',
        domains: { server: 'unset', chat: 'all' },
        scopes: { 'chat:send': 'enabled', 'server:start': 'disabled' },
      },
    });
    fs.writeFileSync(path.join(tmpDir, NEDB_FILES.users), line + '\n');
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const users = mainDb.select().from(mainSchema.users).all();
    const perms = users[0].permissions as any;
    expect(perms.root).toBe('off');
    expect(perms.domains).toEqual({ chat: 'all' });
    // the old colon-encoded keys are decoded to the dotted runtime form
    expect(perms.scopes).toEqual({ 'chat.send': true, 'server.start': false });
  });

  it('decodes colon-encoded scope keys from already-migrated (v2) user permissions', async () => {
    // master's NeDB layer stored v2 PermissionSets with boolean values but
    // still colon-encoded scope keys
    const line = JSON.stringify({
      type: 'user',
      _id: 'v2',
      username: 'v2user',
      hash: 'h',
      created: 1,
      lastOnline: 0,
      isOwner: false,
      roles: [],
      playerId: '',
      permissions: {
        root: 'off',
        domains: { chat: 'all' },
        scopes: { 'user:ban': true, 'role:edit': false },
      },
    });
    fs.writeFileSync(path.join(tmpDir, NEDB_FILES.users), line + '\n');
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const users = mainDb.select().from(mainSchema.users).all();
    const perms = users[0].permissions as any;
    expect(perms.scopes).toEqual({ 'user.ban': true, 'role.edit': false });
  });

  it('imports chat messages in order', async () => {
    await writeNedb(path.join(tmpDir, NEDB_FILES.chat), [
      {
        type: 'chat',
        _id: 'c1',
        created: 3000,
        instanceId: 'i1',
        action: 'msg',
        user: { id: 'p1' },
        message: 'third',
      },
      {
        type: 'chat',
        _id: 'c2',
        created: 1000,
        instanceId: 'i1',
        action: 'msg',
        user: { id: 'p1' },
        message: 'first',
      },
      {
        type: 'chat',
        _id: 'c3',
        created: 2000,
        instanceId: 'i1',
        action: 'join',
        user: { id: 'p2' },
      },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const chats = mainDb.select().from(mainSchema.chatLogs).all();
    expect(chats).toHaveLength(3);
    expect(chats[0].message).toBe('first');
    expect(chats[2].message).toBe('third');
  });

  it('imports player history, bans, kicks, and notes', async () => {
    await writeNedb(path.join(tmpDir, NEDB_FILES.players), [
      {
        type: 'userHistory',
        _id: 'ph1',
        id: 'uuid1',
        name: 'Player1',
        displayName: 'P1',
        nameHistory: [{ name: 'Player1', displayName: 'P1', date: 100 }],
        ips: ['1.2.3.4'],
        created: 100,
        lastSeen: 200,
        lastInstanceId: 'i1',
        heartbeats: 10,
        sessions: 3,
        instances: 2,
      },
      {
        type: 'banHistory',
        _id: 'bh1',
        banned: 'uuid1',
        bannerId: 'admin1',
        created: 150,
        expires: 300,
        reason: 'griefing',
      },
      {
        type: 'kickHistory',
        _id: 'kh1',
        kicked: 'uuid1',
        kickerId: 'admin1',
        created: 120,
        reason: 'warning',
      },
      { type: 'note', _id: 'n1', id: 'uuid1', note: 'troublemaker' },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const players = mainDb.select().from(mainSchema.playerHistory).all();
    expect(players).toHaveLength(1);
    expect(players[0].id).toBe('uuid1');
    expect(players[0].heartbeats).toBe(10);

    const bans = mainDb.select().from(mainSchema.banHistory).all();
    expect(bans).toHaveLength(1);
    expect(bans[0].reason).toBe('griefing');

    const kicks = mainDb.select().from(mainSchema.kickHistory).all();
    expect(kicks).toHaveLength(1);
    expect(kicks[0].reason).toBe('warning');

    const notes = mainDb.select().from(mainSchema.playerNotes).all();
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toBe('troublemaker');
  });

  it('imports heartbeats and punchcards', async () => {
    await writeNedb(path.join(tmpDir, NEDB_FILES.status), [
      {
        type: 'heartbeat',
        _id: 'hb1',
        created: 1000,
        bricks: 50,
        players: ['p1', 'p2'],
      },
      {
        type: 'punchcard',
        _id: 'pc1',
        kind: 'playerCount',
        created: 500,
        updated: 1000,
        month: 3,
        year: 2025,
        punchcard: [[1, 2]],
      },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const hbs = mainDb.select().from(mainSchema.heartbeats).all();
    expect(hbs).toHaveLength(1);
    expect(hbs[0].bricks).toBe(50);

    const pcs = mainDb.select().from(mainSchema.punchcards).all();
    expect(pcs).toHaveLength(1);
    expect(pcs[0].year).toBe(2025);
  });

  it('imports server store (instances, roles, configs)', async () => {
    await writeNedb(path.join(tmpDir, NEDB_FILES.server), [
      { type: 'app:start', _id: 'inst1', date: 9000 },
      {
        type: 'webRole',
        _id: 'role1',
        name: 'Mod',
        description: 'Moderator',
        order: 1,
        permissions: { root: 'off', domains: {}, scopes: {} },
      },
      {
        type: 'defaultPermissions',
        _id: 'dp1',
        root: 'read',
        domains: {},
        scopes: {},
      },
      {
        type: 'autoRestartConfig',
        _id: 'arc1',
        maxUptime: 48,
        maxUptimeEnabled: false,
        emptyUptime: 24,
        emptyUptimeEnabled: false,
        dailyHour: 2,
        dailyHourEnabled: false,
        autoUpdateEnabled: true,
        autoUpdateIntervalMins: 60,
        announcementEnabled: true,
        playersEnabled: true,
        saveWorld: true,
        crashRestartEnabled: true,
      },
      { type: 'storeVersion', _id: 'sv1', version: 2 },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const instances = mainDb.select().from(mainSchema.serverInstances).all();
    expect(instances).toHaveLength(1);
    expect(instances[0].id).toBe('inst1');

    const roles = mainDb.select().from(mainSchema.webRoles).all();
    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe('Mod');
    expect(roles[0].id).toBe('role1');

    const configs = mainDb.select().from(mainSchema.serverConfig).all();
    const dpConfig = configs.find(c => c.key === 'defaultPermissions');
    expect(dpConfig).toBeDefined();
    expect((dpConfig!.value as any).root).toBe('read');

    const arcConfig = configs.find(c => c.key === 'autoRestartConfig');
    expect(arcConfig).toBeDefined();
    expect((arcConfig!.value as any).maxUptime).toBe(48);
  });

  it('migrates old defaultPermissions format', async () => {
    // Write directly to avoid NeDB's dot restriction (old data used colon-encoding)
    const line = JSON.stringify({
      type: 'defaultPermissions',
      _id: 'dp1',
      root: 'unset',
      domains: { server: 'unset', chat: 'all' },
      scopes: { 'chat:send': 'enabled', 'server:start': 'disabled' },
    });
    fs.writeFileSync(path.join(tmpDir, NEDB_FILES.server), line + '\n');
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const configs = mainDb.select().from(mainSchema.serverConfig).all();
    const dp = configs.find(c => c.key === 'defaultPermissions')!.value as any;
    expect(dp.root).toBe('off');
    expect(dp.domains).toEqual({ chat: 'all' });
    expect(dp.scopes).toEqual({ 'chat.send': true, 'server.start': false });
  });

  it('preserves boolean scopes in v2 defaultPermissions and decodes keys', async () => {
    // stores that ran master's server v1->v2 migration hold boolean scope
    // values (with colon-encoded keys), not 'enabled'/'disabled' strings
    const line = JSON.stringify({
      type: 'defaultPermissions',
      _id: 'dp1',
      root: 'read',
      domains: { chat: 'all' },
      scopes: { 'chat:send': true, 'server:start': false },
    });
    fs.writeFileSync(path.join(tmpDir, NEDB_FILES.server), line + '\n');
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const configs = mainDb.select().from(mainSchema.serverConfig).all();
    const dp = configs.find(c => c.key === 'defaultPermissions')!.value as any;
    expect(dp.root).toBe('read');
    expect(dp.scopes).toEqual({ 'chat.send': true, 'server.start': false });
  });

  it('decodes colon-encoded scope keys in web role permissions', async () => {
    const line = JSON.stringify({
      type: 'webRole',
      _id: 'role1',
      name: 'Mod',
      description: '',
      order: 1,
      permissions: {
        root: 'off',
        domains: {},
        scopes: { 'player:kick': true },
      },
    });
    fs.writeFileSync(path.join(tmpDir, NEDB_FILES.server), line + '\n');
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const roles = mainDb.select().from(mainSchema.webRoles).all();
    expect((roles[0].permissions as any).scopes).toEqual({
      'player.kick': true,
    });
  });

  it('imports plugin store and config', async () => {
    // Need at least one main store file for the import to proceed
    await writeNedb(path.join(tmpDir, NEDB_FILES.users), [
      {
        type: 'user',
        _id: 'u1',
        username: 'x',
        hash: 'h',
        created: 1,
        lastOnline: 0,
        isOwner: false,
        roles: [],
        playerId: '',
      },
    ]);
    await writeNedb(path.join(tmpDir, NEDB_FILES.plugins), [
      { type: 'store', plugin: 'my-plugin', key: 'score', value: 42 },
      { type: 'store', plugin: 'my-plugin', key: 'name', value: 'test' },
      {
        type: 'config',
        plugin: 'my-plugin',
        value: { enabled: true, threshold: 10 },
      },
      { type: 'store', plugin: 'other', key: 'data', value: [1, 2, 3] },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    // The import opens its own plugins.db in tmpDir, with migrations already run
    const pluginSqlite = new BetterSqlite3(path.join(tmpDir, soft.PLUGINS_DB));
    const pluginDb = drizzle(pluginSqlite);

    const storeItems = pluginDb.select().from(pluginSchema.pluginStore).all();
    expect(storeItems).toHaveLength(3);
    expect(
      storeItems.find(s => s.plugin === 'my-plugin' && s.key === 'score')!
        .value,
    ).toBe(42);
    expect(storeItems.find(s => s.plugin === 'other')!.value).toEqual([
      1, 2, 3,
    ]);

    const configs = pluginDb.select().from(pluginSchema.pluginConfig).all();
    expect(configs).toHaveLength(1);
    expect((configs[0].value as any).enabled).toBe(true);

    pluginSqlite.close();
  });

  it('skips plugin store entries with no value instead of aborting', async () => {
    await writeNedb(path.join(tmpDir, NEDB_FILES.users), [
      {
        type: 'user',
        _id: 'u1',
        username: 'x',
        hash: 'h',
        created: 1,
        lastOnline: 0,
        isOwner: false,
        roles: [],
        playerId: '',
      },
    ]);
    // NeDB allowed store.set(key, undefined), serialized as a missing value
    await writeNedb(path.join(tmpDir, NEDB_FILES.plugins), [
      { type: 'store', plugin: 'my-plugin', key: 'novalue' },
      { type: 'store', plugin: 'my-plugin', key: 'kept', value: 1 },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    expect(fs.existsSync(path.join(tmpDir, 'nedb-imported.marker'))).toBe(true);
    const pluginSqlite = new BetterSqlite3(path.join(tmpDir, soft.PLUGINS_DB));
    const pluginDb = drizzle(pluginSqlite);
    const storeItems = pluginDb.select().from(pluginSchema.pluginStore).all();
    expect(storeItems).toHaveLength(1);
    expect(storeItems[0].key).toBe('kept');
    pluginSqlite.close();
  });

  it('imports without a provided main connection (plugin loader bootstrap)', async () => {
    await writeNedb(path.join(tmpDir, NEDB_FILES.users), [
      {
        type: 'user',
        _id: 'u1',
        username: 'standalone',
        hash: 'h',
        created: 1,
        lastOnline: 0,
        isOwner: false,
        roles: [],
        playerId: '',
      },
    ]);
    await importNedbIfNeeded(tmpDir);

    expect(fs.existsSync(path.join(tmpDir, 'nedb-imported.marker'))).toBe(true);
    const sqlite = new BetterSqlite3(path.join(tmpDir, soft.MAIN_DB));
    const db = drizzle(sqlite);
    const users = db.select().from(mainSchema.users).all();
    expect(users).toHaveLength(1);
    expect(users[0].username).toBe('standalone');
    sqlite.close();
  });

  it('preserves original nedb files after import', async () => {
    const userPath = path.join(tmpDir, NEDB_FILES.users);
    await writeNedb(userPath, [
      {
        type: 'user',
        _id: 'u1',
        username: 'kept',
        hash: 'h',
        created: 1,
        lastOnline: 0,
        isOwner: false,
        roles: [],
        playerId: '',
      },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);
    expect(fs.existsSync(userPath)).toBe(true);
  });

  it('does not re-import on second run', async () => {
    await writeNedb(path.join(tmpDir, NEDB_FILES.users), [
      {
        type: 'user',
        _id: 'u1',
        username: 'once',
        hash: 'h',
        created: 1,
        lastOnline: 0,
        isOwner: false,
        roles: [],
        playerId: '',
      },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);
    expect(mainDb.select().from(mainSchema.users).all()).toHaveLength(1);

    // Wipe SQLite but keep marker - should not re-import
    mainSqlite.exec('DELETE FROM users');
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);
    expect(mainDb.select().from(mainSchema.users).all()).toHaveLength(0);
  });

  it('does not duplicate append-only rows when the marker is lost', async () => {
    // simulates a crash after the atomic main commit but before the marker file
    // write: the in-DB completion flag must still suppress a re-import
    await writeNedb(path.join(tmpDir, NEDB_FILES.chat), [
      {
        type: 'chat',
        _id: 'c1',
        created: 1,
        instanceId: 'i',
        action: 'msg',
        user: {},
        message: 'hi',
      },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);
    expect(mainDb.select().from(mainSchema.chatLogs).all()).toHaveLength(1);

    // drop the marker file but leave the committed data + flag in place
    fs.rmSync(path.join(tmpDir, 'nedb-imported.marker'));
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);
    // chat_logs has no unique constraint; a re-import would duplicate it
    expect(mainDb.select().from(mainSchema.chatLogs).all()).toHaveLength(1);
  });

  it('imports plugin data when only plugins.db exists (no main stores)', async () => {
    // a noweb server never creates the main store files, only plugins.db
    await writeNedb(path.join(tmpDir, NEDB_FILES.plugins), [
      { type: 'store', plugin: 'p', key: 'k', value: 7 },
      { type: 'config', plugin: 'p', value: { on: true } },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const pluginSqlite = new BetterSqlite3(path.join(tmpDir, soft.PLUGINS_DB));
    const pluginDb = drizzle(pluginSqlite);
    expect(pluginDb.select().from(pluginSchema.pluginStore).all()).toHaveLength(
      1,
    );
    expect(
      pluginDb.select().from(pluginSchema.pluginConfig).all(),
    ).toHaveLength(1);
    pluginSqlite.close();
  });

  it('skips plugin store entries with a null value', async () => {
    await writeNedb(path.join(tmpDir, NEDB_FILES.plugins), [
      { type: 'store', plugin: 'p', key: 'good', value: 1 },
      { type: 'store', plugin: 'p', key: 'nulled', value: null },
    ]);
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const pluginSqlite = new BetterSqlite3(path.join(tmpDir, soft.PLUGINS_DB));
    const pluginDb = drizzle(pluginSqlite);
    const items = pluginDb.select().from(pluginSchema.pluginStore).all();
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('good');
    pluginSqlite.close();
  });

  it('sanitizes malformed nameHistory on import', async () => {
    // legacy/hand-edited docs may hold bare strings or partial objects; these
    // must be coerced so the json_each player search can't hit malformed JSON
    fs.writeFileSync(
      path.join(tmpDir, NEDB_FILES.players),
      JSON.stringify({
        type: 'userHistory',
        _id: 'ph1',
        id: 'uuid1',
        name: 'P',
        displayName: 'P',
        nameHistory: ['BareString', { name: 'Old' }, null, 42],
        created: 1,
        lastSeen: 1,
        lastInstanceId: 'i',
      }) + '\n',
    );
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const row = mainDb.select().from(mainSchema.playerHistory).all()[0];
    // only the one well-formed object survives, coerced to full shape
    expect(row.nameHistory).toEqual([
      { name: 'Old', displayName: '', date: 0 },
    ]);
  });

  it('normalizes legacy v1 permissions with empty scopes', async () => {
    // an empty-scopes v1 user still carries 'unset' sentinels that must be
    // normalized (a scopes-only heuristic would wrongly treat it as v2)
    const line = JSON.stringify({
      type: 'user',
      _id: 'old',
      username: 'u',
      hash: 'h',
      created: 1,
      lastOnline: 0,
      isOwner: false,
      roles: [],
      playerId: '',
      permissions: {
        root: 'unset',
        domains: { server: 'unset', chat: 'all' },
        scopes: {},
      },
    });
    fs.writeFileSync(path.join(tmpDir, NEDB_FILES.users), line + '\n');
    await importNedbIfNeeded(tmpDir, mainSqlite, mainDb);

    const perms = mainDb.select().from(mainSchema.users).all()[0]
      .permissions as any;
    expect(perms.root).toBe('off');
    expect(perms.domains).toEqual({ chat: 'all' });
  });
});
