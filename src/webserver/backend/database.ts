import { IServerConfig } from '@config/types';
import * as schema from '@/db/schema';
import type Omegga from '@omegga/server';
import { explode } from '@util/pattern';
import { parseBrickadiaTime } from '@util/time';
import bcrypt from 'bcryptjs';
import type BetterSqlite3 from 'better-sqlite3';
import chokidar from 'chokidar';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  lt,
  gt,
  or,
  sql,
  asc,
  type SQL,
} from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import EventEmitter from 'events';
import { randomUUID } from 'node:crypto';
import path from 'path';
import Calendar from './calendar';
import { serverEvents } from './events';
import {
  EMPTY_PERMISSIONS,
  RootLevel,
  type PermissionSet,
} from './permissions';
import type {
  IPlayer,
  IStoreAutoRestartConfig,
  IStoreBanHistory,
  IStoreDefaultPermissions,
  IStoreKickHistory,
  IStoreRole,
  IStoreUser,
  IUserHistory,
  IWebAuthnCredential,
} from './types';

// TODO: online users graph
// TODO: player online times
// TODO: bricks over time graph
// TODO: minute server status for metrics
// TODO: chat messages per min/hour/day check

// generate a punchcard (days x week)
const createPunchcard = (): number[][] =>
  Array.from({ length: 7 }).map(() =>
    Array.from<number>({ length: 24 }).fill(0),
  );

// the database keeps track of metrics for omegga
export default class Database extends EventEmitter {
  options: IServerConfig;
  omegga: Omegga;
  sqlite: BetterSqlite3.Database;
  db: BetterSQLite3Database;
  defaultPermissionsCache: IStoreDefaultPermissions | null = null;
  rolesCache: (IStoreRole & { id: string })[] | null = null;
  calendar: Calendar;
  private serverInstance: { id: string; date: number } | null = null;

  constructor(
    options: IServerConfig,
    omegga: Omegga,
    sqlite: BetterSqlite3.Database,
    db: BetterSQLite3Database,
  ) {
    super();
    this.options = options;
    this.omegga = omegga;
    this.sqlite = sqlite;
    this.db = db;
    this.calendar = new Calendar();
  }

  // get the running instance id of this omegga
  async getInstanceId() {
    if (this.serverInstance) return this.serverInstance.id;

    const id = randomUUID();
    this.db
      .insert(schema.serverInstances)
      .values({ id, date: Date.now() })
      .run();
    this.serverInstance = { id, date: Date.now() };

    // create a calendar of all previous chat messages
    const dates = this.db
      .select({ created: schema.chatLogs.created })
      .from(schema.chatLogs)
      .all();
    for (const d of dates) {
      this.calendar.addDate(d.created);
    }

    const watcher = chokidar.watch(
      path.join(this.omegga.configPath, 'BanList.json'),
      { persistent: false },
    );
    watcher
      .on('add', () => setTimeout(this.syncBanList.bind(this), 500))
      .on('change', () =>
        setTimeout(() => {
          this.syncBanList();
          this.emit('update.bans');
        }, 500),
      );
    setTimeout(this.syncBanList.bind(this), 500);

    const handleKick = (kicked: IPlayer, kicker: IPlayer, reason: string) => {
      // time the event listener should expire
      const eventExpire = Date.now() + 100;
      // detect a single leave
      this.omegga.once('leave', async leavingPlayer => {
        const now = Date.now();
        // if a player leaves more than 100ms from the kick command, it's bugged
        if (now > eventExpire) return;
        if (leavingPlayer.id === kicked.id) {
          this.upsertKickHistory({
            kicked: kicked.id,
            kickerId: kicker.id,
            created: now,
            reason,
          });
        }
      });
    };

    // for a5 is based on the chat event
    this.omegga.on('kick', (kicked, kicker, reason) => {
      const kickedPlayer = this.omegga.findPlayerByName(kicked);
      const kickerPlayer = this.omegga.findPlayerByName(kicker);
      // couldn't find kicked or kicker player
      if (!kickedPlayer || !kickerPlayer) return;
      handleKick(kickedPlayer, kickerPlayer, reason);
    });

    return id;
  }

