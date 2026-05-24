export const Permissions = {
  // Chat
  ChatSend: 'chat.send',
  ChatRecent: 'chat.recent',
  ChatHistory: 'chat.history',
  ChatCalendar: 'chat.calendar',

  // Player
  PlayerList: 'player.list',
  PlayerGet: 'player.get',
  PlayerBan: 'player.ban',
  PlayerKick: 'player.kick',
  PlayerUnban: 'player.unban',
  PlayerClearBricks: 'player.clearBricks',

  // Plugin
  PluginList: 'plugin.list',
  PluginGet: 'plugin.get',
  PluginConfig: 'plugin.config',
  PluginLoad: 'plugin.load',
  PluginUnload: 'plugin.unload',
  PluginToggle: 'plugin.toggle',
  PluginReloadAll: 'plugin.reloadAll',

  // Server
  ServerStatus: 'server.status',
  ServerStart: 'server.start',
  ServerStop: 'server.stop',
  ServerRestart: 'server.restart',
  ServerUpdateCheck: 'server.update.check',
  ServerUpdateRun: 'server.update.run',
  ServerAutorestartGet: 'server.autorestart.get',
  ServerAutorestartSet: 'server.autorestart.set',
  ServerUtilization: 'server.utilization',

  // User
  UserList: 'user.list',
  UserCreate: 'user.create',
  UserPasswd: 'user.passwd',
  UserBan: 'user.ban',
  UserDelete: 'user.delete',
  UserPermissions: 'user.permissions',
  UserReadMfa: 'user.readMfa',
  UserResetMfa: 'user.resetMfa',

  // World
  WorldList: 'world.list',
  WorldActive: 'world.active',
  WorldNext: 'world.next',
  WorldRevisions: 'world.revisions',
  WorldMeta: 'world.meta',
  WorldLoad: 'world.load',
  WorldUse: 'world.use',
  WorldSave: 'world.save',
  WorldCreate: 'world.create',

  // Role
  RoleList: 'role.list',

  // Session
  SessionInfo: 'session.info',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const Domains = {
  Chat: 'chat',
  Player: 'player',
  Plugin: 'plugin',
  Server: 'server',
  User: 'user',
  World: 'world',
} as const;

export type Domain = (typeof Domains)[keyof typeof Domains];

export const DOMAIN_LABELS: Record<string, string> = {
  chat: 'Chat',
  player: 'Player',
  plugin: 'Plugin',
  server: 'Server',
  user: 'User',
  world: 'World',
};

export const DOMAIN_ORDER: Domain[] = [
  Domains.Chat,
  Domains.Player,
  Domains.Plugin,
  Domains.Server,
  Domains.User,
  Domains.World,
];

export const SCOPE_INFO: Partial<
  Record<Permission, { description: string; readOnly: boolean; domain: Domain }>
> = {
  [Permissions.ChatSend]: {
    description: 'Send messages in the dashboard chat widget',
    readOnly: false,
    domain: Domains.Chat,
  },
  [Permissions.ChatRecent]: {
    description: 'View recent chat on the dashboard',
    readOnly: true,
    domain: Domains.Chat,
  },
  [Permissions.ChatHistory]: {
    description: 'Browse past chat logs in the history view',
    readOnly: true,
    domain: Domains.Chat,
  },
  [Permissions.ChatCalendar]: {
    description: 'Navigate chat by date in the history view',
    readOnly: true,
    domain: Domains.Chat,
  },
  [Permissions.PlayerList]: {
    description: 'View the player list in the players view',
    readOnly: true,
    domain: Domains.Player,
  },
  [Permissions.PlayerGet]: {
    description: 'Inspect player details and history',
    readOnly: true,
    domain: Domains.Player,
  },
  [Permissions.PlayerBan]: {
    description: 'Ban players from the player inspector',
    readOnly: false,
    domain: Domains.Player,
  },
  [Permissions.PlayerKick]: {
    description: 'Kick players from the player inspector',
    readOnly: false,
    domain: Domains.Player,
  },
  [Permissions.PlayerUnban]: {
    description: 'Unban players from the player inspector',
    readOnly: false,
    domain: Domains.Player,
  },
  [Permissions.PlayerClearBricks]: {
    description: "Clear a player's bricks from the player inspector",
    readOnly: false,
    domain: Domains.Player,
  },
  [Permissions.PluginList]: {
    description: 'View installed plugins in the plugins view',
    readOnly: true,
    domain: Domains.Plugin,
  },
  [Permissions.PluginGet]: {
    description: 'Inspect plugin details and configuration',
    readOnly: true,
    domain: Domains.Plugin,
  },
  [Permissions.PluginConfig]: {
    description: 'Edit plugin settings in the plugin inspector',
    readOnly: false,
    domain: Domains.Plugin,
  },
  [Permissions.PluginLoad]: {
    description: 'Load plugins from the plugin inspector',
    readOnly: false,
    domain: Domains.Plugin,
  },
  [Permissions.PluginUnload]: {
    description: 'Unload plugins from the plugin inspector',
    readOnly: false,
    domain: Domains.Plugin,
  },
  [Permissions.PluginToggle]: {
    description: 'Enable or disable plugins in the plugins view',
    readOnly: false,
    domain: Domains.Plugin,
  },
  [Permissions.PluginReloadAll]: {
    description: 'Reload all plugins from the plugins view',
    readOnly: false,
    domain: Domains.Plugin,
  },
  [Permissions.ServerStatus]: {
    description: 'View server status on the dashboard and server view',
    readOnly: true,
    domain: Domains.Server,
  },
  [Permissions.ServerStart]: {
    description: 'Start the server from the server view',
    readOnly: false,
    domain: Domains.Server,
  },
  [Permissions.ServerStop]: {
    description: 'Stop the server from the server view',
    readOnly: false,
    domain: Domains.Server,
  },
  [Permissions.ServerRestart]: {
    description: 'Restart the server from the server view',
    readOnly: false,
    domain: Domains.Server,
  },
  [Permissions.ServerUpdateCheck]: {
    description: 'Check for server updates in the server view',
    readOnly: false,
    domain: Domains.Server,
  },
  [Permissions.ServerUpdateRun]: {
    description: 'Run server updates from the server view',
    readOnly: false,
    domain: Domains.Server,
  },
  [Permissions.ServerAutorestartGet]: {
    description: 'View auto-restart settings in the server view',
    readOnly: true,
    domain: Domains.Server,
  },
  [Permissions.ServerAutorestartSet]: {
    description: 'Change auto-restart settings in the server view',
    readOnly: false,
    domain: Domains.Server,
  },
  [Permissions.ServerUtilization]: {
    description: 'View CPU, memory, and disk usage on the dashboard',
    readOnly: true,
    domain: Domains.Server,
  },
  [Permissions.UserList]: {
    description: 'View web UI user accounts in the users view',
    readOnly: true,
    domain: Domains.User,
  },
  [Permissions.UserCreate]: {
    description: 'Create new user accounts in the users view',
    readOnly: false,
    domain: Domains.User,
  },
  [Permissions.UserPasswd]: {
    description: 'Change user passwords in the users view',
    readOnly: false,
    domain: Domains.User,
  },
  [Permissions.UserBan]: {
    description: 'Disable or re-enable users in the user inspector',
    readOnly: false,
    domain: Domains.User,
  },
  [Permissions.UserDelete]: {
    description: 'Permanently delete user accounts',
    readOnly: false,
    domain: Domains.User,
  },
  [Permissions.UserPermissions]: {
    description: 'Edit user and default permissions in the users view',
    readOnly: false,
    domain: Domains.User,
  },
  [Permissions.UserReadMfa]: {
    description: 'View MFA status of other users in the user inspector',
    readOnly: true,
    domain: Domains.User,
  },
  [Permissions.UserResetMfa]: {
    description: 'Reset MFA for other users in the user inspector',
    readOnly: false,
    domain: Domains.User,
  },
  [Permissions.WorldList]: {
    description: 'View available worlds in the worlds view',
    readOnly: true,
    domain: Domains.World,
  },
  [Permissions.WorldActive]: {
    description: 'See which world is currently loaded',
    readOnly: true,
    domain: Domains.World,
  },
  [Permissions.WorldNext]: {
    description: 'See which world will load next',
    readOnly: true,
    domain: Domains.World,
  },
  [Permissions.WorldRevisions]: {
    description: 'View world save revisions in the world inspector',
    readOnly: true,
    domain: Domains.World,
  },
  [Permissions.WorldMeta]: {
    description: 'View world metadata in the world inspector',
    readOnly: true,
    domain: Domains.World,
  },
  [Permissions.WorldLoad]: {
    description: 'Load worlds from the world inspector',
    readOnly: false,
    domain: Domains.World,
  },
  [Permissions.WorldUse]: {
    description: 'Set the default world in the worlds view',
    readOnly: false,
    domain: Domains.World,
  },
  [Permissions.WorldSave]: {
    description: 'Save the current world from the worlds or server view',
    readOnly: false,
    domain: Domains.World,
  },
  [Permissions.WorldCreate]: {
    description: 'Create new worlds in the worlds view',
    readOnly: false,
    domain: Domains.World,
  },
};

export const SCOPES_BY_DOMAIN: Record<string, Permission[]> = {};
for (const [scope, info] of Object.entries(SCOPE_INFO)) {
  (SCOPES_BY_DOMAIN[info.domain] ??= []).push(scope as Permission);
}
