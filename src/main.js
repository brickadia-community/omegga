const package = require('../package');
const cli = require('./cli');
const config = require('./softconfig');

/*

// TODO: download plugins from git using simple-git
// TODO: update plugins via git pull if there's no pending changes
// TODO: run plugin by either index.js or omegga.entrypoint file w/ stdio message passing
  json rpc?
// TODO: web interface instead of blessed

// TODO: Main node runs webserver hand has json rpc between sub nodes (and self)
// TODO: If Main node goes down, the other nodes know which one to spin up a new webserver from
// TODO: Connect sub nodes to main by JSONRPC

*/

const program = require('commander')
  .description(package.description)
  .option('-s, --serverless', 'Run omegga without a webserver')
  .option('-p, --port', 'Specify a custom port for the webserver (default 8080)')
  .version(package.version)
  .action(() => {
    // TODO: start server if in configured folder
    // TODO: send message to run init otherwise
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
  .command('start')
  .description('Starts the server')
  .alias('s')
  .action(() => {
    require('./cli/server.js');
    // TODO: same as if run without commands
  });

program
  .command('info')
  .description('Shows server name, description, port, install info, and installed plugins')
  .alias('n')
  .action(() => {
    // TODO: implement config parsing
  });

program
  .command('install') // TODO: implement install command
  .description('Installs a plugin to the current brickadia server')
  .option('-f, --force', 'Forcefully re-install existing plugin') // TODO: implement install --force
  .option('-q, --quiet', 'Disable output and interactive config at end of install') // TODO: implement install --quiet
  .option('-c, --config', 'JSON default config') // TODO: implement install --config
  .alias('i')
  .arguments('<pluginUrl> [morePlugins...]')
  .action((plugin, otherPlugins, flags) => {
    // TODO: automatically fetch and install plugins
  });

program
  .command('update') // TODO: implement update plugins command
  .description('Updates all installed plugins to latest versions')
  .option('-f, --force', 'Forcefully re-install existing plugin') // TODO: implement update --force
  .option('-q, --quiet', 'Disable output and interactive config at end of install') // TODO: implement update --quiet
  .option('-c, --config', 'JSON default config') // TODO: implement update --config
  .alias('i')
  .arguments('[pluginName]')
  .action((plugin, flags) => {
    // TODO: automatically fetch and install plugins
  });

program.parse(process.argv);