  // synchronize the ban list with the one in the database
  syncBanList() {
    const banList = this.omegga.getBanList()?.banList;
    if (!banList) return;

    const tx = this.sqlite.transaction(() => {
      // upsert all bans
      for (const banned in banList) {
        this.upsertBanHistory({
          banned,
          bannerId: banList[banned].bannerId ?? '',
          created: parseBrickadiaTime(banList[banned].created) ?? 0,
          expires: parseBrickadiaTime(banList[banned].expires) ?? 0,
          reason: banList[banned].reason,
        });
      }
    });
    tx();
  }

  // determine if this user would be the first user (admin user)
  async isFirstUser() {
    const result = this.db.select({ count: count() }).from(schema.users).get();
    return (result?.count ?? 0) === 0;
  }

  // hash a password
  async hash(password: string) {
    return await bcrypt.hash(password, 10);
  }

  // create an admin user account, username can be blank (no password)
  async createAdminUser(username: string, password: string) {
    const h = await this.hash(password);
    const id = randomUUID();
    // create an owner user
    this.db
      .insert(schema.users)
      .values({
        id,
        created: Date.now(),
        lastOnline: Date.now(),
        username,
        hash: h,
        isOwner: true,
        roles: [],
        permissions: EMPTY_PERMISSIONS,
        totpEnabled: false,
        passkeys: [],
        recoveryCodes: [],
        playerId: '',
      })
      .run();
    return this.findUserById(id);
  }

  // determine if a user with this name exists
  async userExists(username: string) {
    const result = this.db
      .select({ count: count() })
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();
    return (result?.count ?? 0) > 0;
  }

  // create a regular user account
  async createUser(username: string, password: string) {
    if (await this.userExists(username)) throw new Error('user already exists');
    const h = await this.hash(password);
    const id = randomUUID();
    this.db
      .insert(schema.users)
      .values({
        id,
        created: Date.now(),
        lastOnline: 0,
        username,
        hash: h,
        isOwner: false,
        roles: [],
        permissions: EMPTY_PERMISSIONS,
        totpEnabled: false,
        passkeys: [],
        recoveryCodes: [],
        playerId: '',
      })
      .run();
    return this.findUserById(id);
  }

  // set a user's password
  async userPasswd(username: string, password: string) {
    const h = await this.hash(password);
    if (!(await this.userExists(username)))
      throw new Error('user does not exist');
    this.db
      .update(schema.users)
      .set({ hash: h })
      .where(eq(schema.users.username, username))
      .run();
  }

  async banUser(username: string, banned: boolean) {
    this.db
      .update(schema.users)
      .set({ isBanned: banned })
      .where(eq(schema.users.username, username))
      .run();
    if (banned) serverEvents.emit('userInvalidated', username);
    return 1;
  }

  async deleteUser(username: string) {
    this.db
      .delete(schema.users)
      .where(eq(schema.users.username, username))
      .run();
    serverEvents.emit('userInvalidated', username);
    return 1;
  }

  async setUserPermissions(username: string, permissions: PermissionSet) {
    this.db
      .update(schema.users)
      .set({ permissions: permissions })
      .where(eq(schema.users.username, username))
      .run();
  }

  async getDefaultPermissions(): Promise<IStoreDefaultPermissions> {
    if (this.defaultPermissionsCache) return this.defaultPermissionsCache;
    const row = this.db
      .select()
      .from(schema.serverConfig)
      .where(eq(schema.serverConfig.key, 'defaultPermissions'))
      .get();
    if (!row) {
      const defaults: IStoreDefaultPermissions = {
        type: 'defaultPermissions',
        root: RootLevel.Read,
        domains: {},
        scopes: {},
      };
      this.db
        .insert(schema.serverConfig)
        .values({ key: 'defaultPermissions', value: defaults })
        .run();
      this.defaultPermissionsCache = defaults;
      return defaults;
    }
    const val = row.value as any;
    const result: IStoreDefaultPermissions = {
      type: 'defaultPermissions',
      root: val.root ?? RootLevel.Off,
      domains: val.domains ?? {},
      scopes: val.scopes ?? {},
    };
    this.defaultPermissionsCache = result;
    return result;
  }

  async setDefaultPermissions(
    permissions: Omit<IStoreDefaultPermissions, 'type'>,
  ) {
    const value = {
      root: permissions.root,
      domains: permissions.domains,
      scopes: permissions.scopes,
    };
    this.db
      .insert(schema.serverConfig)
      .values({ key: 'defaultPermissions', value })
      .onConflictDoUpdate({
        target: schema.serverConfig.key,
        set: { value },
      })
      .run();
    this.defaultPermissionsCache = null;
  }

