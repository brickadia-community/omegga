const fs = require('fs');
const path = require('path');
require('colors');

const package = require('../package');
const soft = require('./softconfig.js');
const Omegga = require('./omegga/server.js');
const config = require('./config/index.js');
const { Terminal, auth } = require('./cli/index.js');
const file = require('./util/file.js');

const updateNotifier = require('update-notifier');
updateNotifier({pkg: package}).notify();

/*

// TODO: download plugins from git using simple-git
// TODO: update plugins via git pull if there's no pending changes
// TODO: run plugin by either index.js or omegga.entrypoint file w/ stdio message passing
  json rpc?
// TODO: web interface instead of blessed

// TODO: let omegga bundle config (roles, bans, server config) to zip
// TODO: let omegga unbundle config from zip to current omegga dir
*/

const err = (...args) => console.error('!>'.red, ...args);
const log = (...args) => console.log('>>'.green, ...args);

// write a default config file
const createDefaultConfig = () => {
  log('Created default config file');
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
    const { serverless, webless, port, debug } = program.opts();

    // default working directory is the one specified in config
    let workDir = config.store.get('defaultOmegga');

    // if there's a config in the current directory, use that one instead
    if (config.find('.'))
      workDir = '.';

    // check if configured path exists
    if (!fs.existsSync(workDir)) {
      err('configured omegga default path does not exist');
      process.exit(1);
      return;
    }
    if (!fs.statSync(workDir).isDirectory) {
      err('configured omegga default path is not a directory')
      process.exit(1);
      return;
    }

    // find the config for the working directory
    const configFile = config.find(workDir);
    let conf;

    // create a default config file if it does not already exist, otherwise load in the existing one
    if (!configFile) {
      conf = createDefaultConfig();
    } else {
      conf = config.read(configFile);
    }

    // check if the auth files don't exist
    if (!auth.exists(path.join(workDir, soft.DATA_PATH, 'Saved/Auth')) && !auth.exists()) {
      const success = await auth.prompt();
      if (!success) {
        err('Start aborted - could not generate auth tokens');
        process.exit(1);
        return;
      }
    }

    // build options
    const options = { noserver: serverless || true, noweb: webless, port, debug };

    // setup the server
    const server = new Omegga(workDir, conf, options);

    // create a terminal
    Omegga.setTerminal(new Terminal(server, options));
    Omegga.log('>>'.green, 'Starting server...');

    // start the server
    server.start();
  });

program
  .command('init')
  .description('Sets up the current directory as a brickadia server')
  .action(() => {
    const configFile = config.find('.');
    if (configFile) {
      err('Config file already exists:', configFile.yellow.underline);
      process.exit(1);
      return;
    }
    createDefaultConfig();
  });

program
  .command('config <field> [value]')
  .description('Configure Omegga\'s default behavior.\n' +
    'Type ' + 'omegga config list'.yellow.underline + ' for current settings and available fields'
  )
  .action((field, value) => {
    const fields = {
      default: {
        desc: 'default omegga project directory when running omegga in a non-configured folder',
        example: 'omegga config default $(pwd)',
        default: '.',
        get: () => {
          let val = config.store.get('defaultOmegga') || '.';
          if (val === '.') val += ' [current working dir]'.grey;
          return val;
        },
        set: val => {
          if (!val) {
            val = '.';
          }

          // check if the path is valid
          if (val !== '.' && !path.isAbsolute(val)) {
            err('setting must be an absolute path or "."');
            process.exit(1);
            return;
          }
          if (!fs.existsSync(val)) {
            err('given path does not exist');
            process.exit(1);
            return;
          }
          if (!fs.statSync(val).isDirectory) {
            err('given path is not for a directory');
            process.exit(1);
            return;
          }

          // update the setting
          config.store.set('defaultOmegga', val);
          log('Set', 'default'.green, 'to', val.green)
        },
      },
    };

    if (field === 'list') {
      log('Configurable fields:')
      const maxLen = Math.max(...Object.keys(fields).map(f => f.length));
      for (const key in fields) {
        const field = fields[key];
        console.log('\n  ' + key.yellow.underline,
          '-'.padStart(maxLen - key.length + 1),
          field.desc,
        );
        console.log('    current'.brightGreen + ':', field.get());
        console.log('    default:', field.default);
        console.log('    example'.brightBlue + ':', field.example);
      }
      console.log();
    } else if (fields[field]) {
      fields[field].set(value);
    } else {
      error('invalid field, run', 'omegga config list'.yellow.underline, 'for a list of available fields');
      process.exit(1);
    }
  });

program
  .command('auth')
  .option('-c, --clean', 'Remove old auth files')
  .option('-f, --force', 'Forcefully regenerate auth token')
  .description('Generates server auth tokens from brickadia account email+password')
  .action(() => {
    const { clean, force } = program.opts;
    if (clean || force) {
      log('Clearing old auth files');
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
    err('not implemented yet');
    // TODO: implement config parsing
  });

program
  .command('install <plugin url> [...otherPlugins]') // TODO: implement install command
  .alias('i')
  .description('Installs a plugin to the current brickadia server')
  .option('-f, --force', 'Forcefully re-install existing plugin') // TODO: implement install --force
  .option('-c, --config', 'JSON default config') // TODO: implement install --config
  .arguments('<pluginUrl> [morePlugins...]')
  .action((plugin, otherPlugins) => {
    err('not implemented yet');
    // TODO: automatically fetch and install plugins
  });

program
  .command('update [...pluginNames]') // TODO: implement update plugins command
  .alias('u')
  .description('Updates all or selected installed plugins to latest versions')
  .option('-f, --force', 'Forcefully re-install existing plugin') // TODO: implement update --force
  .option('-c, --config', 'JSON default config') // TODO: implement update --config
  .action((plugin) => {
    err('not implemented yet');
    // TODO: automatically fetch and install plugins
  });

program.parse(process.argv);
