import * as schema from '@/db/schema';
import { mockOmegga } from '@/test/util';
import BetterSqlite3 from 'better-sqlite3';
import {
  drizzle,
  type BetterSQLite3Database,
} from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from './database';
import { RootLevel, type PermissionSet } from './permissions';

function defined<T>(value: T | null | undefined, label = 'value'): T {
  expect(value, `expected ${label} to be defined`).not.toBeNull();
  return value!;
}

function createTestDb() {
  const sqlite = new BetterSqlite3(':memory:');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.function(
    'regexp',
    { deterministic: true },
    (pattern: string, value: string) =>
      new RegExp(pattern, 'i').test(value) ? 1 : 0,
  );
  const db = drizzle(sqlite);
  migrate(db, {
    migrationsFolder: path.join(__dirname, '../../db/migrations'),
  });
  return { sqlite, db };
}

function createDatabase(
  sqlite: BetterSqlite3.Database,
  db: BetterSQLite3Database,
) {
  const omegga = mockOmegga();
  return new Database({ port: 7777 } as any, omegga, sqlite, db);
}

describe('Database', () => {
  let sqlite: BetterSqlite3.Database;
  let db: BetterSQLite3Database;
  let database: Database;

  beforeEach(() => {
    const t = createTestDb();
    sqlite = t.sqlite;
    db = t.db;
    database = createDatabase(sqlite, db);
  });

  afterEach(() => {
    sqlite.close();
  });

  describe('users', () => {
    it('isFirstUser returns true when empty', async () => {
      expect(await database.isFirstUser()).toBe(true);
    });

    it('createAdminUser creates an owner', async () => {
      const user = defined(await database.createAdminUser('admin', 'pass123'));
      expect(user.username).toBe('admin');
      expect(user.isOwner).toBe(true);
      expect(await database.isFirstUser()).toBe(false);
    });

    it('createUser creates a non-owner', async () => {
      const user = defined(await database.createUser('regular', 'pass'));
      expect(user.username).toBe('regular');
      expect(user.isOwner).toBe(false);
    });

    it('createUser rejects duplicates', async () => {
      await database.createUser('dup', 'pass');
      await expect(database.createUser('dup', 'pass2')).rejects.toThrow(
        'user already exists',
      );
    });

    it('authUser authenticates valid credentials', async () => {
      await database.createUser('auth', 'secret');
      const user = defined(await database.authUser('auth', 'secret'));
      expect(user.username).toBe('auth');
    });

    it('authUser rejects wrong password', async () => {
      await database.createUser('auth', 'secret');
      expect(await database.authUser('auth', 'wrong')).toBeNull();
    });

    it('authUser rejects banned user', async () => {
      await database.createUser('banned', 'pass');
      await database.banUser('banned', true);
      expect(await database.authUser('banned', 'pass')).toBeNull();
    });

    it('findUserById finds by id', async () => {
      const created = defined(await database.createUser('byid', 'pass'));
      const found = defined(await database.findUserById(created.id));
      expect(found.username).toBe('byid');
    });

    it('findUserById returns owner when username is blank', async () => {
      await database.createAdminUser('', 'pass');
      const found = defined(await database.findUserById('nonexistent-id'));
      expect(found.isOwner).toBe(true);
    });

    it('findUserByUsername finds by name', async () => {
      await database.createUser('findme', 'pass');
      const found = defined(await database.findUserByUsername('findme'));
      expect(found.username).toBe('findme');
    });

    it('deleteUser removes a user', async () => {
      await database.createUser('todelete', 'pass');
      await database.deleteUser('todelete');
      expect(await database.findUserByUsername('todelete')).toBeNull();
    });

    it('userPasswd changes password', async () => {
      await database.createUser('pwuser', 'old');
      await database.userPasswd('pwuser', 'new');
      expect(await database.authUser('pwuser', 'old')).toBeNull();
      expect(await database.authUser('pwuser', 'new')).not.toBeNull();
    });

    it('setUserPermissions updates permissions', async () => {
      await database.createUser('perms', 'pass');
      const perms: PermissionSet = {
        root: RootLevel.All,
        domains: {},
        scopes: {},
      };
      await database.setUserPermissions('perms', perms);
      const user = defined(await database.findUserByUsername('perms'));
      expect(user.permissions?.root).toBe(RootLevel.All);
    });

    it('getUsers paginates and searches', async () => {
      for (let i = 0; i < 5; i++) {
        await database.createUser(`user${i}`, 'pass');
      }
      const all = await database.getUsers({ count: 10 });
      expect(all.total).toBe(5);
      expect(all.users.length).toBe(5);

      const page = await database.getUsers({ count: 2, page: 0 });
      expect(page.users.length).toBe(2);
      expect(page.pages).toBe(3);
    });
  });

  describe('MFA', () => {
    it('TOTP enable/disable round-trip', async () => {
      await database.createUser('mfa', 'pass');
      await database.setUserTotp('mfa', 'SECRETKEY', true);
      let user = defined(await database.findUserByUsername('mfa'));
      expect(user.totpEnabled).toBe(true);
      expect(user.totpSecret).toBe('SECRETKEY');

      await database.disableUserTotp('mfa');
      user = defined(await database.findUserByUsername('mfa'));
      expect(user.totpEnabled).toBe(false);
      expect(user.totpSecret).toBeUndefined();
    });

    it('passkey add/remove', async () => {
      await database.createUser('pk', 'pass');
      const cred = {
        id: 'cred1',
        publicKey: 'pk',
        counter: 0,
        name: 'key1',
        created: Date.now(),
        lastUsed: 0,
      };
      await database.addPasskey('pk', cred);
      let user = defined(await database.findUserByUsername('pk'));
      expect(user.passkeys).toHaveLength(1);
      expect(user.passkeys![0].id).toBe('cred1');

      const found = defined(await database.findUserByPasskeyId('cred1'));
      expect(found.username).toBe('pk');

      await database.updatePasskeyCounter('pk', 'cred1', 5);
      user = defined(await database.findUserByUsername('pk'));
      expect(user.passkeys![0].counter).toBe(5);

      await database.removePasskey('pk', 'cred1');
      user = defined(await database.findUserByUsername('pk'));
      expect(user.passkeys).toHaveLength(0);
    });

    it('recovery codes add/remove', async () => {
      await database.createUser('rc', 'pass');
      await database.setRecoveryCodes('rc', ['hash1', 'hash2', 'hash3']);
      let user = defined(await database.findUserByUsername('rc'));
      expect(user.recoveryCodes).toHaveLength(3);

      await database.removeRecoveryCode('rc', 'hash2');
      user = defined(await database.findUserByUsername('rc'));
      expect(user.recoveryCodes).toEqual(['hash1', 'hash3']);
    });

    it('resetUserMfa clears all MFA', async () => {
      await database.createUser('reset', 'pass');
      await database.setUserTotp('reset', 'S', true);
      await database.addPasskey('reset', {
        id: 'c',
        publicKey: 'p',
        counter: 0,
        name: 'k',
        created: 0,
        lastUsed: 0,
      });
      await database.setRecoveryCodes('reset', ['h']);
      await database.resetUserMfa('reset');
      const user = defined(await database.findUserByUsername('reset'));
      expect(user.totpEnabled).toBe(false);
      expect(user.passkeys).toHaveLength(0);
      expect(user.recoveryCodes).toHaveLength(0);
    });
  });

  describe('roles', () => {
    it('CRUD lifecycle', async () => {
      const perms: PermissionSet = {
        root: RootLevel.Off,
        domains: {},
        scopes: {},
      };
      const role = await database.createRole('Mod', 'Moderator', perms);
      expect(role.name).toBe('Mod');
      expect(role.order).toBe(1);

      const fetched = defined(await database.getRole(role.id));
      expect(fetched.name).toBe('Mod');

      await database.updateRole(role.id, {
        name: 'Moderator',
        description: 'Updated',
      });
      const updated = defined(await database.getRole(role.id));
      expect(updated.name).toBe('Moderator');
      expect(updated.description).toBe('Updated');

      const err = await database.deleteRole(role.id);
      expect(err).toBe('');
      expect(await database.getRole(role.id)).toBeNull();
    });

    it('createRole increments existing orders', async () => {
      const perms: PermissionSet = {
        root: RootLevel.Off,
        domains: {},
        scopes: {},
      };
      const r1 = await database.createRole('A', '', perms);
      const r2 = await database.createRole('B', '', perms);

      const a = defined(await database.getRole(r1.id));
      const b = defined(await database.getRole(r2.id));
      expect(b.order).toBe(1);
      expect(a.order).toBe(2);
    });

    it('reorderRoles updates orders', async () => {
      const perms: PermissionSet = {
        root: RootLevel.Off,
        domains: {},
        scopes: {},
      };
      const r1 = await database.createRole('A', '', perms);
      const r2 = await database.createRole('B', '', perms);
      const r3 = await database.createRole('C', '', perms);

      await database.reorderRoles([r3.id, r1.id, r2.id]);
      const all = await database.getAllRoles();
      expect(all[0].id).toBe(r3.id);
      expect(all[0].order).toBe(3);
      expect(all[2].id).toBe(r2.id);
      expect(all[2].order).toBe(1);
    });

    it('deleteRole removes role from users', async () => {
      const perms: PermissionSet = {
        root: RootLevel.Off,
        domains: {},
        scopes: {},
      };
      const role = await database.createRole('X', '', perms);
      const user = defined(await database.createUser('roleuser', 'pass'));
      database.addUserRole(user.id, role.id);

      let u = defined(await database.findUserById(user.id));
      expect(u.roles).toContain(role.id);

      await database.deleteRole(role.id);
      u = defined(await database.findUserById(user.id));
      expect(u.roles).not.toContain(role.id);
    });

    it('user role grant/revoke', async () => {
      const perms: PermissionSet = {
        root: RootLevel.Off,
        domains: {},
        scopes: {},
      };
      const role = await database.createRole('R', '', perms);
      const user = defined(await database.createUser('ru', 'pass'));

      database.addUserRole(user.id, role.id);
      let u = defined(await database.findUserById(user.id));
      expect(u.roles).toContain(role.id);

      database.addUserRole(user.id, role.id);
      u = defined(await database.findUserById(user.id));
      expect(u.roles.filter(r => r === role.id)).toHaveLength(1);

      database.removeUserRole(user.id, role.id);
      u = defined(await database.findUserById(user.id));
      expect(u.roles).not.toContain(role.id);
    });
  });

  describe('defaultPermissions', () => {
    it('returns defaults when none set', async () => {
      const perms = await database.getDefaultPermissions();
      expect(perms.root).toBe(RootLevel.Read);
    });

    it('set and get round-trip', async () => {
      await database.setDefaultPermissions({
        root: RootLevel.All,
        domains: {},
        scopes: {},
      });
      database.defaultPermissionsCache = null;
      const perms = await database.getDefaultPermissions();
      expect(perms.root).toBe(RootLevel.All);
    });
  });

  describe('chat', () => {
    it('addChatLog inserts and returns', async () => {
      const msg = await database.addChatLog(
        'msg',
        { id: 'p1', name: 'Player' },
        'hello',
      );
      expect(msg.action).toBe('msg');
      expect(msg.message).toBe('hello');
      expect(msg.created).toBeGreaterThan(0);
    });

    it('getChats returns recent messages', async () => {
      const base = Date.now() - 10000;
      for (let i = 0; i < 5; i++) {
        db.insert(schema.chatLogs)
          .values({
            created: base + i * 1000,
            instanceId: 'i',
            action: 'msg',
            user: { id: 'p1' },
            message: `msg${i}`,
          })
          .run();
      }
      const chats = await database.getChats({ count: 3 });
      expect(chats).toHaveLength(3);
      expect(chats[0].message).toBe('msg4');
    });

    it('getChats before/after filtering', async () => {
      const t1 = Date.now() - 3000;
      const t2 = Date.now() - 2000;
      const t3 = Date.now() - 1000;

      db.insert(schema.chatLogs)
        .values([
          {
            created: t1,
            instanceId: 'i',
            action: 'msg',
            user: {},
            message: 'a',
          },
          {
            created: t2,
            instanceId: 'i',
            action: 'msg',
            user: {},
            message: 'b',
          },
          {
            created: t3,
            instanceId: 'i',
            action: 'msg',
            user: {},
            message: 'c',
          },
        ])
        .run();

      const before = await database.getChats({ before: t3 });
      expect(before.map(c => c.message)).toEqual(['b', 'a']);

      const after = await database.getChats({ after: t1 });
      expect(after.map(c => c.message)).toEqual(['b', 'c']);
    });
  });

  describe('players', () => {
    it('addVisit creates new player', async () => {
      const isFirst = await database.addVisit({
        id: 'uuid1',
        name: 'TestPlayer',
        displayName: 'TestPlayer',
      });
      expect(isFirst).toBe(true);

      const player = defined(await database.getPlayer('uuid1'));
      expect(player.name).toBe('TestPlayer');
      expect(player.sessions).toBe(1);
    });

    it('addVisit updates existing player', async () => {
      await database.addVisit({ id: 'uuid2', name: 'Old', displayName: 'Old' });
      const isFirst = await database.addVisit({
        id: 'uuid2',
        name: 'New',
        displayName: 'New',
      });
      expect(isFirst).toBe(false);

      const player = defined(await database.getPlayer('uuid2'));
      expect(player.name).toBe('New');
      expect(player.nameHistory).toHaveLength(2);
    });

    it('addVisit does not duplicate nameHistory', async () => {
      await database.addVisit({
        id: 'uuid3',
        name: 'Same',
        displayName: 'Same',
      });
      await database.addVisit({
        id: 'uuid3',
        name: 'Same',
        displayName: 'Same',
      });
      const player = defined(await database.getPlayer('uuid3'));
      expect(player.nameHistory).toHaveLength(1);
    });

    it('getPlayers search uses REGEXP', async () => {
      await database.addVisit({
        id: 'a',
        name: 'CakeFace',
        displayName: 'CakeFace',
      });
      await database.addVisit({ id: 'b', name: 'Nope', displayName: 'Nope' });

      const results = await database.getPlayers({ search: 'cake' });
      expect(results.total).toBe(1);
      expect(results.players[0].name).toBe('CakeFace');
    });

    it('getPlayers fuzzy search across characters', async () => {
      await database.addVisit({
        id: 'x',
        name: 'xAbCdEf',
        displayName: 'xAbCdEf',
      });
      const results = await database.getPlayers({ search: 'ace' });
      expect(results.total).toBe(1);
    });

    it('getPlayers exact match promoted to top', async () => {
      await database.addVisit({ id: '1', name: 'AAA', displayName: 'AAA' });
      await database.addVisit({ id: '2', name: 'AAAB', displayName: 'AAAB' });
      const results = await database.getPlayers({ search: 'AAA' });
      expect(results.players[0].name).toBe('AAA');
    });

    it('getPlayers pagination', async () => {
      for (let i = 0; i < 10; i++) {
        await database.addVisit({
          id: `p${i}`,
          name: `Player${String(i).padStart(2, '0')}`,
          displayName: `Player${i}`,
        });
      }
      const page0 = await database.getPlayers({ count: 3, page: 0 });
      expect(page0.players).toHaveLength(3);
      expect(page0.pages).toBe(4);
      expect(page0.total).toBe(10);

      const page1 = await database.getPlayers({ count: 3, page: 1 });
      expect(page1.players).toHaveLength(3);
      expect(page1.players[0].id).not.toBe(page0.players[0].id);
    });
  });

  describe('heartbeats', () => {
    it('addHeartbeat records data and updates players', async () => {
      await database.addVisit({ id: 'h1', name: 'P1', displayName: 'P1' });
      await database.addHeartbeat({
        bricks: 100,
        players: ['h1'],
        ips: { h1: '1.2.3.4' },
      });

      const player = defined(await database.getPlayer('h1'));
      expect(player.heartbeats).toBe(1);
      expect(player.ips).toContain('1.2.3.4');
    });

    it('addHeartbeat does not duplicate IPs', async () => {
      await database.addVisit({ id: 'h2', name: 'P2', displayName: 'P2' });
      await database.addHeartbeat({
        bricks: 0,
        players: ['h2'],
        ips: { h2: '5.5.5.5' },
      });
      await database.addHeartbeat({
        bricks: 0,
        players: ['h2'],
        ips: { h2: '5.5.5.5' },
      });

      const player = defined(await database.getPlayer('h2'));
      expect(player.ips.filter(ip => ip === '5.5.5.5')).toHaveLength(1);
      expect(player.heartbeats).toBe(2);
    });
  });

  describe('ban/kick history', () => {
    it('upsertBanHistory inserts and deduplicates', () => {
      const entry = {
        banned: 'p1',
        bannerId: 'admin',
        created: 1000,
        expires: 2000,
        reason: 'test',
      };
      database.upsertBanHistory(entry);
      database.upsertBanHistory(entry);

      const rows = db.select().from(schema.banHistory).all();
      expect(rows).toHaveLength(1);
    });

    it('upsertKickHistory inserts and deduplicates', () => {
      const entry = {
        kicked: 'p1',
        kickerId: 'admin',
        created: 1000,
        reason: 'test',
      };
      database.upsertKickHistory(entry);
      database.upsertKickHistory(entry);

      const kicks = db.select().from(schema.kickHistory).all();
      expect(kicks).toHaveLength(1);
    });

    it('getPlayer includes ban and kick history', async () => {
      await database.addVisit({ id: 'mod1', name: 'M', displayName: 'M' });
      database.upsertBanHistory({
        banned: 'mod1',
        bannerId: null,
        created: 1,
        expires: 2,
        reason: 'ban',
      });
      database.upsertKickHistory({
        kicked: 'mod1',
        kickerId: null,
        created: 3,
        reason: 'kick',
      });

      const p = defined(await database.getPlayer('mod1'));
      expect(p.banHistory).toHaveLength(1);
      expect(p.kickHistory).toHaveLength(1);
    });
  });

  describe('autoRestartConfig', () => {
    it('returns defaults when none set', async () => {
      const config = await database.getAutoRestartConfig();
      expect(config.maxUptime).toBe(48);
      expect(config.crashRestartEnabled).toBe(true);
    });

    it('set and get round-trip', async () => {
      const config = await database.getAutoRestartConfig();
      config.maxUptime = 24;
      config.dailyHourEnabled = true;
      await database.setAutoRestartConfig(config);

      const fetched = await database.getAutoRestartConfig();
      expect(fetched.maxUptime).toBe(24);
      expect(fetched.dailyHourEnabled).toBe(true);
    });

    it('clamps values', async () => {
      const config = await database.getAutoRestartConfig();
      config.maxUptime = 999;
      config.dailyHour = -5;
      await database.setAutoRestartConfig(config);

      const fetched = await database.getAutoRestartConfig();
      expect(fetched.maxUptime).toBe(168);
      expect(fetched.dailyHour).toBe(0);
    });
  });

  describe('punchcard', () => {
    it('creates and updates punchcard', async () => {
      await database.updatePlayerPunchcard(3);
      await database.updatePlayerPunchcard(2);

      const rows = db.select().from(schema.punchcards).all();
      expect(rows).toHaveLength(1);

      const pc = rows[0].punchcard as number[][];
      const now = new Date();
      const hour = now.getUTCHours();
      const day = now.getUTCDay();
      expect(pc[day][hour]).toBe(5);
    });
  });
});
