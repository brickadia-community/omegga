import Logger from '@/logger';
import { GAME_INSTALL_DIR, STEAM_APP_ID, STEAMCMD_PATH } from '@/softconfig';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import acfParser from 'steam-acf2json';

export function getAppId() {
  return process.env.STEAM_APP_ID ?? STEAM_APP_ID;
}

export function steamcmdDownloadSelf() {
  execSync(path.join(__dirname, '../../tools/install_steamcmd.sh'), {
    stdio: 'inherit',
  });
}

export function steamcmdDownloadGame({
  steambeta,
  steambetaPassword,
}: {
  steambeta?: string;
  steambetaPassword?: string;
} = {}) {
  let steamLogin = 'anonymous';
  if (process.env.STEAM_USERNAME && process.env.STEAM_PASSWORD) {
    steamLogin = `"${process.env.STEAM_USERNAME}" "${process.env.STEAM_PASSWORD}"`;
  }

  const args = [
    `+force_install_dir ${path.join(GAME_INSTALL_DIR, steambeta ?? 'main')}`,
    `+login ${steamLogin}`,
    `+app_update ${getAppId()}`,
    steambeta ? `-beta ${steambeta}` : null,
    steambeta && steambetaPassword
      ? `-betapassword ${steambetaPassword}`
      : null,
    '+quit',
  ].filter(Boolean);

  execSync(`${STEAMCMD_PATH} ${args.join(' ')}`, { stdio: 'inherit' });
}

export type SteamInfo = {
  data: Record<
    string,
    {
      _change_number: number;
      _missing_token: boolean;
      _sha: string;
      _size: number;
      appid: number;
      common: unknown;
      config: unknown;
      depots: Record<
        string,
        {
          config: { oslist: 'linux' | 'windows' | 'macos' };
        }
      > & {
        branches: Record<
          string,
          {
            buildid: string;
            timeupdated: string;
            description?: string;
          }
        >;
        privatebranches: '1';
      };
    }
  >;
  status: 'success';
};

async function fetchSteamInfo() {
  const appId = getAppId();
  const res = await fetch('https://api.steamcmd.net/v1/info/' + appId);
  const json = await res.json();
  return json as SteamInfo;
}

export type SteamAcf = {
  AppState: {
    appid: string;
    buildid: string;
    lastupdated: string;
  };
};

function getSteamAcf(steambeta?: string) {
  const appId = getAppId();
  const installDir = path.join(GAME_INSTALL_DIR, steambeta ?? 'main');
  const acfPath = path.join(
    installDir,
    'steamapps',
    `appmanifest_${appId}.acf`,
  );
  if (!existsSync(acfPath)) {
    Logger.verbose(`File not found: ${acfPath}`);
    return null;
  }
  try {
    const plaintext = readFileSync(acfPath, 'utf-8');
    const json = acfParser.decode(plaintext);
    return json as SteamAcf;
  } catch (err) {
    Logger.error(`Error parsing ACF file ${acfPath}:`, err);
    return null;
  }
}

function getSteamDepot(info: SteamInfo, branch?: string) {
  const appId = getAppId();
  const depot =
    info.data[appId]?.depots?.branches?.[
      !branch || branch === 'main' ? 'public' : branch
    ];
  if (
    !depot ||
    typeof depot !== 'object' ||
    !('buildid' in depot) ||
    !('timeupdated' in depot)
  )
    return null;
  return {
    buildId: depot.buildid,
    timeUpdated: Number(depot.timeupdated),
  };
}

function getSteamAcfDepot(acf: SteamAcf) {
  const appId = getAppId();
  const appState = acf.AppState;
  if (
    !appState ||
    typeof appState !== 'object' ||
    appState.appid !== appId ||
    !('buildid' in appState) ||
    !('lastupdated' in appState)
  )
    return null;
  return {
    buildId: appState.buildid,
    timeUpdated: Number(appState.lastupdated),
  };
}

export function getLocalSteamDepot(steambeta?: string) {
  const acf = getSteamAcf(steambeta);
  if (!acf) return null;
  const depot = getSteamAcfDepot(acf);
  if (!depot) return null;
  return depot;
}

export async function getRemoteSteamDepot(steambeta?: string) {
  const info = await fetchSteamInfo();
  if (!info || !info.data) {
    return null;
  }
  const depot = getSteamDepot(info, steambeta);
  if (!depot) return null;
  return depot;
}

let lastUpdateCheck = 0;
let lastUpdateAvailable = 0;
let lastUpdateResult = false;

export const getLastSteamUpdateCheck = () => ({
  attempt: lastUpdateCheck,
  available: lastUpdateAvailable,
  result: lastUpdateResult,
});

export const clearLastSteamUpdateCheck = () => {
  lastUpdateResult = false;
};

export async function hasSteamUpdate(steambeta?: string) {
  lastUpdateCheck = Date.now();
  const localDepot = getLocalSteamDepot(steambeta);
  if (!localDepot) return false;

  const remoteDepot = await getRemoteSteamDepot(steambeta);
  if (!remoteDepot) return false;

  lastUpdateAvailable = Date.now();
  const res =
    localDepot.buildId !== remoteDepot.buildId ||
    localDepot.timeUpdated < remoteDepot.timeUpdated;
  lastUpdateResult = res;

  return res;
}
