const passwordPrompt = require('password-prompt');
const readline = require('readline');
const path = require('path');
const fs = require('fs');
require('colors');

const { genAuthFiles, writeAuthFiles } = require('../omegga/auth.js');
const file = require('../util/file.js');
const soft = require('../softconfig.js');


const AUTH_PATH = path.join(soft.CONFIG_HOME, soft.CONFIG_AUTH_DIR);

// prompt user for email
const emailPrompt = text => new Promise((resolve) => {
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout
  });

  rl.question(text, email => {
    rl.close();
    resolve(email);
  });
});

// async function to prompt for credentials
async function prompt() {
  console.log('>>'.green, 'Enter', 'Brickadia'.green, 'credentials (not stored)');
  return [
    await emailPrompt('     email: '),
    await passwordPrompt('  password: '),
  ];
}

async function authFromPrompt() {
  let email, password, files;

  // prompt for user credentials
  try {
    [email, password] = await prompt();
  } catch (err) {
    console.error('!>'.red, 'Error prompting credentials\n', err);
    return false;
  }

  // generate auth tokens
  console.log('>>'.green, 'Generating auth tokens...');
  try {
    files = await genAuthFiles(email, password);
  } catch (err) {
    console.error('!>'.red, 'Error generating tokens\n', err);
    return false;
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
function authExists(dir) {
  return soft.BRICKADIA_AUTH_FILES.every(f =>
    fs.existsSync(path.join(dir || AUTH_PATH, f)));
}

// delete auth files stored in config
function deleteAuthFiles() {
  file.rmdir(AUTH_PATH);
}

module.exports = {
  prompt: authFromPrompt,
  exists: authExists,
  clean: deleteAuthFiles,
};