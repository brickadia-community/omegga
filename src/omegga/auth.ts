import Logger from '@/logger';
import soft from '@/softconfig';
import { IConfig } from '@config/types';
import * as file from '@util/file';
import fs from 'fs';
import path from 'path';
import { write as writeConfig } from '../brickadia/config';
import Omegga from './server';
import { IOmeggaOptions } from './types';

require('colors');

const PORT = 63281;

// remove the temporary install
async function removeTempDir() {
  if (fs.existsSync(soft.TEMP_DIR_NAME)) {
    Logger.verbose('Removing temporary auth directory');

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
  Logger.verbose('Generating auth files');

  // remove existing temporary install path
  await removeTempDir();

  if (fs.existsSync(soft.LOCAL_LAUNCHER)) {
    Logger.verbose('Generating auth with local launcher');
  }

  Logger.verbose('Using auth port ' + PORT);

  // dummy omegga config
  const config: IConfig = {
    server: {
      port: PORT,
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
      Logger.verbose('Auth succeeded');
      resolved = true;
      resolve(true);

      // immediately stop the server
      omegga.stop();
    });

    // auth failed if we get 'unauthorized'
    omegga.once('unauthorized', () => {
      Logger.verbose('Auth failed');
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
        Logger.verbose('Brickadia', name, 'with code', ...args);
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