  // get a user from credentials
  async authUser(username: string, password: string) {
    const row = this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();
    // user not found
    if (!row || row.isBanned) return null;
    // make sure the user's password hash is valid
    if (await bcrypt.compare(password, row.hash)) {
      this.db
        .update(schema.users)
        .set({ lastOnline: Date.now() })
        .where(eq(schema.users.id, row.id))
        .run();
      // update last online status
      return this._toStoreUser(row);
    }
    // wrong password
    return null;
  }

  // find a user by object id
  async findUserById(id: string) {
    const row = this.db
      .select()
      .from(schema.users)
      .where(
        or(
          // the owner has no username, so everyone is the owner
          and(eq(schema.users.username, ''), eq(schema.users.isOwner, true)),
          // the user exists and has an id
          eq(schema.users.id, id),
        ),
      )
      .get();
    if (!row) return null;
    return this._toStoreUser(row);
  }

  async findUserByUsername(
    username: string,
  ): Promise<(IStoreUser & { id: string }) | null> {
    const row = this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();
    if (!row) return null;
    return this._toStoreUser(row);
  }

  async findUserByPasskeyId(credentialId: string) {
    const rows = this.db
      .select()
      .from(schema.users)
      .where(
        sql`${schema.users.passkeys} LIKE ${'%"id":"' + credentialId + '"%'}`,
      )
      .all();
    for (const row of rows) {
      const passkeys = (row.passkeys ?? []) as IWebAuthnCredential[];
      if (passkeys.some(p => p.id === credentialId)) {
        return this._toStoreUser(row);
      }
    }
    return null;
  }

  updateUserLastOnline(id: string) {
    this.db
      .update(schema.users)
      .set({ lastOnline: Date.now() })
      .where(eq(schema.users.id, id))
      .run();
  }

  updateOwnerCredentials(id: string, username: string, hash: string) {
    this.db
      .update(schema.users)
      .set({ username, hash })
      .where(eq(schema.users.id, id))
      .run();
  }

  addUserRole(userId: string, roleId: string) {
    const row = this.db
      .select({ roles: schema.users.roles })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get();
    if (!row) return;
    const roles = (row.roles ?? []) as string[];
    if (!roles.includes(roleId)) {
      roles.push(roleId);
      this.db
        .update(schema.users)
        .set({ roles })
        .where(eq(schema.users.id, userId))
        .run();
    }
  }

  removeUserRole(userId: string, roleId: string) {
    const row = this.db
      .select({ roles: schema.users.roles })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .get();
    if (!row) return;
    const roles = ((row.roles ?? []) as string[]).filter(r => r !== roleId);
    this.db
      .update(schema.users)
      .set({ roles })
      .where(eq(schema.users.id, userId))
      .run();
  }

  async setUserTotp(username: string, secret: string, enabled: boolean) {
    this.db
      .update(schema.users)
      .set({ totpSecret: secret, totpEnabled: enabled })
      .where(eq(schema.users.username, username))
      .run();
  }

  async disableUserTotp(username: string) {
    this.db
      .update(schema.users)
      .set({ totpEnabled: false, totpSecret: null })
      .where(eq(schema.users.username, username))
      .run();
  }

  async addPasskey(username: string, credential: IWebAuthnCredential) {
    const row = this.db
      .select({ id: schema.users.id, passkeys: schema.users.passkeys })
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();
    if (!row) return;
    const passkeys = [
      ...((row.passkeys ?? []) as IWebAuthnCredential[]),
      credential,
    ];
    this.db
      .update(schema.users)
      .set({ passkeys })
      .where(eq(schema.users.id, row.id))
      .run();
  }

  async removePasskey(username: string, credentialId: string) {
    const row = this.db
      .select({ id: schema.users.id, passkeys: schema.users.passkeys })
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();
    if (!row) return;
    const passkeys = ((row.passkeys ?? []) as IWebAuthnCredential[]).filter(
      p => p.id !== credentialId,
    );
    this.db
      .update(schema.users)
      .set({ passkeys })
      .where(eq(schema.users.id, row.id))
      .run();
  }

