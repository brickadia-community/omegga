const package = require('../package');
const soft = require('./softconfig');
require('colors');

/*

// TODO: download plugins from git using simple-git
// TODO: update plugins via git pull if there's no pending changes
// TODO: run plugin by either index.js or omegga.entrypoint file w/ stdio message passing
  json rpc?
// TODO: web interface instead of blessed

*/

const program = require('commander')
  .description(package.description)
  .version(package.version)
  .option('-S, --serverless', 'Run omegga without a webserver (will prevent certain kinds of plugins from working)')
  .option('-W, --webless', 'Run omegga without a web ui (plugins still work, no user-accessible frontend)')
  .option('-d, --debug', 'Print all console logs rather than just chat messages')
  .option('-p, --port', 'Specify a custom port for the webserver (default 8080)')
  .action(() => {

    const { Omegga, config } = require('./lib.js');
    const { Terminal } = require('./cli/index.js');

    const configFile = config.find('.');

    if (!configFile) {
      console.error('error: missing config file, run', 'omegga init'.underline);
      process.exit(1);
      return;
    }

    // build options
    const { serverless, webless, port, debug } = program.opts();
    const options = { serverless, webless, port, debug };

    // setup the server
    const server = new Omegga('.', config.read(configFile), options);

    // create a terminal
    new Terminal(server, options);

    // start the server
    server.start();
  });

program
  .command('init')
  .option('-q, --quiet', 'Run without output, do not show interactive config at the end') // TODO: implement init --quiet
  .description('Sets up the current directory as a brickadia server')
  .action(() => {
    // TODO: create config file
    // TODO: open config file in interactive editor
    require('./cli/config.js');
  });

program
  .command('config')
  .alias('c')
  .description('Configure the brickadia server in the current directory')
  .action(() => {
    // TODO: open interactive config file
    require('./cli/config.js');
  });

program
  .command('info')
  .alias('n')
  .description('Shows server name, description, port, install info, and installed plugins')
  .action(() => {
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
  .action((plugin, otherPlugins, flags) => {
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
  .action((plugin, flags) => {
    // TODO: automatically fetch and install plugins
  });

program.parse(process.argv);
