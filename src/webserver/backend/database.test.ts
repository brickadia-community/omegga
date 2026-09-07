import * as schema from '@/db/schema';
import { mockOmegga } from '@/test/util';
import BetterSqlite3 from 'better-sqlite3';
import { eq } from 'drizzle-orm';
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
  return new Database({ port: 7777 }, omegga, sqlite, db);
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

    it('renameUser changes the username', async () => {
      const created = defined(await database.createUser('oldname', 'pass'));
      await database.renameUser(created.id, 'newname');
      expect(await database.findUserByUsername('oldname')).toBeNull();
      const renamed = defined(await database.findUserByUsername('newname'));
      expect(renamed.id).toBe(created.id);
      // credentials and account data are preserved
      expect(await database.authUser('newname', 'pass')).not.toBeNull();
    });

    it('renameUser rejects invalid or taken names', async () => {
      const created = defined(await database.createUser('renamer', 'pass'));
      await database.createUser('other', 'pass');
      await expect(
        database.renameUser(created.id, 'bad name!'),
      ).rejects.toThrow('username is not allowed');
      await expect(database.renameUser(created.id, 'OTHER')).rejects.toThrow(
        'username is already taken',
      );
      // changing only the case of your own name is allowed
      await database.renameUser(created.id, 'Renamer');
      const renamed = defined(await database.findUserByUsername('Renamer'));
      expect(renamed.id).toBe(created.id);
    });

    it('usernameTaken is case-insensitive', async () => {
      const created = defined(await database.createUser('Taken', 'pass'));
      expect(await database.usernameTaken('taken')).toBe(true);
      expect(await database.usernameTaken('TAKEN')).toBe(true);
      expect(await database.usernameTaken('free')).toBe(false);
      // a user does not conflict with their own name (case changes allowed)
      expect(await database.usernameTaken('taken', created.id)).toBe(false);
    });

    it('grantOwner makes a user an owner', async () => {
      await database.createAdminUser('admin', 'pass');
      await database.createUser('heir', 'pass');
      await database.grantOwner('heir');
      const heir = defined(await database.findUserByUsername('heir'));
      expect(heir.isOwner).toBe(true);
      // the original owner is unchanged
      const admin = defined(await database.findUserByUsername('admin'));
      expect(admin.isOwner).toBe(true);
    });

    it('grantOwner rejects missing, owner, or disabled users', async () => {
      await database.createAdminUser('admin', 'pass');
      await expect(database.grantOwner('ghost')).rejects.toThrow(
        'user does not exist',
      );
      await expect(database.grantOwner('admin')).rejects.toThrow(
        'user is already an owner',
      );
      await database.createUser('disabled', 'pass');
      await database.banUser('disabled', true);
      await expect(database.grantOwner('disabled')).rejects.toThrow(
        'cannot grant ownership to a disabled user',
      );
    });

    it('revokeOwner demotes an owner but never the last one', async () => {
      await database.createAdminUser('admin', 'pass');
      await database.createUser('co', 'pass');
      await expect(database.revokeOwner('ghost')).rejects.toThrow(
        'user does not exist',
      );
      await expect(database.revokeOwner('co')).rejects.toThrow(
        'user is not an owner',
      );
      await expect(database.revokeOwner('admin')).rejects.toThrow(
        'cannot revoke the last owner',
      );
      await database.grantOwner('co');
      await database.revokeOwner('admin');
      expect(defined(await database.findUserByUsername('admin')).isOwner).toBe(
        false,
      );
      expect(defined(await database.findUserByUsername('co')).isOwner).toBe(
        true,
      );
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

      await database.reorderRoles([
        { id: r3.id, order: 3 },
        { id: r1.id, order: 2 },
        { id: r2.id, order: 1 },
      ]);
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

    it("getPlayerMessageCount counts only that player's messages", async () => {
      const base = Date.now() - 10000;
      db.insert(schema.chatLogs)
        .values([
          {
            created: base,
            instanceId: 'i',
            action: 'msg',
            user: { id: 'p1' },
            message: 'a',
          },
          {
            created: base + 1,
            instanceId: 'i',
            action: 'msg',
            user: { id: 'p1' },
            message: 'b',
          },
          {
            created: base + 2,
            instanceId: 'i',
            action: 'join',
            user: { id: 'p1' },
          },
          {
            created: base + 3,
            instanceId: 'i',
            action: 'msg',
            user: { id: 'p2' },
            message: 'c',
          },
          {
            created: base + 4,
            instanceId: 'i',
            action: 'msg',
            user: { id: '' },
            message: 'from console',
          },
        ])
        .run();

      expect(await database.getPlayerMessageCount('p1')).toBe(2);
      expect(await database.getPlayerMessageCount('p2')).toBe(1);
      expect(await database.getPlayerMessageCount('nobody')).toBe(0);
      // console and unlinked web accounts log an empty id and are never
      // attributed to a player
      expect(await database.getPlayerMessageCount('')).toBe(0);
    });
  });

  describe('player completion ranking', () => {
    const seedNames = async (names: [string, string][], lastSeen: number[]) => {
      for (let i = 0; i < names.length; i++) {
        const [name, displayName] = names[i];
        await database.addVisit({ id: `id-${i}`, name, displayName });
        db.update(schema.playerHistory)
          .set({ lastSeen: lastSeen[i] })
          .where(eq(schema.playerHistory.id, `id-${i}`))
          .run();
      }
    };

    it('puts the closest name first, not the most recently seen', async () => {
      // every one of these matches the fuzzy pattern for "ace"
      await seedNames(
        [
          ['Anvil_Crane', 'Gadget'],
          ['Marble Cascade', 'Marble Cascade'],
          ['Palace_Echo', 'Palace_Echo'],
          ['Acetone', 'Acetone'],
        ],
        [400, 300, 200, 100],
      );

      const byRecency = await database.getPlayers({
        search: 'ace',
        sort: 'lastSeen',
        direction: -1,
      });
      expect(byRecency.players[0].name).toBe('Anvil_Crane');

      const byRelevance = await database.getPlayers({
        search: 'ace',
        sort: 'relevance',
      });
      expect(byRelevance.players[0].name).toBe('Acetone');
      // and the rest are all still offered, just further down
      expect(byRelevance.players).toHaveLength(4);
    });

    it('ranks exact over prefix over substring', async () => {
      await seedNames(
        [
          ['emberglow', 'emberglow'],
          ['sunember', 'sunember'],
          ['ember', 'ember'],
        ],
        [300, 200, 100],
      );

      const { players } = await database.getPlayers({
        search: 'ember',
        sort: 'relevance',
      });
      expect(players.map(p => p.name)).toEqual([
        'ember',
        'emberglow',
        'sunember',
      ]);
    });

    it('matches a display name when the username does not', async () => {
      await seedNames(
        [
          ['nomatch', 'lantern'],
          ['Anvil_Crane', 'Gadget'],
        ],
        [100, 300],
      );
      const { players } = await database.getPlayers({
        search: 'lantern',
        sort: 'relevance',
      });
      expect(players[0].displayName).toBe('lantern');
    });

    it('treats wildcards in the search as literal characters', async () => {
      await seedNames(
        [
          ['abc', 'abc'],
          ['a%c', 'a%c'],
        ],
        [100, 200],
      );
      const { players } = await database.getPlayers({
        search: 'a%c',
        sort: 'relevance',
      });
      expect(players[0].name).toBe('a%c');
    });
  });

  describe('player message counts', () => {
    const seedCounts = async () => {
      for (const [id, name, messages] of [
        ['quiet', 'Quiet', 1],
        ['chatty', 'Chatty', 3],
        ['silent', 'Silent', 0],
      ] as const) {
        await database.addVisit({ id, name, displayName: name });
        for (let i = 0; i < messages; i++)
          db.insert(schema.chatLogs)
            .values({
              created: Date.now() + i,
              instanceId: 'i',
              action: 'msg',
              user: { id },
              message: `m${i}`,
            })
            .run();
        // joins must not inflate the count
        db.insert(schema.chatLogs)
          .values({
            created: Date.now(),
            instanceId: 'i',
            action: 'join',
            user: { id },
          })
          .run();
      }
    };

    it("counts each player's messages in the list", async () => {
      await seedCounts();
      const { players } = await database.getPlayers({ sort: 'name' });
      const counts = Object.fromEntries(
        players.map(p => [p.id, p.messageCount]),
      );
      expect(counts).toEqual({ quiet: 1, chatty: 3, silent: 0 });
    });

    it('sorts by message count in both directions', async () => {
      await seedCounts();
      expect(
        (
          await database.getPlayers({ sort: 'messages', direction: -1 })
        ).players.map(p => p.id),
      ).toEqual(['chatty', 'quiet', 'silent']);
      expect(
        (
          await database.getPlayers({ sort: 'messages', direction: 1 })
        ).players.map(p => p.id),
      ).toEqual(['silent', 'quiet', 'chatty']);
    });
  });

  describe('chat search', () => {
    const seed = async () => {
      await database.addVisit({
        id: 'searcher',
        name: 'Searcher',
        displayName: 'Searcher',
      });
      await database.addVisit({
        id: 'other',
        name: 'Other',
        displayName: 'Other',
      });
      const base = Date.now() - 100000;
      db.insert(schema.chatLogs)
        .values([
          {
            created: base,
            instanceId: 'i',
            action: 'msg',
            user: { id: 'searcher' },
            message: 'building a castle',
          },
          {
            created: base + 1000,
            instanceId: 'i',
            action: 'msg',
            user: { id: 'searcher' },
            message: 'castle is done',
          },
          {
            created: base + 2000,
            instanceId: 'i',
            action: 'join',
            user: { id: 'searcher' },
          },
          {
            created: base + 3000,
            instanceId: 'i',
            action: 'msg',
            user: { id: 'other' },
            message: 'nice castle',
          },
        ])
        .run();
      return base;
    };

    it('matches message text', async () => {
      await seed();
      const res = await database.searchChats({ query: 'castle' });
      expect(res.chats.map(c => c.message)).toEqual([
        'nice castle',
        'castle is done',
        'building a castle',
      ]);
    });

    it('ANDs multiple terms', async () => {
      await seed();
      const res = await database.searchChats({ query: 'castle building' });
      expect(res.chats.map(c => c.message)).toEqual(['building a castle']);
    });

    it('filters by sender name', async () => {
      await seed();
      const res = await database.searchChats({ query: 'from:Searcher castle' });
      expect(res.chats.map(c => c.message)).toEqual([
        'castle is done',
        'building a castle',
      ]);
      expect(res.senders.map(s => s.id)).toEqual(['searcher']);
    });

    it('searches messages only unless action says otherwise', async () => {
      await seed();
      // words can only match a message, so a term narrows to messages
      expect(
        (await database.searchChats({ query: 'from:Searcher castle' })).chats,
      ).toHaveLength(2);
      // with no words to match, the filter scopes the log and keeps the join
      expect(
        (await database.searchChats({ query: 'from:Searcher' })).chats,
      ).toHaveLength(3);
      const joins = await database.searchChats({
        query: 'from:Searcher action:join',
      });
      expect(joins.chats.map(c => c.action)).toEqual(['join']);
    });

    it('includes every kind listed when action is repeated', async () => {
      await seed();
      const both = await database.searchChats({
        query: 'from:Searcher action:join action:msg',
      });
      expect(both.chats.map(c => c.action).sort()).toEqual([
        'join',
        'msg',
        'msg',
      ]);
    });

    it('finds crashes, including ones logged before crash was an action', async () => {
      const base = Date.now() - 100000;
      db.insert(schema.chatLogs)
        .values([
          {
            created: base,
            instanceId: 'i',
            action: 'server',
            user: {},
            message: 'Server started',
          },
          {
            created: base + 1000,
            instanceId: 'i',
            action: 'server',
            user: {},
            message: 'Server crashed, restarting...',
          },
          {
            created: base + 2000,
            instanceId: 'i',
            action: 'crash',
            user: {},
            message: 'Server crashed',
          },
        ])
        .run();

      const crashes = await database.searchChats({ query: 'action:crash' });
      expect(crashes.chats.map(c => c.message)).toEqual([
        'Server crashed',
        'Server crashed, restarting...',
      ]);
    });

    it('does not pull crashes into a plain server search', async () => {
      const base = Date.now() - 100000;
      db.insert(schema.chatLogs)
        .values([
          {
            created: base,
            instanceId: 'i',
            action: 'server',
            user: {},
            message: 'Server started',
          },
          {
            created: base + 1000,
            instanceId: 'i',
            action: 'crash',
            user: {},
            message: 'Server crashed',
          },
        ])
        .run();

      const server = await database.searchChats({ query: 'action:server' });
      expect(server.chats.map(c => c.message)).toEqual(['Server started']);
    });

    it('unions senders when from is repeated', async () => {
      await seed();
      const both = await database.searchChats({
        query: 'castle from:Searcher from:Other',
      });
      expect(both.chats.map(c => c.message)).toEqual([
        'nice castle',
        'castle is done',
        'building a castle',
      ]);
      expect(both.senders.map(s => s.id).sort()).toEqual(['other', 'searcher']);
    });

    it('matches a player id exactly, not every name it looks like', async () => {
      const ids = {
        ember: '11111111-1111-4111-8111-111111111111',
        september: '22222222-2222-4222-8222-222222222222',
        embargo: '33333333-3333-4333-8333-333333333333',
      };
      for (const [name, id] of [
        ['ember', ids.ember],
        ['SeptemberGlow', ids.september],
        ['EmbargoRunner', ids.embargo],
      ] as const) {
        await database.addVisit({ id, name, displayName: name });
        db.insert(schema.chatLogs)
          .values({
            created: Date.now(),
            instanceId: 'i',
            action: 'msg',
            user: { id },
            message: 'hello',
          })
          .run();
      }

      // typing a name is a fuzzy match, so it pulls in every similar player
      const byName = await database.searchChats({ query: 'from:ember hello' });
      expect(byName.senders.map(s => s.id).sort()).toEqual(
        [ids.embargo, ids.ember, ids.september].sort(),
      );

      // picking one from the dropdown sends its id, which pins it to that player
      const byId = await database.searchChats({
        query: `from:${ids.ember} hello`,
      });
      expect(byId.senders.map(s => s.id)).toEqual([ids.ember]);
      expect(byId.chats).toHaveLength(1);
    });

    it('limits results to holders of a role', async () => {
      await seed();
      database.omegga.getRoleAssignments = () => ({
        savedPlayerRoles: {
          searcher: { roles: ['Admin'] },
          other: { roles: ['Member'] },
        },
      });

      const admins = await database.searchChats({ query: 'role:Admin castle' });
      expect(admins.chats.map(c => c.message)).toEqual([
        'castle is done',
        'building a castle',
      ]);

      // role names are matched without regard to case
      expect(
        (await database.searchChats({ query: 'role:admin castle' })).chats,
      ).toHaveLength(2);
    });

    it('returns nothing for a role nobody holds', async () => {
      await seed();
      database.omegga.getRoleAssignments = () => ({
        savedPlayerRoles: { searcher: { roles: ['Admin'] } },
      });
      const res = await database.searchChats({ query: 'role:Ghost castle' });
      expect(res.chats).toEqual([]);
    });

    const seedAdmins = () => {
      const base = Date.now() - 100000;
      db.insert(schema.chatLogs)
        .values([
          {
            created: base,
            instanceId: 'i',
            action: 'msg',
            user: { id: 'p1', name: 'Player' },
            message: 'restart soon',
          },
          {
            created: base + 1000,
            instanceId: 'i',
            action: 'msg',
            // the console logs an empty id under the name SERVER
            user: { id: '', name: 'SERVER', web: true },
            message: 'restart soon from console',
          },
          {
            created: base + 2000,
            instanceId: 'i',
            action: 'msg',
            user: { id: 'admin-1', name: 'Ada', web: true },
            message: 'restart soon from Ada',
          },
          {
            created: base + 3000,
            instanceId: 'i',
            action: 'msg',
            user: { id: 'admin-2', name: 'Bo', web: true },
            message: 'restart soon from Bo',
          },
        ])
        .run();
    };

    it('picks out one admin rather than every web message', async () => {
      seedAdmins();
      const ada = await database.searchChats({ query: 'admin:Ada restart' });
      expect(ada.chats.map(c => c.message)).toEqual(['restart soon from Ada']);
    });

    it('treats admin:server as the console', async () => {
      seedAdmins();
      const console = await database.searchChats({
        query: 'admin:server restart',
      });
      expect(console.chats.map(c => c.message)).toEqual([
        'restart soon from console',
      ]);
    });

    it('takes a bare admin: as anything omegga sent', async () => {
      seedAdmins();
      const any = await database.searchChats({ query: 'admin: restart' });
      expect(any.chats.map(c => c.message)).toEqual([
        'restart soon from Bo',
        'restart soon from Ada',
        'restart soon from console',
      ]);
      // the in game message is the one thing it must not pick up
      expect(any.chats.map(c => c.message)).not.toContain('restart soon');
    });

    it('unions repeated admin filters', async () => {
      seedAdmins();
      const both = await database.searchChats({
        query: 'admin:Ada admin:Bo restart',
      });
      expect(both.chats.map(c => c.message)).toEqual([
        'restart soon from Bo',
        'restart soon from Ada',
      ]);
    });

    it('never matches an in game player with the same name', async () => {
      db.insert(schema.chatLogs)
        .values([
          {
            created: Date.now(),
            instanceId: 'i',
            action: 'msg',
            // an ordinary player who happens to be called Ada
            user: { id: 'p9', name: 'Ada' },
            message: 'hello',
          },
        ])
        .run();
      const res = await database.searchChats({ query: 'admin:Ada hello' });
      expect(res.chats).toEqual([]);
    });

    it('returns nothing when from matches no player', async () => {
      await seed();
      const res = await database.searchChats({ query: 'from:ghost castle' });
      expect(res.chats).toEqual([]);
      expect(res.senders).toEqual([]);
    });

    it('applies before and after bounds', async () => {
      const base = await seed();
      const res = await database.searchChats({
        query: `castle after:${base} before:${base + 2000}`,
      });
      expect(res.chats.map(c => c.message)).toEqual(['castle is done']);
    });

    it('reports the full total on the first page, not the page size', async () => {
      await seed();
      const first = await database.searchChats({ query: 'castle', count: 1 });
      expect(first.chats).toHaveLength(1);
      expect(first.total).toBe(3);
      expect(first.totalCapped).toBe(false);
      const second = await database.searchChats({
        query: 'castle',
        count: 1,
        cursor: first.chats[0].created,
      });
      // the cursor narrows the page, never the reported total
      expect(second.total).toBe(3);
    });

    it('ships one neighbour each way with every match', async () => {
      await seed();
      const res = await database.searchChats({ query: 'castle is done' });
      const [match] = res.chats;
      const around = res.context[match._id];
      expect(around.before.map(c => c.message)).toEqual(['building a castle']);
      // the neighbour is the next entry of any kind, not the next match
      expect(around.after.map(c => c.action)).toEqual(['join']);
    });

    it('marks a match at the very start of the log as having nothing before it', async () => {
      await seed();
      const res = await database.searchChats({ query: 'building' });
      const around = res.context[res.chats[0]._id];
      expect(around.before).toEqual([]);
    });

    it('paginates with a cursor and reports more pages', async () => {
      await seed();
      const first = await database.searchChats({ query: 'castle', count: 2 });
      expect(first.hasMore).toBe(true);
      const second = await database.searchChats({
        query: 'castle',
        count: 2,
        cursor: first.chats[first.chats.length - 1].created,
      });
      expect(second.hasMore).toBe(false);
      expect(second.chats.map(c => c.message)).toEqual(['building a castle']);
    });

    it('sorts oldest first on request', async () => {
      await seed();
      const res = await database.searchChats({
        query: 'castle',
        sort: 'oldest',
      });
      expect(res.chats[0].message).toBe('building a castle');
    });

    it('treats wildcards in a term as literal text', async () => {
      await seed();
      expect((await database.searchChats({ query: '%castle%' })).chats).toEqual(
        [],
      );
      expect(
        (await database.searchChats({ query: 'cast_e' })).chats,
      ).toHaveLength(0);
    });

    it('returns nothing for an empty query', async () => {
      await seed();
      const res = await database.searchChats({ query: '   ' });
      expect(res.chats).toEqual([]);
      expect(res.hasMore).toBe(false);
    });
  });

  describe('chat context', () => {
    const seedNine = () => {
      const base = Date.now() - 100000;
      db.insert(schema.chatLogs)
        .values(
          Array.from({ length: 9 }, (_, i) => ({
            created: base + i * 1000,
            instanceId: 'i',
            action: 'msg' as const,
            user: { id: 'p1' },
            message: `m${i}`,
          })),
        )
        .run();
      return db.select().from(schema.chatLogs).all();
    };

    it('returns the entries before a row, oldest first', async () => {
      const rows = seedNine();
      const before = await database.getChatContext({
        id: rows[4].id,
        direction: 'before',
        count: 2,
      });
      expect(before.map(c => c.message)).toEqual(['m2', 'm3']);
    });

    it('returns the entries after a row, excluding it', async () => {
      const rows = seedNine();
      const after = await database.getChatContext({
        id: rows[4].id,
        direction: 'after',
        count: 2,
      });
      expect(after.map(c => c.message)).toEqual(['m5', 'm6']);
    });

    it('pages outward without skipping or repeating', async () => {
      const rows = seedNine();
      const first = await database.getChatContext({
        id: rows[4].id,
        direction: 'before',
        count: 2,
      });
      const second = await database.getChatContext({
        id: Number(first[0]._id),
        direction: 'before',
        count: 2,
      });
      expect(second.map(c => c.message)).toEqual(['m0', 'm1']);
    });

    it('comes up short at the ends of the log', async () => {
      const rows = seedNine();
      expect(
        await database.getChatContext({
          id: rows[0].id,
          direction: 'before',
          count: 5,
        }),
      ).toEqual([]);
      const tail = await database.getChatContext({
        id: rows[7].id,
        direction: 'after',
        count: 5,
      });
      expect(tail.map(c => c.message)).toEqual(['m8']);
    });

    it('keeps entries logged in the same millisecond in insertion order', async () => {
      const created = Date.now();
      db.insert(schema.chatLogs)
        .values(
          ['a', 'b', 'c'].map(message => ({
            created,
            instanceId: 'i',
            action: 'msg' as const,
            user: { id: 'p1' },
            message,
          })),
        )
        .run();
      const rows = db.select().from(schema.chatLogs).all();
      expect(
        (
          await database.getChatContext({
            id: rows[1].id,
            direction: 'before',
            count: 5,
          })
        ).map(c => c.message),
      ).toEqual(['a']);
      expect(
        (
          await database.getChatContext({
            id: rows[1].id,
            direction: 'after',
            count: 5,
          })
        ).map(c => c.message),
      ).toEqual(['c']);
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

    it('getPlayers search does not match nameHistory JSON keys', async () => {
      await database.addVisit({ id: 'j1', name: 'Foo', displayName: 'Foo' });
      await database.addVisit({ id: 'j2', name: 'Bar', displayName: 'Bar' });

      // 'name' and 'date' are keys in the serialized nameHistory JSON of
      // every player; they must only match actual name values
      expect((await database.getPlayers({ search: 'name' })).total).toBe(0);
      expect((await database.getPlayers({ search: 'date' })).total).toBe(0);
    });

    it('getPlayers search matches past names in nameHistory', async () => {
      await database.addVisit({
        id: 'h1',
        name: 'OldName',
        displayName: 'OldName',
      });
      await database.addVisit({
        id: 'h1',
        name: 'NewName',
        displayName: 'NewName',
      });
      const results = await database.getPlayers({ search: 'oldnam' });
      expect(results.total).toBe(1);
      expect(results.players[0].id).toBe('h1');
    });

    it('getPlayers with empty limitId returns no players', async () => {
      await database.addVisit({ id: 'e1', name: 'Any', displayName: 'Any' });
      const results = await database.getPlayers({ limitId: [] });
      expect(results.total).toBe(0);
      expect(results.players).toHaveLength(0);
    });

    it('getPlayers sorts by heartbeats and sessions', async () => {
      await database.addVisit({ id: 's1', name: 'Low', displayName: 'Low' });
      await database.addVisit({ id: 's2', name: 'High', displayName: 'High' });
      await database.addHeartbeat({ bricks: 0, players: ['s2'], ips: {} });

      const byHeartbeats = await database.getPlayers({
        sort: 'heartbeats',
        direction: -1,
      });
      expect(byHeartbeats.players[0].id).toBe('s2');
    });

    it('getPlayers sorts names case-insensitively', async () => {
      await database.addVisit({ id: 'c1', name: 'alice', displayName: 'a' });
      await database.addVisit({ id: 'c2', name: 'Bob', displayName: 'b' });
      await database.addVisit({ id: 'c3', name: 'Zebra', displayName: 'z' });

      const results = await database.getPlayers({ sort: 'name', direction: 1 });
      expect(results.players.map(p => p.name)).toEqual([
        'alice',
        'Bob',
        'Zebra',
      ]);
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

    // regression: a ban whose timestamp failed to parse used to arrive here as
    // NaN. NaN is typeof 'number', so the old guard let it through, and binding
    // NaN to the NOT NULL `expires`/`created` columns stored NULL and threw
    // "NOT NULL constraint failed: ban_history.expires".
    it('upsertBanHistory coerces NaN timestamps to 0 without throwing', () => {
      expect(() =>
        database.upsertBanHistory({
          banned: 'p-nan',
          bannerId: 'admin',
          created: NaN,
          expires: NaN,
          reason: 'unparseable',
        }),
      ).not.toThrow();

      const row = db
        .select()
        .from(schema.banHistory)
        .where(eq(schema.banHistory.banned, 'p-nan'))
        .get();
      expect(row).toBeDefined();
      expect(row!.created).toBe(0);
      expect(row!.expires).toBe(0);
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