  async updatePasskeyCounter(
    username: string,
    credentialId: string,
    counter: number,
  ) {
    const row = this.db
      .select({ id: schema.users.id, passkeys: schema.users.passkeys })
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();
    if (!row) return;
    const passkeys = ((row.passkeys ?? []) as IWebAuthnCredential[]).map(p =>
      p.id === credentialId ? { ...p, counter, lastUsed: Date.now() } : p,
    );
    this.db
      .update(schema.users)
      .set({ passkeys })
      .where(eq(schema.users.id, row.id))
      .run();
  }

  async setRecoveryCodes(username: string, hashedCodes: string[]) {
    this.db
      .update(schema.users)
      .set({ recoveryCodes: hashedCodes })
      .where(eq(schema.users.username, username))
      .run();
  }

  async removeRecoveryCode(username: string, hashedCode: string) {
    const row = this.db
      .select({
        id: schema.users.id,
        recoveryCodes: schema.users.recoveryCodes,
      })
      .from(schema.users)
      .where(eq(schema.users.username, username))
      .get();
    if (!row) return;
    const codes = ((row.recoveryCodes ?? []) as string[]).filter(
      c => c !== hashedCode,
    );
    this.db
      .update(schema.users)
      .set({ recoveryCodes: codes })
      .where(eq(schema.users.id, row.id))
      .run();
  }

  async resetUserMfa(username: string) {
    this.db
      .update(schema.users)
      .set({
        totpEnabled: false,
        totpSecret: null,
        passkeys: [],
        recoveryCodes: [],
      })
      .where(eq(schema.users.username, username))
      .run();
  }

  async getAllRoles(): Promise<(IStoreRole & { id: string })[]> {
    if (this.rolesCache) return this.rolesCache;
    const rows = this.db
      .select()
      .from(schema.webRoles)
      .orderBy(desc(schema.webRoles.order))
      .all();
    const roles = rows.map(r => ({
      type: 'webRole' as const,
      id: r.id,
      name: r.name,
      description: r.description,
      order: r.order,
      permissions: r.permissions as PermissionSet,
    }));
    this.rolesCache = roles;
    return roles;
  }

  invalidateRolesCache() {
    this.rolesCache = null;
    this.defaultPermissionsCache = null;
  }

  async getRole(id: string): Promise<(IStoreRole & { id: string }) | null> {
    const row = this.db
      .select()
      .from(schema.webRoles)
      .where(eq(schema.webRoles.id, id))
      .get();
    if (!row) return null;
    return {
      type: 'webRole',
      id: row.id,
      name: row.name,
      description: row.description,
      order: row.order,
      permissions: row.permissions as PermissionSet,
    };
  }

  async createRole(
    name: string,
    description: string,
    permissions: PermissionSet,
  ): Promise<IStoreRole & { id: string }> {
    const id = randomUUID();
    const tx = this.sqlite.transaction(() => {
      this.db
        .update(schema.webRoles)
        .set({ order: sql`${schema.webRoles.order} + 1` })
        .run();
      this.db
        .insert(schema.webRoles)
        .values({
          id,
          name,
          description,
          order: 1,
          permissions: permissions,
        })
        .run();
    });
    tx();
    this.invalidateRolesCache();
    return {
      type: 'webRole',
      id,
      name,
      description,
      order: 1,
      permissions: permissions,
    };
  }

  async updateRole(
    id: string,
    updates: Partial<Pick<IStoreRole, 'name' | 'description' | 'order'>> & {
      permissions?: PermissionSet;
    },
  ): Promise<void> {
    const $set: Record<string, any> = {};
    if (updates.name !== undefined) $set.name = updates.name;
    if (updates.description !== undefined)
      $set.description = updates.description;
    if (updates.order !== undefined) $set.order = updates.order;
    if (updates.permissions !== undefined)
      $set.permissions = updates.permissions;
    if (Object.keys($set).length > 0) {
      this.db
        .update(schema.webRoles)
        .set($set)
        .where(eq(schema.webRoles.id, id))
        .run();
    }
    this.invalidateRolesCache();
  }

  async deleteRole(id: string): Promise<string> {
    const role = await this.getRole(id);
    if (!role) return 'role not found';

    const tx = this.sqlite.transaction(() => {
      this.db.delete(schema.webRoles).where(eq(schema.webRoles.id, id)).run();
      const usersWithRole = this.db
        .select({ id: schema.users.id, roles: schema.users.roles })
        .from(schema.users)
        .all();
      for (const u of usersWithRole) {
        const roles = ((u.roles ?? []) as string[]).filter(r => r !== id);
        if (roles.length !== ((u.roles ?? []) as string[]).length) {
          this.db
            .update(schema.users)
            .set({ roles })
            .where(eq(schema.users.id, u.id))
            .run();
        }
      }
    });
    tx();
    this.invalidateRolesCache();
    return '';
  }

