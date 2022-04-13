import soft from '@/softconfig';
import { IConfig } from '@config/types';
import * as file from '@util/file';
import fs from 'fs';
import path from 'path';
import { write as writeConfig } from '../brickadia/config';
import { IOmeggaOptions } from './types';
import Omegga from './server';

require('colors');

const verboseLog = (...args: any[]) => {
  if (!global.Omegga.VERBOSE) return;
  if (global.Omegga.log) global.Omegga.log('V>'.magenta, ...args);
  else console.log('V>'.magenta, ...args);
};

// remove the temporary install
async function removeTempDir() {
  if (fs.existsSync(soft.TEMP_DIR_NAME)) {
    verboseLog('Removing temporary auth directory');

    // attempt to remove the temporary dir
    try {
      await file.rmdir(soft.TEMP_DIR_NAME);
    } catch (e) {
      // ignore fail - the directory probably doesn't exist
    }
  }
}

// read the auth files into a buffer
function readAuthFiles() {
  const files: Record<string, Buffer> = {};
  for (const f of soft.BRICKADIA_AUTH_FILES) {
    files[f] = fs.readFileSync(
      path.join(soft.TEMP_DIR_NAME, soft.DATA_PATH, 'Saved/Auth', f)
    );
  }
  return files;
}

// write auth files object to a server path
export function writeAuthFiles(dstDir: string, files: Record<string, Buffer>) {
  for (const f in files) {
    fs.writeFileSync(path.join(dstDir, f), files[f]);
  }
}

// from credentials, build brickadia auth tokens
export async function genAuthFiles(
  email: string,
  password: string,
  { debug = false, branch }: { debug?: boolean; branch?: string }
) {
  verboseLog('Generating auth files');

  // remove existing temporary install path
  await removeTempDir();

  if (fs.existsSync(soft.LOCAL_LAUNCHER)) {
    verboseLog('Generating auth with local launcher');
  }

  // dummy omegga config
  const config: IConfig = {
    server: {
      port: 7777,
      publiclyListed: false,
      name: 'omegga auth init',
      __LOCAL: fs.existsSync(soft.LOCAL_LAUNCHER),
      branch,
    },
    credentials: { email, password },
  };

  // dummy omegga launch options
  const options: IOmeggaOptions = {
    noauth: true,
    noplugin: true,
    noweb: true,
    debug,
  };

  // create a dummy omegga
  const omegga = new Omegga(soft.TEMP_DIR_NAME, config, options);

  // create the unlisted server config
  writeConfig(soft.TEMP_DIR_NAME, config);

  omegga.start();

  const success = await new Promise((resolve, reject) => {
    let resolved = false;
    // auth succeeded if the server starts
    omegga.once('start', () => {
      verboseLog('Auth succeeded');
      resolved = true;
      resolve(true);

      // immediately stop the server
      omegga.stop();
    });

    // auth failed if we get 'unauthorized'
    omegga.once('unauthorized', () => {
      verboseLog('Auth failed');
      resolved = true;
      resolve(false);

      // immediately stop the server
      omegga.stop();
    });

    let finished = false;
    const finish =
      (name: string) =>
      (...args: any[]) => {
        if (finished) return;
        finished = true;
        verboseLog('Brickadia', name, 'with code', ...args);
        if (!resolved) reject('temp server could not start');
      };

    // if the server closes and the promise hasn't resolved, reject
    omegga.once('closed', finish('closed'));
    omegga.once('exit', finish('exited'));
    omegga.once('server:stopped', finish('stopped'));
  });

  // read the auth files on success
  const files = success ? readAuthFiles() : null;

  // remove temp dir
  removeTempDir();

  // return auth files (or null)
  return files;
}
