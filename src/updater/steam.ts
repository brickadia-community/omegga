import Logger from '@/logger';
import { getAppId, getSteamInstallDir, STEAMCMD_PATH } from '@/softconfig';
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';
import acfParser from 'steam-acf2json';

// Steam EAppState flags (bitmask)
const STEAM_APP_STATES: Record<number, string> = {
  0x1: 'Uninstalled',
  0x2: 'Update Required',
  0x4: 'Fully Installed',
  0x8: 'Encrypted',
  0x10: 'Locked',
  0x20: 'Files Missing',
  0x40: 'App Running',
  0x80: 'Files Corrupt',
  0x100: 'Update Running',
  0x200: 'Update Paused',
  0x400: 'Update Started',
  0x800: 'Uninstalling',
  0x1000: 'Backup Running',
  0x10000: 'Reconfiguring',
  0x20000: 'Validating',
  0x40000: 'Adding Files',
  0x80000: 'Preallocating',
  0x100000: 'Downloading',
  0x200000: 'Staging',
  0x400000: 'Committing',
  0x800000: 'Update Stopping',
};

function decodeAppState(state: number): string[] {
  const flags: string[] = [];
  for (const [bit, name] of Object.entries(STEAM_APP_STATES)) {
    if (state & Number(bit)) flags.push(name);
  }
  return flags;
}

export function steamcmdDownloadSelf() {
  execSync(path.join(__dirname, '../../tools/install_steamcmd.sh'), {
    stdio: 'inherit',
  });
}

export async function steamcmdInteractiveLogin(): Promise<boolean> {
  if (!process.env.STEAM_USERNAME) {
    Logger.error('STEAM_USERNAME environment variable is required.');
    return false;
  }

  const password =
    process.env.STEAM_PASSWORD ??
    (
      await prompts({
        type: 'password',
        name: 'value',
        message: `Steam password for ${process.env.STEAM_USERNAME}`,
      })
    ).value;

  if (!password) {
    Logger.error('No password provided.');
    return false;
  }

  const result = spawnSync(
    STEAMCMD_PATH,
    ['+login', process.env.STEAM_USERNAME, password, '+quit'],
    { stdio: 'inherit' },
  );

  return result.status === 0;
}

function handleSteamError(err: unknown) {
  if (err instanceof Error && err.message) {
    const stateMatch = err.message.match(
      /state is (0x[0-9A-Fa-f]+) after update job/,
    );
    if (stateMatch) {
      const state = parseInt(stateMatch[1], 16);
      const flags = decodeAppState(state);
      Logger.error(
        `Steam app state ${stateMatch[1]} (${state}):`,
        flags.length > 0 ? flags.join(', ') : 'Unknown',
      );
    }

    err.message = err.message
      .replace(/\+login\s+"[^"]*"\s+"[^"]*"/, '+login <REDACTED>')
      .replace(/\+login\s+(\S+)\s+\S+/, '+login $1 <REDACTED>')
      .replace(/-betapassword\s+\S+/, '-betapassword <REDACTED>');
  }
}

export async function steamcmdDownloadGame({
  steambeta,
  steambetaPassword,
}: {
  steambeta?: string;
  steambetaPassword?: string;
} = {}) {
  const hasCredentials = !!process.env.STEAM_USERNAME;
  const steamLogin = hasCredentials
    ? `"${process.env.STEAM_USERNAME}"`
    : 'anonymous';
  if (hasCredentials) {
    Logger.verbose('Using cached Steam credentials for download.');
  }
  const installDir = getSteamInstallDir();
  const appId = getAppId();

  Logger.verbose('Using with steam install dir:', installDir.yellow);
  Logger.verbose('Using with app ID:', appId.yellow);

  const args = [
    `+force_install_dir ${path.join(installDir, steambeta ?? 'main')}`,
    `+login ${steamLogin}`,
    `+app_update ${appId}`,
    steambeta ? `-beta ${steambeta}` : null,
    steambeta && steambetaPassword
      ? `-betapassword ${steambetaPassword}`
      : null,
    '+quit',
  ].filter(Boolean);

  const cmd = `${STEAMCMD_PATH} ${args.join(' ')}`;

  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (err) {
    if (
      hasCredentials &&
      err instanceof Error &&
      'status' in err &&
      (err as NodeJS.ErrnoException & { status: number }).status === 5
    ) {
      Logger.warnp(
        'Steam login failed — this may require Steam Guard authentication.',
      );
      Logger.warnp('Attempting interactive login...');

      if (await steamcmdInteractiveLogin()) {
        Logger.logp('Login successful. Retrying download...');
        try {
          execSync(cmd, { stdio: 'inherit' });
          return;
        } catch (retryErr) {
          handleSteamError(retryErr);
          throw retryErr;
        }
      }

      Logger.errorp(
        'Interactive login failed. Run',
        'omegga steamlogin'.yellow,
        'to authenticate manually.',
      );
    }

    handleSteamError(err);
    throw err;
  }
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
  const installDir = path.join(getSteamInstallDir(), steambeta ?? 'main');
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
