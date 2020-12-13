// DEPRECATED
const path = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
require('colors');

const err = (...args) => console.error('!>'.red, ...args);
const log = (...args) => console.log('>>'.green, ...args);

const INSTALLER_PATH = path.join(__dirname, '../../tools/install_launcher.sh');

// wait for user response
function prompt() {
  return new Promise(resolve => {
    const rl = readline.createInterface({input: process.stdin, output: process.stdout});

    rl.question('>>'.green + ' Would you like to download ' + 'the brickadia launcher'.yellow.underline + '? (y/N): ', resp => {
      rl.close();
      resolve(['y', 'yes'].includes(resp.toLowerCase()));
    });
  });
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

async function installLauncher() {
  const ok = await prompt();

  if (!ok) {
    err('Omegga could not be started - missing dependencies. Visit '  + 'https://www.brickadia.com'.yellow.underline + ' to download the launcher.');
    process.exit(1);
    return;
  }

  log('Running launcher installer...');
  const res = await runInstaller();
  if (res === 0) {
    log('Success!');
    require('../main.js');
  }
}

installLauncher();