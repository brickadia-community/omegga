import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { PermissionSet } from '@webserver/backend/permissions';
import type { IChatUser, IWebAuthnCredential } from '@webserver/backend/types';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  created: integer('created').notNull(),
  lastOnline: integer('last_online').notNull().default(0),
  username: text('username').notNull().unique(),
  hash: text('hash').notNull(),
  isOwner: integer('is_owner', { mode: 'boolean' }).notNull().default(false),
  roles: text('roles', { mode: 'json' })
    .notNull()
    .$type<string[]>()
    .default([]),
  playerId: text('player_id').notNull().default(''),
  isBanned: integer('is_banned', { mode: 'boolean' }).notNull().default(false),
  permissions: text('permissions', { mode: 'json' }).$type<PermissionSet>(),
  totpSecret: text('totp_secret'),
  totpEnabled: integer('totp_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
  passkeys: text('passkeys', { mode: 'json' })
    .notNull()
    .$type<IWebAuthnCredential[]>()
    .default([]),
  recoveryCodes: text('recovery_codes', { mode: 'json' })
    .notNull()
    .$type<string[]>()
    .default([]),
});

export const chatLogs = sqliteTable(
  'chat_logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    created: integer('created').notNull(),
    instanceId: text('instance_id').notNull(),
    action: text('action')
      .notNull()
      .$type<'msg' | 'server' | 'leave' | 'join'>(),
    user: text('user', { mode: 'json' }).notNull().$type<Partial<IChatUser>>(),
    message: text('message'),
  },
  table => [
    index('chat_logs_created_idx').on(table.created),
    index('chat_logs_instance_created_idx').on(table.instanceId, table.created),
  ],
);

export const playerHistory = sqliteTable(
  'player_history',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    nameHistory: text('name_history', { mode: 'json' })
      .notNull()
      .$type<{ displayName: string; name: string; date: number }[]>()
      .default([]),
    ips: text('ips', { mode: 'json' }).notNull().$type<string[]>().default([]),
    created: integer('created').notNull(),
    lastSeen: integer('last_seen').notNull(),
    lastInstanceId: text('last_instance_id').notNull(),
    heartbeats: integer('heartbeats').notNull().default(0),
    sessions: integer('sessions').notNull().default(0),
    instances: integer('instances').notNull().default(0),
  },
  table => [
    index('player_history_name_idx').on(table.name),
    index('player_history_display_name_idx').on(table.displayName),
    index('player_history_last_seen_idx').on(table.lastSeen),
  ],
);

export const banHistory = sqliteTable(
  'ban_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    banned: text('banned').notNull(),
    bannerId: text('banner_id').notNull().default(''),
    created: integer('created').notNull().default(0),
    expires: integer('expires').notNull().default(0),
    reason: text('reason').notNull().default(''),
  },
  table => [
    // includes expires so a ban whose expiry is edited is recorded as a new
    // history entry instead of being dropped by onConflictDoNothing
    uniqueIndex('ban_history_unique_idx').on(
      table.banned,
      table.bannerId,
      table.created,
      table.expires,
      table.reason,
    ),
    index('ban_history_banned_created_idx').on(table.banned, table.created),
  ],
);

export const kickHistory = sqliteTable(
  'kick_history',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kicked: text('kicked').notNull(),
    kickerId: text('kicker_id').notNull().default(''),
    created: integer('created').notNull(),
    reason: text('reason').notNull().default(''),
  },
  table => [
    uniqueIndex('kick_history_unique_idx').on(
      table.kicked,
      table.kickerId,
      table.created,
      table.reason,
    ),
    index('kick_history_kicked_created_idx').on(table.kicked, table.created),
  ],
);

export const playerNotes = sqliteTable(
  'player_notes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    playerId: text('player_id').notNull(),
    note: text('note').notNull(),
  },
  table => [index('player_notes_player_id_idx').on(table.playerId)],
);

export const serverInstances = sqliteTable('server_instances', {
  id: text('id').primaryKey(),
  date: integer('date').notNull(),
});

export const serverConfig = sqliteTable('server_config', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull().$type<unknown>(),
});

export const webRoles = sqliteTable('web_roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  order: integer('order').notNull(),
  permissions: text('permissions', { mode: 'json' })
    .notNull()
    .$type<PermissionSet>(),
});

export const heartbeats = sqliteTable(
  'heartbeats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    created: integer('created').notNull(),
    bricks: integer('bricks').notNull(),
    players: text('players', { mode: 'json' })
      .notNull()
      .$type<string[]>()
      .default([]),
  },
  table => [index('heartbeats_created_idx').on(table.created)],
);

export const punchcards = sqliteTable(
  'punchcards',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind').notNull(),
    created: integer('created').notNull(),
    updated: integer('updated').notNull(),
    month: integer('month').notNull(),
    year: integer('year').notNull(),
    punchcard: text('punchcard', { mode: 'json' })
      .notNull()
      .$type<number[][]>(),
  },
  table => [
    uniqueIndex('punchcards_kind_month_year_idx').on(
      table.kind,
      table.month,
      table.year,
    ),
  ],
);
