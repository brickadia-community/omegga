import os from 'os';
import path from 'path';

// home directory for omegga config
export const PROJECT_NAME = 'omegga';
export const CONFIG_HOME = path.join(os.homedir(), '.config/' + PROJECT_NAME);

export const DEFAULT_PORT = 8080;

// filenames that omegga searches for
// extensions are added based on the available config formats
export const CONFIG_FILENAMES = [
  'omegga-config',
  'omegga',
  '.omegga-config',
  '.omegga',
];

export const BRICKADIA_INSTALLS = path.join(
  os.homedir(),
  '.local/share/brickadia-launcher/brickadia-installs'
);

export const LOCAL_LAUNCHER = path.join(
  CONFIG_HOME,
  'launcher/brickadia-launcher/main-brickadia-launcher'
);

// path to auth files
export const CONFIG_AUTH_DIR = 'Auth';
// files in Brickadia/Saved/Auth
export const BRICKADIA_AUTH_FILES = [
  'OfflinePayload.bin',
  'OfflineSignature.bin',
  'SessionToken.bin',
];

// temporary install for generating auth files
export const TEMP_DIR_NAME = '.omegga-temp-data';

// path to certain info folders
export const DATA_PATH = './data';
export const PLUGIN_PATH = './plugins';

// plugin data
export const PLUGIN_FILE = './plugin.json';
// post install file
export const PLUGIN_POSTINSTALL = './setup.sh';

// databases
export const CHAT_STORE = 'chat.db';
export const PLAYER_STORE = 'players.db';
export const PLUGIN_STORE = 'plugins.db';
export const STATUS_STORE = 'status.db';
export const USER_STORE = 'users.db';
export const SERVER_STORE = 'store.db';
export const SESSION_STORE = 'session.db';

// website config
export const WEB_CERTS_DATA = 'web_certs.json';
export const WEB_SESSION_TOKEN = 'web_session_token';

// how often server status is requested in a heartbeat
export const METRIC_HEARTBEAT_INTERVAL = 60 * 1000;
// the number of empty server statuses before metric logging is paused
export const METRIC_EMPTIES_BEFORE_PAUSE = 3;

// rexport as default
export default {
  PROJECT_NAME,
  CONFIG_HOME,
  DEFAULT_PORT,
  CONFIG_FILENAMES,
  BRICKADIA_INSTALLS,
  LOCAL_LAUNCHER,
  CONFIG_AUTH_DIR,
  BRICKADIA_AUTH_FILES,
  TEMP_DIR_NAME,
  DATA_PATH,
  PLUGIN_PATH,
  PLUGIN_FILE,
  PLUGIN_POSTINSTALL,
  CHAT_STORE,
  PLAYER_STORE,
  PLUGIN_STORE,
  STATUS_STORE,
  USER_STORE,
  SERVER_STORE,
  SESSION_STORE,
  WEB_CERTS_DATA,
  WEB_SESSION_TOKEN,
  METRIC_HEARTBEAT_INTERVAL,
  METRIC_EMPTIES_BEFORE_PAUSE,
};
