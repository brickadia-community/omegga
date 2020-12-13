const fs = require('fs');
const path = require('path');

const Omegga = require('./server.js');
const soft = require('../softconfig.js');
const file = require('../util/file.js');
const { write: writeConfig } = require('../brickadia/config.js');

// remove the temporary install
async function removeTempDir() {
  if (fs.existsSync(soft.TEMP_DIR_NAME)) {
    // attempt to remove the temporary dir
    try { await file.rmdir(soft.TEMP_DIR_NAME); } catch (e) {
      // ignore fail - the directory probably doesn't exist
    }
  }
}

// read the auth files into a buffer
function readAuthFiles() {
  const files = {};
  for (const f of soft.BRICKADIA_AUTH_FILES) {
    files[f] = fs.readFileSync(path.join(soft.TEMP_DIR_NAME, soft.DATA_PATH, 'Saved/Auth', f));
  }
  return files;
}

// write auth files object to a server path
function writeAuthFiles(dstDir, files) {
  for (const f in files) {
    fs.writeFileSync(path.join(dstDir, f), files[f]);
  }
}

// from credentials, build brickadia auth tokens
async function genAuthFiles(email, password) {
  // remove existing temporary install path
  await removeTempDir();

  // dummy omegga config
  const config = {
    server: {
      port: 7777,
      publiclyListed: false,
      name: 'omegga auth init',
      __LOCAL: fs.existsSync(soft.LOCAL_LAUNCHER),
    },
    credentials: { email, password },
  };

  // dummy omegga launch options
  const options = {
    noauth: true,
    nodb: true,
    noplugin: true,
    noweb: true,
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
      resolved = true;
      resolve(true);

      // immediately stop the server
      omegga.stop();
    });

    // auth failed if we get 'unauthorized'
    omegga.once('unauthorized', () => {
      resolved = true;
      resolve(false);

      // immediately stop the server
      omegga.stop();
    });

    // if the server closes and the promise hasn't resolved, reject
    omegga.once('exit', () => {
      removeTempDir();
      if (!resolved) reject('temp server could not start');
    });
  });

  // read the auth files on success
  const files = success ? readAuthFiles() : undefined;

  // remove temp dir
  removeTempDir();

  // return auth files (or null)
  return files;
}

module.exports = {
  genAuthFiles,
  writeAuthFiles,
};