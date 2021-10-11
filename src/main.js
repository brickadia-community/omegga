const fs = require('fs');
const path = require('path');
require('colors');

const pkg = require('../package');
const soft = require('./softconfig.js');
const Omegga = require('./omegga/server.js');
const config = require('./config/index.js');
const { Terminal, auth, config: omeggaConfig, pluginUtil } = require('./cli/index.js');
const file = require('./util/file.js');

const updateNotifier = require('update-notifier');
const notifier = updateNotifier({
  isGlobal: true,
  pkg: pkg,
  updateCheckInterval: 1000 * 60 * 60 * 24,
}).notify();

/*
// TODO: let omegga bundle config (roles, bans, server config) to zip
// TODO: let omegga unbundle config from zip to current omegga dir
*/

const err = (...args) => console.error('!>'.red, ...args);
const log = (...args) => console.log('>>'.green, ...args);
const verboseLog = (...args) => {
  if (!global.VERBOSE) return;
  if (Omegga.log)
    Omegga.log('V>'.magenta, ...args);
  else
    console.log('V>'.magenta, ...args);
};

// write a default config file
const createDefaultConfig = () => {
  log('Created default config file');
  config.write(soft.CONFIG_FILENAMES[0] + '.yml', config.defaultConfig);
  file.mkdir('data/Saved/Builds');
  file.mkdir('plugins');
  return config.defaultConfig;
};

