/// <reference path="./steam-acf2json.d.ts" />
import Logger from '@/logger';
import {
  GAME_BIN_PATH,
  getAppId,
  getSteamGameDir,
  getSteamInstallDir,
  STEAMCMD_PATH,
} from '@/softconfig';
import { readBinaryVersion } from '@omegga/matchers/version';
import { execSync, spawn, spawnSync } from 'node:child_process';
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

// game download state, read by the metrics endpoint
let updating = false;
let updateCount = 0;
let lastUpdateTime = 0;

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

/**
 * Run steamcmd without blocking the event loop.
 *
 * Arguments are passed as an array rather than as a shell string: it keeps the
 * beta password and steam username out of a shell's hands, and there is nothing
 * here that needs shell features. Rejects with an Error carrying `status`, so
 * callers can match on steamcmd's exit code the way they did with execSync.
 */
function runSteamcmd(
  args: string[],
  {
    capture = false,
    timeoutMs,
  }: { capture?: boolean; timeoutMs?: number } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(STEAMCMD_PATH, args, {
      stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    });

    let output = '';
    child.stdout?.on('data', chunk => (output += chunk));
    child.stderr?.on('data', chunk => (output += chunk));

    const timer = timeoutMs
      ? setTimeout(() => {
          child.kill('SIGKILL');
          reject(
            Object.assign(
              new Error(`steamcmd timed out after ${timeoutMs}ms`),
              {
                status: null,
              },
            ),
          );
        }, timeoutMs)
      : undefined;

    child.once('error', err => {
      if (timer) clearTimeout(timer);
      reject(err);
    });

    child.once('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (code === 0) return resolve(output);
      reject(
        Object.assign(
          new Error(
            `steamcmd exited with ${signal ? `signal ${signal}` : `code ${code}`}` +
              (output ? `\n${output}` : ''),
          ),
          { status: code },
        ),
      );
    });
  });
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
  retries = 3,
  retryDelayMs = 5000,
}: {
  steambeta?: string;
  steambetaPassword?: string;
  /** number of attempts before giving up (steamcmd resumes partial downloads) */
  retries?: number;
  /** delay between retry attempts */
  retryDelayMs?: number;
} = {}) {
  const hasCredentials = !!process.env.STEAM_USERNAME;
  if (hasCredentials) {
    Logger.verbose('Using cached Steam credentials for download.');
  }
  const installDir = getSteamInstallDir();
  const appId = getAppId();

  Logger.verbose('Using with steam install dir:', installDir.yellow);
  Logger.verbose('Using with app ID:', appId.yellow);

  const args = [
    '+force_install_dir',
    path.join(installDir, steambeta ?? 'main'),
    '+login',
    process.env.STEAM_USERNAME || 'anonymous',
    '+app_update',
    appId,
    ...(steambeta ? ['-beta', steambeta] : []),
    ...(steambeta && steambetaPassword
      ? ['-betapassword', steambetaPassword]
      : []),
    '+quit',
  ];

  // mirrors the "Launching Brickadia Server CL####" startup log
  const logUpdatedVersion = () => {
    const version = readBinaryVersion(
      path.join(
        installDir,
        steambeta ?? 'main',
        getSteamGameDir(),
        GAME_BIN_PATH,
      ),
    );
    // called only on the success paths, so it doubles as the update tally
    updateCount++;
    lastUpdateTime = Date.now();
    Logger.logp(
      `Brickadia Server updated${
        version ? ' to ' + ('CL' + version).green : ''
      }`,
    );
  };

  // steamcmd resumes partial downloads, and late-stage failures (e.g. "state is
  // 0x406 after update job") are frequently transient, so retry before giving up.
  const attempts = Math.max(1, retries);
  let triedInteractiveLogin = false;

  updating = true;
  try {
    return await downloadWithRetries();
  } finally {
    updating = false;
  }

  async function downloadWithRetries() {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await runSteamcmd(args);
        logUpdatedVersion();
        return;
      } catch (err) {
        // the error that is ultimately reported/thrown; replaced when the
        // interactive-login retry fails with a newer error
        let error: unknown = err;
        // Steam Guard interactive re-auth on status 5, attempted at most once.
        if (
          !triedInteractiveLogin &&
          hasCredentials &&
          err instanceof Error &&
          'status' in err &&
          (err as NodeJS.ErrnoException & { status: number }).status === 5
        ) {
          triedInteractiveLogin = true;
          Logger.warnp(
            'Steam login failed. This may require Steam Guard authentication.',
          );
          Logger.warnp('Attempting interactive login...');

          if (await steamcmdInteractiveLogin()) {
            Logger.logp('Login successful. Retrying download...');
            try {
              await runSteamcmd(args);
              logUpdatedVersion();
              return;
            } catch (retryErr) {
              handleSteamError(retryErr);
              error = retryErr;
            }
          } else {
            Logger.errorp(
              'Interactive login failed. Run',
              'omegga steamlogin'.yellow,
              'to authenticate manually.',
            );
          }
        }

        handleSteamError(error);

        if (attempt < attempts) {
          Logger.warnp(
            `Steam download attempt ${attempt}/${attempts} failed; retrying in ${Math.round(
              retryDelayMs / 1000,
            )}s...`,
          );
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue;
        }

        throw error;
      }
    }
  }
}

