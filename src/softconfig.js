const path = require('path');
const os = require('os');

const PROJECT_NAME = 'omegga';
const CONFIG_HOME = path.join(os.homedir(), '.config/' + PROJECT_NAME);


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
  CONFIG_HOME,
  LOCAL_LAUNCHER: path.join(CONFIG_HOME, 'launcher/brickadia-launcher/main-brickadia-launcher'),

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

  // plugin data
  PLUGIN_FILE: './plugin.json',
  // post install file
  PLUGIN_POSTINSTALL: './setup.sh',

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

  // how often server status is requested in a heartbeat
  METRIC_HEARTBEAT_INTERVAL: 60 * 1000,
  // the number of empty server statuses before metric logging is paused
  METRIC_EMPTIES_BEFORE_PAUSE: 3,
};