const program = require('commander')
  .description(pkg.description)
  .version(pkg.version)
  .option('-d, --debug', 'Print all console logs rather than just chat messages')
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .action(async() => {
    const { debug, verbose } = program.opts();
    global.VERBOSE = verbose;

    // default working directory is the one specified in config
    let workDir = config.store.get('defaultOmegga');
    verboseLog('Using working directory', workDir.yellow);

    // check if a local install exists
    const localInstall = fs.existsSync(soft.LOCAL_LAUNCHER);

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
      err('configured omegga default path is not a directory');
      process.exit(1);
      return;
    }

    // find the config for the working directory
    const configFile = config.find(workDir);
    let conf;

    // create a default config file if it does not already exist, otherwise load in the existing one
    if (!configFile) {
      verboseLog('Creating a new config');
      conf = createDefaultConfig();
    } else {
      verboseLog('Reading config file from', configFile.yellow);
      conf = config.read(configFile);
    }

    // if local install is provided
    if (localInstall) {
      verboseLog('Using omegga\'s brickadia-launcher');
      conf.server.__LOCAL = true;
    }

    // check if the auth files don't exist
    if (!auth.exists(path.join(workDir, soft.DATA_PATH, 'Saved/Auth')) && !auth.exists()) {
      const success = await auth.prompt({
        debug,
        email: process.env.BRICKADIA_USER ?? null,
        password: process.env.BRICKADIA_PASS ?? null,
        branch: conf?.server?.branch ?? null,
      });
      if (!success) {
        err('Start aborted - could not generate auth tokens');
        process.exit(1);
        return;
      }
    }

    // build options
    const options = {
      // default enable web ui (set to false)
      noweb: typeof conf.omegga.webui === 'boolean' && !conf.omegga.webui,
      // default enable https (set to true, will not be https if it can't generate)
      https: typeof conf.omegga.https !== 'boolean' || conf.omegga.https,
      port: conf.omegga.port || soft.DEFAULT_PORT,
      debug,
    };

    verboseLog('Launching with options', options);

    // setup the server
    const server = new Omegga(workDir, conf, options);
    verboseLog('Created omegga object');

    if (verbose) {
      server.on('*', ev => ev !== 'line' && verboseLog('EVENT'.green, ev));
    }

    // create a terminal
    Omegga.setTerminal(new Terminal(server, options));

    if (notifier.update) {
      Omegga.log('>>'.green, `Update is available (${('v'+notifier.update.latest).yellow})! Run`, 'npm i -g omegga'.yellow, 'to update!');
    }

    Omegga.log('>>'.green, `Launching brickadia server on port ${(''+(conf.server.port || 7777)).green}...`);

    // start the server
    verboseLog('Starting Omegga');
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
  .command('config [field] [value]')
  .description('Configure Omegga\'s default behavior.\n' +
    'Type ' + 'omegga config list'.yellow.underline + ' for current settings and available fields'
  )
  .action((field, value) => {
    if (!field)
      field = 'list';
    omeggaConfig(field, value, program.opts());
  });

program
  .command('auth')
  .option('-g, --global', 'Remove global auth files')
  .option('-l, --local', 'Remove local auth files')
  .option('-w, --workdir', 'Remove configured location auth files')
  .option('-u, --email <email>', 'User email (must provide password)')
  .option('-p, --pass <password>', 'User password (must provide email)')
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .description('Generates server auth tokens from brickadia account email+password')
  .action(async ({ email, pass: password, local: localAuth, workDir, global: globalAuth }) => {
    const { verbose, debug } = program.opts();
    global.VERBOSE = verbose;
    const workdirPath = path.join(config.store.get('defaultOmegga'), 'data/Saved/Auth');


    if (globalAuth || localAuth) {
      if (globalAuth) {
        log('Clearing auth files from', auth.AUTH_PATH.yellow);
        auth.clean();
      }
      if (workDir) {
        log('Clearing auth files from', workdirPath.yellow);
        await file.rmdir(workdirPath);
      }
      if (localAuth) {
        const localPath = path.resolve('data/Saved/Auth');
        log('Clearing auth files from', localPath.yellow);
        await file.rmdir(localPath);
      }
      return;
    } else {

      let branch;

      // if there's a config in the current directory, use that one instead
      if (config.find('.'))
        workDir = '.';

      // check if configured path exists
      if (fs.existsSync(workDir) && fs.statSync(workDir).isDirectory) {
        // find the config for the working directory
        const configFile = config.find(workDir);
        try {
          // read the config and extract the branch
          const conf = config.read(configFile);
          branch = conf?.server?.branch;
        } catch (err) {
          err('Error reading config file');
          verboseLog(err);
        }
      }

      // auth with that branch
      auth.prompt({email, password, debug, branch });
    }
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
  .command('install <pluginUrl...>')
  .alias('i')
  .description('Installs a plugin to the current brickadia server')
  .option('-f, --force', 'Forcefully re-install existing plugin') // TODO: implement install --force
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .action((plugins) => {
    if (!require('hasbin').sync('git')) {
      err('git'.yellow, 'must be installed to install plugins.');
      process.exit(1);
      return;
    }

    if (!config.find('.')) {
      err('Not an omegga directory, run ', 'omegga init'.yellow, 'to setup one.');
      process.exit(1);
      return;
    }
    const { verbose, force } = program.opts();
    global.VERBOSE = verbose;
    pluginUtil.install(plugins, { verbose, force });
  });

program
  .command('update [pluginNames...]')
  .alias('u')
  .description('Updates all or selected installed plugins to latest versions')
  .option('-f, --force', 'Forcefully re-upgrade existing plugin') // TODO: implement update --force
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .action((plugins) => {
    if (!config.find('.')) {
      err('Not an omegga directory, run ', 'omegga init'.yellow, 'to setup one.');
      process.exit(1);
      return;
    }
    const { verbose, force } = program.opts();
    global.VERBOSE = verbose;
    pluginUtil.update(plugins, { verbose, force });
  });

program
  .command('check [pluginNames...]')
  .description('Checks plugins for compatibility issues')
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .action((plugins) => {
    if (!config.find('.')) {
      err('Not an omegga directory, run ', 'omegga init'.yellow, 'to setup one.');
      process.exit(1);
      return;
    }
    const { verbose } = program.opts();
    global.VERBOSE = verbose;
    pluginUtil.check(plugins, { verbose });
  });

program.parse(process.argv);
