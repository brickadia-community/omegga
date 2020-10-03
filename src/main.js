const path = require('path');
require('colors');

const package = require('../package');
const soft = require('./softconfig.js');
const Omegga = require('./omegga/server.js');
const config = require('./config/index.js');
const { Terminal, auth } = require('./cli/index.js');
const file = require('./util/file.js');

/*

// TODO: download plugins from git using simple-git
// TODO: update plugins via git pull if there's no pending changes
// TODO: run plugin by either index.js or omegga.entrypoint file w/ stdio message passing
  json rpc?
// TODO: web interface instead of blessed

// TODO: let omegga bundle config (roles, bans, server config) to zip
// TODO: let omegga unbundle config from zip to current omegga dir
*/

// write a default config file
const createDefaultConfig = () => {
  console.log('>>'.green, 'Created default config file');
  config.write(soft.CONFIG_FILENAMES[0] + '.yml', config.defaultConfig);
  file.mkdir('data/Saved/Builds');
  file.mkdir('plugins');
  return config.defaultConfig;
};

const program = require('commander')
  .description(package.description)
  .version(package.version)
  .option('-S, --serverless', 'Run omegga without a webserver (will prevent certain kinds of plugins from working)')
  .option('-W, --webless', 'Run omegga without a web ui (plugins still work, no user-accessible frontend)')
  .option('-d, --debug', 'Print all console logs rather than just chat messages')
  .option('-p, --port', 'Specify a custom port for the webserver (default 8080)')
  .action(async() => {
    const configFile = config.find('.');
    let conf;

    // create a default config file if it does not already exist
    if (!configFile) {
      conf = createDefaultConfig();
    } else {
      conf = config.read(configFile);
    }

    // check if the auth files don't exist
    if (!auth.exists(path.join('.', soft.DATA_PATH, 'Saved/Auth')) && !auth.exists()) {
      const success = await auth.prompt();
      if (!success) {
        console.log('!>'.red, 'Start aborted - could not generate auth tokens');
        return;
      }
    }

    // build options
    const { serverless, webless, port, debug } = program.opts();
    const options = { noserver: serverless || true, noweb: webless, port, debug };

    // setup the server
    const server = new Omegga('.', conf, options);

    // create a terminal
    new Terminal(server, options);

    console.log('>>'.green, 'Starting server...');
    // start the server
    server.start();
  });

program
  .command('init')
  .description('Sets up the current directory as a brickadia server')
  .action(() => {
    const configFile = config.find('.');
    if (configFile) {
      console.log('!>'.red, 'Config file already exists:', configFile.yellow.underline);
      return;
    }
    createDefaultConfig();
  });

program
  .command('auth')
  .option('-c, --clean', 'Remove old auth files')
  .option('-f, --force', 'Forcefully regenerate auth token')
  .description('Generates server auth tokens from brickadia account email+password')
  .action(() => {
    const { clean, force } = program.opts;
    if (clean || force) {
      console.log('>>'.green, 'Clearing old auth files');
      auth.deleteAuthFiles();
      if (clean)
        return;
    }
    auth.prompt();
  });

program
  .command('info')
  .alias('n')
  .description('Shows server name, description, port, install info, and installed plugins')
  .action(() => {
    console.log('!>'.red, 'not implemented yet');
    // TODO: implement config parsing
  });

program
  .command('install') // TODO: implement install command
  .alias('i')
  .description('Installs a plugin to the current brickadia server')
  .option('-f, --force', 'Forcefully re-install existing plugin') // TODO: implement install --force
  .option('-q, --quiet', 'Disable output and interactive config at end of install') // TODO: implement install --quiet
  .option('-c, --config', 'JSON default config') // TODO: implement install --config
  .arguments('<pluginUrl> [morePlugins...]')
  .action((plugin, otherPlugins) => {
    console.log('!>'.red, 'not implemented yet');
    // TODO: automatically fetch and install plugins
  });

program
  .command('update') // TODO: implement update plugins command
  .alias('u')
  .description('Updates all installed plugins to latest versions')
  .option('-f, --force', 'Forcefully re-install existing plugin') // TODO: implement update --force
  .option('-q, --quiet', 'Disable output and interactive config at end of install') // TODO: implement update --quiet
  .option('-c, --config', 'JSON default config') // TODO: implement update --config
  .arguments('[pluginName]')
  .action((plugin) => {
    console.log('!>'.red, 'not implemented yet');
    // TODO: automatically fetch and install plugins
  });

program.parse(process.argv);
