import os from 'os';
import path from 'path';

// home directory for omegga config
export const PROJECT_NAME = 'omegga';
export const CONFIG_HOME = path.join(os.homedir(), '.config/' + PROJECT_NAME);
export const GLOBAL_TOKEN = path.join(CONFIG_HOME, 'global_auth_token');

export const DEFAULT_PORT = 8080;

// prometheus metrics endpoint defaults. it binds to loopback because the
// endpoint is unauthenticated unless a token is configured
export const METRICS_DEFAULTS = {
  bind: '127.0.0.1',
  port: 9000,
  path: '/metrics',
  /** seconds a cached server status may age before a scrape refreshes it */
  statusMaxAge: 15,
  /** how often a plugin worker ships its metric snapshot to the host */
  pluginFlushInterval: 5000,
};

// reading metrics back out of a prometheus that scrapes omegga, for the web
// UI's metrics dashboards. separate from METRICS_DEFAULTS, which describes the
// endpoint omegga serves rather than the one it queries
export const PROMETHEUS_DEFAULTS = {
  url: 'http://127.0.0.1:9090',
  /** seconds before a query is abandoned; prometheus is local, so slow means broken */
  timeout: 3,
  /** seconds a dashboard's results are reused, matching a typical scrape interval */
  cacheSeconds: 15,
  /** how far back the range picker may reach, matching prometheus' retention */
  retentionDays: 15,
  /** roughly one point per few pixels of chart width */
  maxPoints: 400,
  /** smallest step prometheus is asked for, matching a typical scrape interval */
  minStep: 15,
};

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
  '.local/share/brickadia-launcher/brickadia-installs',
);

export const STEAM_DIR = path.join(CONFIG_HOME, 'steam');
export const STEAMCMD_PATH = path.join(STEAM_DIR, 'steamcmd.sh');
export const DEFAULT_STEAM_APP_ID = '3017590'; // Brickadia app ID
export function getAppId() {
  return process.env.STEAM_APP_ID ?? DEFAULT_STEAM_APP_ID;
}
export const GAME_BIN_PATH = 'Binaries/Linux/BrickadiaServer-Linux-Shipping';
export const LOCAL_LAUNCHER = path.join(
  CONFIG_HOME,
  'launcher/brickadia-launcher/main-brickadia-launcher',
);

export const getOverrideGameDir = () => process.env.BRICKADIA_DIR;
export function getOverrideGameBinary() {
  const overrideDir = getOverrideGameDir();
  if (!overrideDir) return null;
  return path.join(overrideDir, GAME_BIN_PATH);
}
export function getSteamGameDir() {
  let GAME_DIR = 'Brickadia';
  if (process.env.STEAM_GAME_DIR) GAME_DIR = process.env.STEAM_GAME_DIR;
  return process.env.STEAM_GAME_DIR ?? GAME_DIR;
}
export function getSteamInstallDir() {
  let INSTALL_DIR = path.join(CONFIG_HOME, 'steam_installs');
  if (process.env.STEAM_INSTALLS_DIR)
    INSTALL_DIR = process.env.STEAM_INSTALLS_DIR;
  return INSTALL_DIR;
}

// path to auth files
export const CONFIG_AUTH_DIR = 'Auth';
export const CONFIG_SAVED_DIR = 'Saved';
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

// sqlite databases
// (legacy nedb filenames live in db/nedbImport.ts, their only consumer)
export const MAIN_DB = 'omegga.db';
export const PLUGINS_DB = 'omegga-plugins.db';
export const SESSIONS_DB = 'omegga-sessions.db';

export const ACTIVE_WORLD_FILE = 'active_world';

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
  METRICS_DEFAULTS,
  PROMETHEUS_DEFAULTS,
  CONFIG_FILENAMES,
  BRICKADIA_INSTALLS,
  LOCAL_LAUNCHER,
  CONFIG_AUTH_DIR,
  CONFIG_SAVED_DIR,
  BRICKADIA_AUTH_FILES,
  TEMP_DIR_NAME,
  DATA_PATH,
  PLUGIN_PATH,
  PLUGIN_FILE,
  PLUGIN_POSTINSTALL,
  MAIN_DB,
  PLUGINS_DB,
  SESSIONS_DB,
  WEB_CERTS_DATA,
  WEB_SESSION_TOKEN,
  METRIC_HEARTBEAT_INTERVAL,
  METRIC_EMPTIES_BEFORE_PAUSE,
  STEAM_DIR,
  STEAMCMD_PATH,
  STEAM_BRICKADIA_PATH: GAME_BIN_PATH,
  GLOBAL_TOKEN,
  getOverrideGameDir,
  getOverrideGameBinary,
  getSteamGameDir,
  getSteamInstallDir,
  getAppId,
};
