export const SCOPES = {
  // Chat
  'chat.send': { description: 'Send chat messages' },
  'chat.recent': { description: 'View recent chat messages' },
  'chat.history': { description: 'View chat history' },
  'chat.calendar': { description: 'View chat calendar' },
  'chat.onMessage': { description: 'Receive live chat messages' },

  // Player
  'player.list': { description: 'View player list' },
  'player.get': { description: 'View player details' },
  'player.ban': { description: 'Ban players' },
  'player.kick': { description: 'Kick players' },
  'player.unban': { description: 'Unban players' },
  'player.clearBricks': { description: 'Clear player bricks' },

  // Plugin
  'plugin.list': { description: 'View plugin list' },
  'plugin.get': { description: 'View plugin details' },
  'plugin.config': { description: 'Change plugin configuration' },
  'plugin.load': { description: 'Load plugins' },
  'plugin.unload': { description: 'Unload plugins' },
  'plugin.toggle': { description: 'Enable/disable plugins' },
  'plugin.reloadAll': { description: 'Reload all plugins' },
  'plugin.onStatus': { description: 'Receive plugin status updates' },

  // Server
  'server.status': { description: 'View server status' },
  'server.started': { description: 'View server run state' },
  'server.start': { description: 'Start the server' },
  'server.stop': { description: 'Stop the server' },
  'server.restart': { description: 'Restart the server' },
  'server.update.check': { description: 'Check for server updates' },
  'server.update.run': { description: 'Update the server' },
  'server.autorestart.get': { description: 'View auto-restart config' },
  'server.autorestart.set': { description: 'Change auto-restart config' },
  'server.onStatus': { description: 'Receive server status updates' },
  'server.onHeartbeat': { description: 'Receive server heartbeat' },
  'server.utilization': { description: 'View current system utilization' },
  'server.onUtilization': { description: 'Receive system utilization metrics' },

  // User
  'user.list': { description: 'View web UI users' },
  'user.create': { description: 'Create web UI users' },
  'user.passwd': { description: 'Change user passwords' },

  // World
  'world.list': { description: 'View world list' },
  'world.active': { description: 'View active world' },
  'world.next': { description: 'View next world' },
  'world.revisions': { description: 'View world revisions' },
  'world.meta': { description: 'View world metadata' },
  'world.load': { description: 'Load worlds' },
  'world.use': { description: 'Set default world' },
  'world.save': { description: 'Save worlds' },
  'world.create': { description: 'Create worlds' },

  // Role
  'role.list': { description: 'View server roles' },

  // Session
  'session.info': { description: 'View session info' },
} as const;

export type Scope = keyof typeof SCOPES;
