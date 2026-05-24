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

  SessionInfo: 'session.info',
} as const;

const S = ScopeName;
const D = ScopeDomain;

export const SCOPES = {
  // Chat
  [S.ChatSend]: {
    description: 'Send chat messages',
    readOnly: false,
    domain: D.Chat,
  },
  [S.ChatRecent]: {
    description: 'View recent chat messages',
    readOnly: true,
    domain: D.Chat,
  },
  [S.ChatHistory]: {
    description: 'View chat history',
    readOnly: true,
    domain: D.Chat,
  },
  [S.ChatCalendar]: {
    description: 'View chat calendar',
    readOnly: true,
    domain: D.Chat,
  },

  // Player
  [S.PlayerList]: {
    description: 'View player list',
    readOnly: true,
    domain: D.Player,
  },
  [S.PlayerGet]: {
    description: 'View player details',
    readOnly: true,
    domain: D.Player,
  },
  [S.PlayerBan]: {
    description: 'Ban players',
    readOnly: false,
    domain: D.Player,
  },
  [S.PlayerKick]: {
    description: 'Kick players',
    readOnly: false,
    domain: D.Player,
  },
  [S.PlayerUnban]: {
    description: 'Unban players',
    readOnly: false,
    domain: D.Player,
  },
  [S.PlayerClearBricks]: {
    description: 'Clear player bricks',
    readOnly: false,
    domain: D.Player,
  },

  // Plugin
  [S.PluginList]: {
    description: 'View plugin list',
    readOnly: true,
    domain: D.Plugin,
  },
  [S.PluginGet]: {
    description: 'View plugin details',
    readOnly: true,
    domain: D.Plugin,
  },
  [S.PluginConfig]: {
    description: 'Change plugin configuration',
    readOnly: false,
    domain: D.Plugin,
  },
  [S.PluginLoad]: {
    description: 'Load plugins',
    readOnly: false,
    domain: D.Plugin,
  },
  [S.PluginUnload]: {
    description: 'Unload plugins',
    readOnly: false,
    domain: D.Plugin,
  },
  [S.PluginToggle]: {
    description: 'Enable/disable plugins',
    readOnly: false,
    domain: D.Plugin,
  },
  [S.PluginReloadAll]: {
    description: 'Reload all plugins',
    readOnly: false,
    domain: D.Plugin,
  },

  // Server
  [S.ServerStatus]: {
    description: 'View server status',
    readOnly: true,
    domain: D.Server,
  },
  [S.ServerStart]: {
    description: 'Start the server',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerStop]: {
    description: 'Stop the server',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerRestart]: {
    description: 'Restart the server',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerUpdateCheck]: {
    description: 'Check for server updates',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerUpdateRun]: {
    description: 'Update the server',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerAutorestartGet]: {
    description: 'View auto-restart config',
    readOnly: true,
    domain: D.Server,
  },
  [S.ServerAutorestartSet]: {
    description: 'Change auto-restart config',
    readOnly: false,
    domain: D.Server,
  },
  [S.ServerUtilization]: {
    description: 'View current system utilization',
    readOnly: true,
    domain: D.Server,
  },

  // User
  [S.UserList]: {
    description: 'View web UI users',
    readOnly: true,
    domain: D.User,
  },
  [S.UserCreate]: {
    description: 'Create web UI users',
    readOnly: false,
    domain: D.User,
  },
  [S.UserPasswd]: {
    description: 'Change user passwords',
    readOnly: false,
    domain: D.User,
  },
  [S.UserBan]: {
    description: 'Disable/enable web UI users',
    readOnly: false,
    domain: D.User,
  },
  [S.UserDelete]: {
    description: 'Delete web UI users',
    readOnly: false,
    domain: D.User,
  },
  [S.UserPermissions]: {
    description: 'Manage user permissions',
    readOnly: false,
    domain: D.User,
  },

  // World
  [S.WorldList]: {
    description: 'View world list',
    readOnly: true,
    domain: D.World,
  },
  [S.WorldActive]: {
    description: 'View active world',
    readOnly: true,
    domain: D.World,
  },
  [S.WorldNext]: {
    description: 'View next world',
    readOnly: true,
    domain: D.World,
  },
  [S.WorldRevisions]: {
    description: 'View world revisions',
    readOnly: true,
    domain: D.World,
  },
  [S.WorldMeta]: {
    description: 'View world metadata',
    readOnly: true,
    domain: D.World,
  },
  [S.WorldLoad]: {
    description: 'Load worlds',
    readOnly: false,
    domain: D.World,
  },
  [S.WorldUse]: {
    description: 'Set default world',
    readOnly: false,
    domain: D.World,
  },
  [S.WorldSave]: {
    description: 'Save worlds',
    readOnly: false,
    domain: D.World,
  },
  [S.WorldCreate]: {
    description: 'Create worlds',
    readOnly: false,
    domain: D.World,
  },

  // Role
  [S.RoleList]: {
    description: 'View server roles',
    readOnly: true,
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

export const DOMAINS = [
  ...new Set(Object.values(SCOPES).map(s => s.domain)),
] as const;

export type Domain = (typeof DOMAINS)[number];