  async reorderRoles(entries: { id: string; order: number }[]): Promise<void> {
    const tx = this.sqlite.transaction(() => {
      for (const { id, order } of entries) {
        this.db
          .update(schema.webRoles)
          .set({ order })
          .where(eq(schema.webRoles.id, id))
          .run();
      }
    });
    tx();
    this.invalidateRolesCache();
  }

  async getUserRolePermissions(user: IStoreUser): Promise<PermissionSet[]> {
    const defaults = await this.getDefaultPermissions();
    const defaultPerms: PermissionSet = {
      root: defaults.root,
      domains: defaults.domains,
      scopes: defaults.scopes,
    };
    const allRoles = await this.getAllRoles();
    const userRoles = allRoles.filter(r => user.roles.includes(r.id));
    return [defaultPerms, ...userRoles.map(r => r.permissions)];
  }

  async getUserAssignedRoles(
    user: IStoreUser,
  ): Promise<(IStoreRole & { id: string })[]> {
    const allRoles = await this.getAllRoles();
    return allRoles.filter(r => user.roles.includes(r.id));
  }

  // add a chat message to the chat log store
  async addChatLog(
    action: 'msg' | 'server' | 'leave' | 'join',
    user: IPlayer,
    message?: string,
  ) {
    this.calendar.addDate(Date.now());
    const row = this.db
      .insert(schema.chatLogs)
      .values({
        created: Date.now(),
        instanceId: await this.getInstanceId(),
        action,
        user,
        ...(message ? { message } : {}),
      })
      .returning()
      .get();
    return {
      type: 'chat' as const,
      _id: String(row.id),
      id: row.id,
      created: row.created,
      instanceId: row.instanceId,
      action: row.action,
      user: row.user,
      message: row.message,
    };
  }

  // get recent chat activity
  async getChats({
    count: limit = 50,
    sameServer,
    before,
    after,
  }: {
    count?: number;
    sameServer?: boolean;
    before?: number;
    after?: number;
  } = {}) {
    const conditions = [];
    if (sameServer) {
      conditions.push(
        eq(schema.chatLogs.instanceId, await this.getInstanceId()),
      );
    }
    if (before) {
      conditions.push(lt(schema.chatLogs.created, before));
    } else if (after) {
      conditions.push(gt(schema.chatLogs.created, after));
    } else {
      conditions.push(lt(schema.chatLogs.created, Date.now()));
    }

    const orderDir = !before && after ? asc : desc;
    const rows = this.db
      .select()
      .from(schema.chatLogs)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(orderDir(schema.chatLogs.created))
      .limit(limit)
      .all();

    return rows.map(r => ({
      type: 'chat' as const,
      _id: String(r.id),
      created: r.created,
      instanceId: r.instanceId,
      action: r.action,
      user: r.user,
      message: r.message,
    }));
  }

