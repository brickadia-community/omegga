module.exports = {
  DEFAULT_PORT: 8080,

  // filenames that omegga searches for
  // extensions are added based on the available config formats
  CONFIG_FILENAMES: [
    'omegga-config',
    'omegga',
    '.omegga-config',
    '.omegga',
  ],

  // path to certain info folders
  DATA_PATH: './data',
  PLUGIN_PATH: './plugins',

  // databases
  CHAT_STORE: 'chat.db',
  PLAYER_STORE: 'players.db',
  PLUGIN_STORE: 'plugins.db',
  STATUS_STORE: 'status.db',
  USER_STORE: 'users.db',

  // website config
  WEB_PLUGIN_API_ROUTE: '/plugin/api/v1/websocket',
};
