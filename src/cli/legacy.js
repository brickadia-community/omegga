// DEPRECATED
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const soft = require('../softconfig.js');
require('colors');

const err = (...args) => console.error('!>'.red, ...args);
const log = (...args) => console.log('>>'.green, ...args);

const INSTALLER_PATH = path.join(__dirname, '../OMEGGA_LEGACY_INSTALL');
const LEGACY_PATH = path.join(soft.CONFIG_HOME, '/Legacy/Brickadia/Binaries/Linux/BrickadiaServer-Linux-Shipping');

// wait for user response
function prompt() {
  return new Promise(resolve => {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout});

    rl.question('>>'.green + ' Would you like to download a ' + 'temporary a4 install'.yellow.underline + '? (y/N): ', resp => {
      rl.close();
      resolve(['y', 'yes'].includes(resp.toLowerCase()));
    });
  })
}

// run the installer script
function runInstaller() {
  return new Promise(resolve => {
    const child = spawn(INSTALLER_PATH, {stdio: ['ignore', 1, 2]});

    child.on('close', (code) => {
      resolve(code);
    });
  });
}

async function legacyPester() {
  const ok = await prompt();

  if (!ok) {
    err('Omegga could not be started - missing dependencies')
    process.exit(1);
    return;
  }

  log('Running legacy installer...');
  const res = await runInstaller();
  if (res === 0) {
    log('Success!');
    require('./config.js')('legacy', LEGACY_PATH)
    require('../main.js');
  }
}

legacyPester();