  // get paginated players
  async getPlayers({
    count: limit = 50,
    search = '',
    page = 0,
    sort = 'name',
    direction = 1,
    limitId = undefined,
  }: {
    count?: number;
    search?: string;
    page?: number;
    sort?: string;
    direction?: number;
    limitId?: string[];
  } = {}) {
    const pattern = search.length > 0 ? explode(search) : null;
    const patternSource = pattern?.source;

    // an empty filter (e.g. "banned" with no active bans) matches nothing
    if (limitId && limitId.length === 0)
      return { pages: 0, total: 0, players: [] };

    const conditions: SQL[] = [];

    if (limitId) {
      conditions.push(inArray(schema.playerHistory.id, limitId));
    }

    if (patternSource) {
      // match name history values via json_each so the pattern can't hit
      // JSON keys or date timestamps
      conditions.push(sql`(
        ${schema.playerHistory.id} = ${search}
        OR ${schema.playerHistory.name} REGEXP ${patternSource}
        OR ${schema.playerHistory.displayName} REGEXP ${patternSource}
        OR EXISTS (
          SELECT 1 FROM json_each(${schema.playerHistory.nameHistory})
          WHERE json_each.type = 'object'
            AND (json_extract(json_each.value, '$.name') REGEXP ${patternSource}
              OR json_extract(json_each.value, '$.displayName') REGEXP ${patternSource})
        )
      )`);
    }

    const baseWhere = conditions.length > 0 ? and(...conditions) : undefined;

    const sortCol =
      sort === 'lastSeen'
        ? schema.playerHistory.lastSeen
        : sort === 'created'
          ? schema.playerHistory.created
          : sort === 'heartbeats'
            ? schema.playerHistory.heartbeats
            : sort === 'sessions'
              ? schema.playerHistory.sessions
              : sql`${schema.playerHistory.name} COLLATE NOCASE`;
    const orderDir = direction === 1 ? asc : desc;

    const totalResult = this.db
      .select({ count: count() })
      .from(schema.playerHistory)
      .where(baseWhere)
      .get();
    const players = this.db
      .select()
      .from(schema.playerHistory)
      .where(baseWhere)
      .orderBy(orderDir(sortCol))
      .limit(limit)
      .offset(limit * page)
      .all();

    const total = totalResult?.count ?? 0;
    const result = players.map(p => this._toUserHistory(p));

    // exact match detection
    if (search.length > 0 && page === 0) {
      const exactRows = this.db
        .select()
        .from(schema.playerHistory)
        .where(
          or(
            eq(schema.playerHistory.id, search),
            eq(schema.playerHistory.name, search),
            eq(schema.playerHistory.displayName, search),
          ),
        )
        .all();
      if (exactRows.length > 0) {
        for (const res of exactRows) {
          const idx = result.findIndex(p => p.id === res.id);
          if (idx >= 0) result.splice(idx, 1);
        }
        result.splice(0, 0, ...exactRows.map(r => this._toUserHistory(r)));
      }
    }

    return { pages: Math.ceil(total / limit), total, players: result };
  }

  // get paginated users
  async getUsers({
    count: limit = 50,
    search = '',
    page = 0,
    sort = 'name',
    direction = 1,
  } = {}) {
    const pattern = search.length > 0 ? explode(search) : null;

    let baseWhere = sql`1=1`;
    if (pattern) {
      baseWhere = sql`(
        ${schema.users.playerId} = ${search}
        OR ${schema.users.username} REGEXP ${pattern.source}
      )`;
    }

    const sortCol =
      sort === 'lastOnline'
        ? schema.users.lastOnline
        : sort === 'created'
          ? schema.users.created
          : sql`${schema.users.username} COLLATE NOCASE`;
    const orderDir = direction === 1 ? asc : desc;

    const totalResult = this.db
      .select({ count: count() })
      .from(schema.users)
      .where(baseWhere)
      .get();
    const users = this.db
      .select()
      .from(schema.users)
      .where(baseWhere)
      .orderBy(orderDir(sortCol))
      .limit(limit)
      .offset(limit * page)
      .all();

    return {
      pages: Math.ceil((totalResult?.count ?? 0) / limit),
      total: totalResult?.count ?? 0,
      users: users.map(u => this._toStoreUser(u)),
    };
  }

  // get an individual player, ban and kick history, and notes
  async getPlayer(id: string) {
    const player = this.db
      .select()
      .from(schema.playerHistory)
      .where(eq(schema.playerHistory.id, id))
      .get();
    if (!player) return null;

    const banHist = this.db
      .select()
      .from(schema.banHistory)
      .where(eq(schema.banHistory.banned, id))
      .orderBy(desc(schema.banHistory.created))
      .limit(25)
      .all();

    const kickHist = this.db
      .select()
      .from(schema.kickHistory)
      .where(eq(schema.kickHistory.kicked, id))
      .orderBy(desc(schema.kickHistory.created))
      .limit(25)
      .all();

    const noteRows = this.db
      .select()
      .from(schema.playerNotes)
      .where(eq(schema.playerNotes.playerId, id))
      .limit(25)
      .all();

    return {
      ...this._toUserHistory(player),
      banHistory: banHist.map(b => ({
        type: 'banHistory' as const,
        _id: String(b.id),
        banned: b.banned,
        bannerId: b.bannerId,
        created: b.created,
        expires: b.expires,
        reason: b.reason,
      })),
      kickHistory: kickHist.map(k => ({
        type: 'kickHistory' as const,
        _id: String(k.id),
        kicked: k.kicked,
        kickerId: k.kickerId,
        created: k.created,
        reason: k.reason,
      })),
      notes: noteRows.map(n => ({
        type: 'note' as const,
        _id: String(n.id),
        id: n.playerId,
        note: n.note,
      })),
    };
  }

