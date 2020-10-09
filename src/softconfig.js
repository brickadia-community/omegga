const path = require('path');
const os = require('os');

const PROJECT_NAME = 'omegga';

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

  // home directory for omegga config
  PROJECT_NAME,
  CONFIG_HOME: path.join(os.homedir(), '.config/' + PROJECT_NAME),
  // path to auth files
  CONFIG_AUTH_DIR: 'Auth',
  // files in Brickadia/Saved/Auth
  BRICKADIA_AUTH_FILES: [
    'OfflinePayload.bin',
    'OfflineSignature.bin',
    'SessionToken.bin',
  ],

  // temporary install for generating auth files
  TEMP_DIR_NAME: '.omegga-temp-data',

  // path to certain info folders
  DATA_PATH: './data',
  PLUGIN_PATH: './plugins',

  // databases
  CHAT_STORE: 'chat.db',
  PLAYER_STORE: 'players.db',
  PLUGIN_STORE: 'plugins.db',
  STATUS_STORE: 'status.db',
  USER_STORE: 'users.db',
  SERVER_STORE: 'store.db',
  SESSION_STORE: 'session.db',

  // website config
  WEB_CERTS_DATA: 'web_certs.json',
  WEB_SESSION_TOKEN: 'web_session_token',
};