/** Whether a game download is in progress. */
export const isUpdatingGame = () => updating;

/** number of successful game updates this process has performed */
export const getUpdateCount = () => updateCount;

/** unix ms of the last successful game update, or 0 */
export const getLastUpdateTime = () => lastUpdateTime;

export type SteamAppStatus = {
  installState: string;
  buildId: string;
  betaKey: string | null;
  updateState: string;
};

export type SteamAppInfo = {
  branches: Record<string, { buildid: string; timeupdated?: string }>;
};

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex -- the escape byte is the point
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function parseAppStatus(output: string): SteamAppStatus | null {
  const clean = stripAnsi(output);
  const buildMatch = clean.match(/BuildID\s+(\d+)/);
  const stateMatch = clean.match(/install state:\s*(.+)/i);
  const betaMatch = clean.match(/"BetaKey"\s+"([^"]+)"/);
  const updateMatch = clean.match(/update state:\s*(.+)/i);
  if (!buildMatch) return null;
  return {
    installState: stateMatch?.[1]?.trim().replace(/,$/, '') ?? 'Unknown',
    buildId: buildMatch[1],
    betaKey: betaMatch?.[1] ?? null,
    updateState: updateMatch?.[1]?.trim() ?? 'Unknown',
  };
}

function parseAppInfo(output: string, appId: string): SteamAppInfo | null {
  const clean = stripAnsi(output);
  const vdfStart = clean.indexOf(`"${appId}"`);
  if (vdfStart === -1) return null;

  const braceStart = clean.indexOf('{', vdfStart);
  if (braceStart === -1) return null;

  let depth = 0;
  let braceEnd = -1;
  for (let i = braceStart; i < clean.length; i++) {
    if (clean[i] === '{') depth++;
    if (clean[i] === '}') depth--;
    if (depth === 0) {
      braceEnd = i;
      break;
    }
  }
  if (braceEnd === -1) return null;

  try {
    const vdf = `"${appId}"\n${clean.slice(braceStart, braceEnd + 1)}\n`;
    const parsed = acfParser.decode(vdf);
    const branches = parsed?.[appId]?.depots?.branches;
    if (!branches || typeof branches !== 'object') return null;
    return { branches };
  } catch {
    return null;
  }
}

export type SteamUpdateCheck = {
  local: SteamAppStatus;
  remote: SteamAppInfo | null;
  hasUpdate: boolean | null;
};

export async function steamcmdCheckUpdate(
  steambeta?: string,
): Promise<SteamUpdateCheck | null> {
  const appId = getAppId();
  const installDir = path.join(getSteamInstallDir(), steambeta ?? 'main');

  try {
    // this runs on the autorestart interval, so it must not block the loop
    // either: a 30s steamcmd stall used to freeze the whole process
    const output = await runSteamcmd(
      [
        '+force_install_dir',
        installDir,
        '+login',
        process.env.STEAM_USERNAME || 'anonymous',
        '+app_info_update',
        '1',
        '+app_info_print',
        appId,
        '+app_status',
        appId,
        '+quit',
      ],
      { capture: true, timeoutMs: 30000 },
    );

    const local = parseAppStatus(output);
    if (!local) return null;

    const remote = parseAppInfo(output, appId);

    const branch = steambeta ?? (local.betaKey || null);
    const remoteBranch = branch && branch !== 'main' ? branch : 'public';
    const remoteBuildId = remote?.branches?.[remoteBranch]?.buildid;

    const hasUpdate =
      remoteBuildId != null ? remoteBuildId !== local.buildId : null;

    return { local, remote, hasUpdate };
  } catch (err) {
    Logger.verbose('Failed to check for Steam update via steamcmd:', err);
    return null;
  }
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

  const check = await steamcmdCheckUpdate(steambeta);
  if (!check) return false;

  lastUpdateAvailable = Date.now();

  if (check.hasUpdate != null) {
    lastUpdateResult = check.hasUpdate;
    return check.hasUpdate;
  }

  return false;
}