  // add a user to the visit history, returns true if this is a first visit
  async addVisit(user: Required<IPlayer>) {
    const now = Date.now();
    // resolve the instance id before opening the transaction — the tx callback
    // must stay synchronous, and this is the only await in the method
    const instanceId = await this.getInstanceId();

    // read-modify-write the row atomically so two near-simultaneous joins for
    // the same id can't both insert (PK conflict) or clobber each other's
    // nameHistory/counter updates from a shared stale snapshot
    const visit = this.sqlite.transaction(() => {
      const existing = this.db
        .select()
        .from(schema.playerHistory)
        .where(eq(schema.playerHistory.id, user.id))
        .get();

      if (!existing) {
        this.db
          .insert(schema.playerHistory)
          .values({
            id: user.id,
            name: user.name,
            displayName: user.displayName,
            nameHistory: [
              { name: user.name, displayName: user.displayName, date: now },
            ],
            ips: [],
            created: now,
            lastSeen: now,
            lastInstanceId: instanceId,
            heartbeats: 0,
            sessions: 1,
            instances: 1,
          })
          .run();
        return true;
      }

      const nameHistory = (existing.nameHistory ?? []) as {
        name: string;
        displayName: string;
        date: number;
      }[];
      const hasName = nameHistory.some(
        h => h.name === user.name && h.displayName === user.displayName,
      );
      if (!hasName) {
        nameHistory.push({
          name: user.name,
          displayName: user.displayName,
          date: now,
        });
      }

      this.db
        .update(schema.playerHistory)
        .set({
          lastSeen: now,
          name: user.name,
          displayName: user.displayName,
          lastInstanceId: instanceId,
          nameHistory,
          sessions: sql`${schema.playerHistory.sessions} + ${existing.lastSeen < now - 60 * 60 * 1000 ? 1 : 0}`,
          instances: sql`${schema.playerHistory.instances} + ${existing.lastInstanceId !== instanceId ? 1 : 0}`,
        })
        .where(eq(schema.playerHistory.id, existing.id))
        .run();
      return false;
    });

    return visit();
  }

  // use data from minutely heartbeats to fuel metrics
  async addHeartbeat(data: {
    bricks: number;
    players: string[];
    ips: Record<string, string>;
  }) {
    const now = Date.now();
    const tx = this.sqlite.transaction(() => {
      this.db
        .insert(schema.heartbeats)
        .values({
          created: now,
          bricks: data.bricks,
          players: data.players,
        })
        .run();

      if (data.players.length > 0) {
        // one bulk UPDATE for the shared lastSeen/heartbeats bump
        this.db
          .update(schema.playerHistory)
          .set({
            lastSeen: now,
            heartbeats: sql`${schema.playerHistory.heartbeats} + 1`,
          })
          .where(inArray(schema.playerHistory.id, data.players))
          .run();

        const players = this.db
          .select()
          .from(schema.playerHistory)
          .where(inArray(schema.playerHistory.id, data.players))
          .all();

        for (const p of players) {
          const ip = data.ips[p.id];
          if (ip && !((p.ips ?? []) as string[]).includes(ip)) {
            const ips = [...((p.ips ?? []) as string[]), ip];
            this.db
              .update(schema.playerHistory)
              .set({ ips })
              .where(eq(schema.playerHistory.id, p.id))
              .run();
          }
        }
      }
    });
    tx();
  }

  upsertBanHistory(entry: Omit<IStoreBanHistory, 'type'>) {
    this.db
      .insert(schema.banHistory)
      .values({
        banned: entry.banned,
        bannerId: entry.bannerId ?? '',
        created: typeof entry.created === 'number' ? entry.created : 0,
        expires: typeof entry.expires === 'number' ? entry.expires : 0,
        reason: entry.reason ?? '',
      })
      .onConflictDoNothing()
      .run();
  }

  upsertKickHistory(entry: Omit<IStoreKickHistory, 'type'>) {
    this.db
      .insert(schema.kickHistory)
      .values({
        kicked: entry.kicked,
        kickerId: entry.kickerId ?? '',
        created: entry.created ?? 0,
        reason: entry.reason ?? '',
      })
      .onConflictDoNothing()
      .run();
  }

