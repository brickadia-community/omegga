import soft from '@/softconfig';
import { genAuthFiles, writeAuthFiles } from '@omegga/auth';
import { isNonInteractive } from '@util/env';
import * as file from '@util/file';
import 'colors';
import fs, { existsSync } from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';

export const AUTH_PATH = path.join(soft.CONFIG_HOME, soft.CONFIG_AUTH_DIR);

/**
 * Refuse to authenticate rather than opening a prompt nothing can answer.
 *
 * Reaching a prompt on such a host is worse than failing: omegga blocks
 * before it logs anything a supervisor recognises as a start, so the failure
 * shows up as a startup timeout with no cause in the log.
 */
function failNonInteractive() {
  console.error(
    '!>'.red,
    'No stored auth files and no hosting token, and there is no terminal to prompt on',
  );
  console.error(
    '!>'.red,
    'Generate a hosting token at https://brickadia.com/account/tokens, then set',
    'BRICKADIA_TOKEN'.yellow,
    'or',
    'credentials.token'.yellow,
    'in omegga-config.yml',
  );
  return false;
}

// async function to prompt for credentials
async function credentialPrompt() {
  console.log(
    '>>'.green,
    'Enter',
    'Brickadia'.green.underline,
    'credentials (not stored)',
  );

  const response = await prompts([
    {
      type: 'text',
      name: 'email',
      message: 'Email',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Password',
    },
  ]);

  return [response.email, response.password];
}

async function authFromPrompt({
  email,
  password,
  debug = false,
  isSteam,
  branch,
  authDir,
  savedDir,
  launchArgs,
}: {
  email?: string | null;
  password?: string | null;
  debug?: boolean;
  isSteam?: boolean;
  branch?: string;
  authDir?: string;
  savedDir?: string;
  launchArgs?: string;
}) {
  let files: Record<string, Buffer> | null;

  if (isSteam || !email || !password) {
    if (isNonInteractive()) return failNonInteractive();

    // Prompt user to pick to select username/password or Auth Token
    const { authType } = await prompts({
      type: 'select',
      name: 'authType',
      message: 'Select authentication method',
      choices: [
        { title: 'Hosting Token', value: 'token' },
        { title: 'Username/Password', value: 'credentials' },
      ],
    });

    if (!authType) {
      console.error('!>'.red, 'No authentication method selected');
      return false;
    }

    if (authType === 'token') {
      // Prompt for hosting token
      const { token } = await prompts({
        type: 'password',
        name: 'token',
        message:
          'Paste your server hosting token (generate one at https://brickadia.com/account/tokens)',
        validate: value => (value ? true : 'Token is required'),
      });

      if (!token) {
        console.error('!>'.red, 'Hosting token is required');
        return false;
      }

      // Write to global token file
      try {
        console.log('>>'.green, 'Storing hosting token...');
        fs.writeFileSync(soft.GLOBAL_TOKEN, token.trim());
      } catch (err) {
        console.error('!>'.red, 'Error writing hosting token to config\n', err);
        return false;
      }

      return true;
    }

    if (isSteam) {
      console.error(
        '!>'.red,
        'Launching with steam requires a hosting token right now.',
      );
      return false;
    }

    // Non-steam password auth is handled below
  }

  if (!email || !password || !isSteam) {
    if (isNonInteractive()) return failNonInteractive();

    // prompt for user credentials
    try {
      [email, password] = await credentialPrompt();
    } catch (err) {
      console.error('!>'.red, 'Error prompting credentials\n', err);
      return false;
    }
  }

  if (!email || !password) {
    console.error('!>'.red, 'Email and password are required');
    return false;
  }

  // generate auth tokens
  console.log('>>'.green, 'Generating auth tokens...');
  const timeout = setTimeout(() => {
    console.log('>>'.green, 'Probably also installing the game...');
  }, 10000);
  try {
    files = await genAuthFiles(email, password, {
      debug,
      branch,
      authDir,
      savedDir,
      launchArgs,
    });
    clearTimeout(timeout);
  } catch (err) {
    clearTimeout(timeout);
    console.error('!>'.red, 'Error generating tokens:', err);
    return false;
  }

  if (!files) {
    console.error('!>'.red, 'Authentication Failed');
    return;
  }

  // save the tokens to the config path (will be copied when omegga starts)
  try {
    console.log('>>'.green, 'Storing auth tokens...');
    const authPath = path.join(
      soft.CONFIG_HOME,
      savedDir && savedDir !== soft.CONFIG_SAVED_DIR ? savedDir : '',
      authDir ?? soft.CONFIG_AUTH_DIR,
    );
    file.mkdir(authPath);
    writeAuthFiles(authPath, files);
  } catch (err) {
    console.error('!>'.red, 'Error writing tokens to config\n', err);
    return false;
  }

  console.log('>>'.green, 'Auth tokens successfully generated!');
  return true;
}

// check if auth files exist
function authExists(dir?: string) {
  return soft.BRICKADIA_AUTH_FILES.every(f =>
    fs.existsSync(path.join(dir ?? AUTH_PATH, f)),
  );
}

// delete auth files stored in config
// delete auth files stored in config
function deleteAuthFiles(dir?: string) {
  const isConfigHome = dir && dir.startsWith(soft.CONFIG_HOME);
  // will not delete files outside of the config home
  if (dir && !isConfigHome) return;
  file.rmdir(dir ?? AUTH_PATH);

  // Remove the global auth token
  if (existsSync(soft.GLOBAL_TOKEN)) {
    fs.unlinkSync(soft.GLOBAL_TOKEN);
  }
}

export function getGlobalToken() {
  if (!fs.existsSync(soft.GLOBAL_TOKEN)) return null;
  return fs.readFileSync(soft.GLOBAL_TOKEN, 'utf-8').trim();
}

export const prompt = authFromPrompt;
export const exists = authExists;
export const clean = deleteAuthFiles;

export default {
  AUTH_PATH,
  prompt,
  exists,
  clean,
  getGlobalToken,
};
