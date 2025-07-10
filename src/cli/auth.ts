import soft from '@/softconfig';
import { genAuthFiles, writeAuthFiles } from '@omegga/auth';
import * as file from '@util/file';
import 'colors';
import fs from 'fs';
import path from 'path';
import prompts from 'prompts';

export const AUTH_PATH = path.join(soft.CONFIG_HOME, soft.CONFIG_AUTH_DIR);

// async function to prompt for credentials
async function credentialPrompt() {
  console.log(
    '>>'.green,
    'Enter',
    'Brickadia'.green.underline,
    'credentials (not stored)'
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
  branch,
  authDir,
  savedDir,
  launchArgs,
}: {
  email?: string | null;
  password?: string | null;
  debug?: boolean;
  branch?: string;
  authDir?: string;
  savedDir?: string;
  launchArgs?: string;
}) {
  let files: Record<string, Buffer>;

  if (!email || !password) {
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
      savedDir !== soft.CONFIG_SAVED_DIR ? savedDir : '',
      authDir ?? soft.CONFIG_AUTH_DIR
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
    fs.existsSync(path.join(dir ?? AUTH_PATH, f))
  );
}

// delete auth files stored in config
// delete auth files stored in config
function deleteAuthFiles(dir?: string) {
  // will not delete files outside of the config home
  if (dir && !dir.startsWith(soft.CONFIG_HOME)) return;
  file.rmdir(dir ?? AUTH_PATH);
}

export const prompt = authFromPrompt;
export const exists = authExists;
export const clean = deleteAuthFiles;

export default {
  AUTH_PATH,
  prompt,
  exists,
  clean,
};