  async getAutoRestartConfig(): Promise<IStoreAutoRestartConfig> {
    const row = this.db
      .select()
      .from(schema.serverConfig)
      .where(eq(schema.serverConfig.key, 'autoRestartConfig'))
      .get();
    if (!row) {
      const config: IStoreAutoRestartConfig = {
        type: 'autoRestartConfig',
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
      };
      this.db
        .insert(schema.serverConfig)
        .values({ key: 'autoRestartConfig', value: config })
        .run();
      return config;
    }
    const config = row.value as IStoreAutoRestartConfig;
    config.type = 'autoRestartConfig';
    config.autoUpdateEnabled ??= true;
    config.autoUpdateIntervalMins ??= 60;
    config.saveWorld ??= true;
    config.crashRestartEnabled ??= true;
    return config;
  }

  async setAutoRestartConfig(config: IStoreAutoRestartConfig): Promise<void> {
    config.maxUptime = Math.round(Math.max(1, Math.min(config.maxUptime, 168)));
    config.emptyUptime = Math.round(
      Math.max(1, Math.min(config.emptyUptime, 168)),
    );
    config.dailyHour = Math.round(Math.max(0, Math.min(config.dailyHour, 23)));
    config.autoUpdateIntervalMins = Math.round(
      Math.max(10, Math.min(config.autoUpdateIntervalMins ?? 60, Infinity)),
    );
    config.autoUpdateEnabled ??= true;
    this.db
      .insert(schema.serverConfig)
      .values({ key: 'autoRestartConfig', value: config })
      .onConflictDoUpdate({
        target: schema.serverConfig.key,
        set: { value: config },
      })
      .run();
  }

  // update player online-time punchcard
  async updatePlayerPunchcard(numNewPlayers: number) {
    const now = new Date();
    const time = now.getTime();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();
    const month = now.getUTCMonth();
    const year = now.getUTCFullYear();

    const card = this.db
      .select()
      .from(schema.punchcards)
      .where(
        and(
          eq(schema.punchcards.kind, 'playerCount'),
          eq(schema.punchcards.month, month),
          eq(schema.punchcards.year, year),
        ),
      )
      .get();

    if (!card) {
      const punchcard = createPunchcard();
      punchcard[day][hour] = numNewPlayers;
      this.db
        .insert(schema.punchcards)
        .values({
          kind: 'playerCount',
          created: time,
          updated: time,
          month,
          year,
          punchcard,
        })
        .run();
    } else {
      const punchcard = card.punchcard as number[][];
      punchcard[day][hour] += numNewPlayers;
      this.db
        .update(schema.punchcards)
        .set({ punchcard, updated: time })
        .where(eq(schema.punchcards.id, card.id))
        .run();
    }
  }

  private _toStoreUser(
    row: typeof schema.users.$inferSelect,
  ): IStoreUser & { id: string; _id: string } {
    const user: IStoreUser & { id: string; _id: string } = {
      type: 'user',
      id: row.id,
      _id: row.id,
      created: row.created,
      lastOnline: row.lastOnline,
      username: row.username,
      hash: row.hash,
      isOwner: row.isOwner,
      roles: (row.roles ?? []) as string[],
      playerId: row.playerId,
      isBanned: row.isBanned,
      permissions:
        (row.permissions as PermissionSet | null) ?? EMPTY_PERMISSIONS,
      totpSecret: row.totpSecret ?? undefined,
      totpEnabled: row.totpEnabled,
      passkeys: (row.passkeys ?? []) as IWebAuthnCredential[],
      recoveryCodes: (row.recoveryCodes ?? []) as string[],
    };
    return user;
  }

  private _toUserHistory(
    row: typeof schema.playerHistory.$inferSelect,
  ): IUserHistory & { _id: string } {
    return {
      type: 'userHistory',
      _id: row.id,
      id: row.id,
      name: row.name,
      displayName: row.displayName,
      nameHistory: (row.nameHistory ?? []) as {
        displayName: string;
        name: string;
        date: number;
      }[],
      ips: (row.ips ?? []) as string[],
      created: row.created,
      lastSeen: row.lastSeen,
      lastInstanceId: row.lastInstanceId,
      heartbeats: row.heartbeats,
      sessions: row.sessions,
      instances: row.instances,
    };
  }
}
