export const ScopeDomain = {
  Chat: 'chat',
  Player: 'player',
  Plugin: 'plugin',
  Server: 'server',
  User: 'user',
  World: 'world',
  Role: 'role',
  Session: 'session',
} as const;

export const ScopeName = {
  ChatSend: 'chat.send',
  ChatRecent: 'chat.recent',
  ChatHistory: 'chat.history',
  ChatCalendar: 'chat.calendar',

  PlayerList: 'player.list',
  PlayerGet: 'player.get',
  PlayerBan: 'player.ban',
  PlayerKick: 'player.kick',
  PlayerUnban: 'player.unban',
  PlayerClearBricks: 'player.clearBricks',

  PluginList: 'plugin.list',
  PluginGet: 'plugin.get',
  PluginConfig: 'plugin.config',
  PluginLoad: 'plugin.load',
  PluginUnload: 'plugin.unload',
  PluginToggle: 'plugin.toggle',
  PluginReloadAll: 'plugin.reloadAll',

  ServerStatus: 'server.status',
  ServerStart: 'server.start',
  ServerStop: 'server.stop',
  ServerRestart: 'server.restart',
  ServerUpdateCheck: 'server.update.check',
  ServerUpdateRun: 'server.update.run',
  ServerAutorestartGet: 'server.autorestart.get',
  ServerAutorestartSet: 'server.autorestart.set',
  ServerUtilization: 'server.utilization',

  UserList: 'user.list',
  UserCreate: 'user.create',
  UserPasswd: 'user.passwd',
  UserBan: 'user.ban',
  UserDelete: 'user.delete',
  UserPermissions: 'user.permissions',
  UserGrantRole: 'user.grantRole',
  UserReadMfa: 'user.readMfa',
  UserResetMfa: 'user.resetMfa',

  WorldList: 'world.list',
  WorldActive: 'world.active',
  WorldNext: 'world.next',
  WorldRevisions: 'world.revisions',
  WorldMeta: 'world.meta',
  WorldLoad: 'world.load',
  WorldUse: 'world.use',
  WorldSave: 'world.save',
  WorldCreate: 'world.create',

  RoleList: 'role.list',
  RoleEdit: 'role.edit',
  RoleDefaultPermissions: 'role.defaultPermissions',
  RoleGrantPermission: 'role.grantPermission',

  SessionInfo: 'session.info',
} as const;

const S = ScopeName;
const D = ScopeDomain;

