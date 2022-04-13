import fs from 'fs';
import passwordPrompt from 'password-prompt';

import path from 'path';
import readline from 'readline';
import { genAuthFiles, writeAuthFiles } from '../omegga/auth';
import soft from '../softconfig';
import * as file from '../util/file';
require('colors');

export const AUTH_PATH = path.join(soft.CONFIG_HOME, soft.CONFIG_AUTH_DIR);

// prompt user for email
const emailPrompt = (text: string) =>
  new Promise<string>(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(text, (email: string) => {
      rl.close();
      resolve(email);
    });
  });

// async function to prompt for credentials
async function credentialPrompt() {
  console.log(
    '>>'.green,
    'Enter',
    'Brickadia'.green.underline,
    'credentials (not stored)'
  );
  return [
    await emailPrompt('     ' + 'email'.yellow.underline + ': '),
    await passwordPrompt('  ' + 'password'.yellow.underline + ': '),
  ];
}

async function authFromPrompt({
  email,
  password,
  debug = false,
  branch,
}: {
  email?: string;
  password?: string;
  debug?: boolean;
  branch?: string;
}) {
  let files;

  if (!email || !password) {
    // prompt for user credentials
    try {
      [email, password] = await credentialPrompt();
    } catch (err) {
      console.error('!>'.red, 'Error prompting credentials\n', err);
      return false;
    }
  }

  // generate auth tokens
  console.log('>>'.green, 'Generating auth tokens...');
  const timeout = setTimeout(() => {
    console.log('>>'.green, 'Probably also installing the game...');
  }, 10000);
  try {
    files = await genAuthFiles(email, password, { debug, branch });
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
    file.mkdir(AUTH_PATH);
    writeAuthFiles(AUTH_PATH, files);
  } catch (err) {
    console.error('!>'.red, 'Error writing tokens to config\n', err);
    return false;
  }

  console.log('>>'.green, 'Auth tokens successfully generated!');
  return true;
}

// check if auth files exist
function authExists(dir: string) {
  return soft.BRICKADIA_AUTH_FILES.every(f =>
    fs.existsSync(path.join(dir || AUTH_PATH, f))
  );
}

// delete auth files stored in config
function deleteAuthFiles() {
  file.rmdir(AUTH_PATH);
}

export const prompt = authFromPrompt;
export const exists = authExists;
export const clean = deleteAuthFiles;

export default {
  AUTH_PATH,
  prompt: credentialPrompt,
  exists,
  clean,
};