export const SCOPES = {
  // Chat
  [S.ChatSend]: {
    description: 'Send messages in the dashboard chat widget',
    readOnly: false,
    domain: D.Chat,
  },
  [S.ChatRecent]: {
    description: 'View recent chat on the dashboard',
    readOnly: true,
    domain: D.Chat,
  },
  [S.ChatHistory]: {
    description: 'Browse past chat logs in the history view',
    readOnly: true,
    domain: D.Chat,
  },
  [S.ChatCalendar]: {
    description: 'Navigate chat by date in the history view',
    readOnly: true,
    domain: D.Chat,
  },

  // Player
  [S.PlayerList]: {
    description: 'View the player list in the players view',
    readOnly: true,
    domain: D.Player,
  },
  [S.PlayerGet]: {
    description: 'Inspect player details and history',
    readOnly: true,
    domain: D.Player,
  },
  [S.PlayerBan]: {
    description: 'Ban players from the player inspector',
    readOnly: false,
    domain: D.Player,
  },
  [S.PlayerKick]: {
    description: 'Kick players from the player inspector',
    readOnly: false,
    domain: D.Player,
  },
  [S.PlayerUnban]: {
    description: 'Unban players from the player inspector',
    readOnly: false,
    domain: D.Player,
  },
  [S.PlayerClearBricks]: {
    description: "Clear a player's bricks from the player inspector",
    readOnly: false,
    domain: D.Player,
  },

  // Plugin
  [S.PluginList]: {
    description: 'View installed plugins in the plugins view',
    readOnly: true,
    domain: D.Plugin,
  },
  [S.PluginGet]: {
    description: 'Inspect plugin details and configuration',
    readOnly: true,
    domain: D.Plugin,
  },
  [S.PluginConfig]: {
    description: 'Edit plugin settings in the plugin inspector',
    readOnly: false,
    domain: D.Plugin,
  },
  [S.PluginLoad]: {
    description: 'Load plugins from the plugin inspector',
    readOnly: false,
    domain: D.Plugin,
  },
  [S.PluginUnload]: {
    description: 'Unload plugins from the plugin inspector',
    readOnly: false,
    domain: D.Plugin,
  },
  [S.PluginToggle]: {
    description: 'Enable or disable plugins in the plugins view',
    readOnly: false,
    domain: D.Plugin,
  },
  [S.PluginReloadAll]: {
    description: 'Reload all plugins from the plugins view',
    readOnly: false,
    domain: D.Plugin,
  },

  // Server
  [S.ServerStatus]: {
    description: 'View server status on the dashboard and server view',
    readOnly: true,
    domain: D.Server,
  },
  [S.ServerStart]: {
    description: 'Start the server from the server view',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerStop]: {
    description: 'Stop the server from the server view',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerRestart]: {
    description: 'Restart the server from the server view',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerUpdateCheck]: {
    description: 'Check for server updates in the server view',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerUpdateRun]: {
    description: 'Run server updates from the server view',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerAutorestartGet]: {
    description: 'View auto-restart settings in the server view',
    readOnly: true,
    domain: D.Server,
  },
  [S.ServerAutorestartSet]: {
    description: 'Change auto-restart settings in the server view',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerUtilization]: {
    description: 'View CPU, memory, and disk usage on the dashboard',
    readOnly: true,
    domain: D.Server,
  },

  // User
  [S.UserList]: {
    description: 'View web UI user accounts in the users view',
    readOnly: true,
    domain: D.User,
  },
  [S.UserCreate]: {
    description: 'Create new user accounts in the users view',
    readOnly: false,
    domain: D.User,
  },
  [S.UserPasswd]: {
    description: 'Change user passwords in the users view',
    readOnly: false,
    domain: D.User,
  },
  [S.UserBan]: {
    description: 'Disable or re-enable users in the user inspector',
    readOnly: false,
    domain: D.User,
  },
  [S.UserDelete]: {
    description: 'Permanently delete user accounts',
    readOnly: false,
    domain: D.User,
  },
  [S.UserPermissions]: {
    description: 'Edit user permissions in the users view',
    readOnly: false,
    domain: D.User,
  },
  [S.UserGrantRole]: {
    description: 'Assign and revoke roles to/from users',
    readOnly: false,
    domain: D.User,
  },
  [S.UserReadMfa]: {
    description: 'View MFA status of other users in the user inspector',
    readOnly: true,
    domain: D.User,
  },
  [S.UserResetMfa]: {
    description: 'Reset MFA for other users in the user inspector',
    readOnly: false,
    domain: D.User,
  },

  // World
  [S.WorldList]: {
    description: 'View available worlds in the worlds view',
    readOnly: true,
    domain: D.World,
  },
  [S.WorldActive]: {
    description: 'See which world is currently loaded',
    readOnly: true,
    domain: D.World,
  },
  [S.WorldNext]: {
    description: 'See which world will load next',
    readOnly: true,
    domain: D.World,
  },
  [S.WorldRevisions]: {
    description: 'View world save revisions in the world inspector',
    readOnly: true,
    domain: D.World,
  },
  [S.WorldMeta]: {
    description: 'View world metadata in the world inspector',
    readOnly: true,
    domain: D.World,
  },
  [S.WorldLoad]: {
    description: 'Load worlds from the world inspector',
    readOnly: false,
    domain: D.World,
  },
  [S.WorldUse]: {
    description: 'Set the default world in the worlds view',
    readOnly: false,
    domain: D.World,
  },
  [S.WorldSave]: {
    description: 'Save the current world from the worlds or server view',
    readOnly: false,
    domain: D.World,
  },
  [S.WorldCreate]: {
    description: 'Create new worlds in the worlds view',
    readOnly: false,
    domain: D.World,
  },

  // Role
  [S.RoleList]: {
    description: 'View roles in the roles view',
    readOnly: true,
    domain: D.Role,
  },
  [S.RoleEdit]: {
    description: 'Create, edit, delete, and reorder roles',
    readOnly: false,
    domain: D.Role,
  },
  [S.RoleDefaultPermissions]: {
    description: 'Edit the default permissions that apply to all users',
    readOnly: false,
    domain: D.Role,
  },
  [S.RoleGrantPermission]: {
    description: 'Add or remove permissions within roles',
    readOnly: false,
    domain: D.Role,
  },

  // Session
  [S.SessionInfo]: {
    description: 'View session info',
    readOnly: true,
    domain: D.Session,
  },
} as const;

export type Scope = keyof typeof SCOPES;

export const DOMAIN_LABELS: Record<string, string> = {
  [D.Chat]: 'Chat',
  [D.Player]: 'Player',
  [D.Plugin]: 'Plugin',
  [D.Server]: 'Server',
  [D.User]: 'User',
  [D.World]: 'World',
  [D.Role]: 'Role',
};

export const DOMAIN_ORDER = [
  D.Chat,
  D.Player,
  D.Plugin,
  D.Server,
  D.User,
  D.World,
  D.Role,
] as const;

export const DOMAINS = [
  ...new Set(Object.values(SCOPES).map(s => s.domain)),
] as const;

export type Domain = (typeof DOMAINS)[number];

export const SCOPES_BY_DOMAIN: Record<string, Scope[]> = {};
for (const [scope, info] of Object.entries(SCOPES)) {
  (SCOPES_BY_DOMAIN[info.domain] ??= []).push(scope as Scope);
}
