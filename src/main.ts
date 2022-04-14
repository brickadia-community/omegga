import soft from '@/softconfig';
import * as config from '@config';
import Omegga from '@omegga/server';
import * as file from '@util/file';
import 'colors';
import commander from 'commander';
import fs from 'fs';
import path from 'path';
import updateNotifier from 'update-notifier';
const pkg = require('../package.json');
import { auth, config as omeggaConfig, pluginUtil, Terminal } from './cli';
import { IConfig } from './config/types';
import Logger from './logger';

const notifier = updateNotifier({
  pkg,
  updateCheckInterval: 1000 * 60 * 60 * 24,
});
notifier.notify();

// TODO: let omegga bundle config (roles, bans, server config) to zip
// TODO: let omegga unbundle config from zip to current omegga dir

// write a default config file
const createDefaultConfig = () => {
  Logger.logp('Created default config file');
  config.write(soft.CONFIG_FILENAMES[0] + '.yml', config.defaultConfig);
  file.mkdir('data/Saved/Builds');
  file.mkdir('plugins');
  return config.defaultConfig;
};

const program = commander
  .description(pkg.description)
  .version(pkg.version)
  .option(
    '-d, --debug',
    'Print all console logs rather than just chat messages'
  )
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .action(async () => {
    const { debug, verbose } = program.opts();
    Logger.VERBOSE = verbose;

    // default working directory is the one specified in config
    let workDir = config.store.get('defaultOmegga');
    Logger.verbose('Using working directory', workDir?.yellow);

    // check if a local install exists
    const localInstall = fs.existsSync(soft.LOCAL_LAUNCHER);

    // if there's a config in the current directory, use that one instead
    if (config.find('.')) workDir = '.';

    // check if configured path exists
    if (!fs.existsSync(workDir)) {
      Logger.errorp('configured omegga default path does not exist');
      process.exit(1);
    }
    if (!fs.statSync(workDir).isDirectory) {
      Logger.errorp('configured omegga default path is not a directory');
      process.exit(1);
    }

    // find the config for the working directory
    const configFile = config.find(workDir);
    Logger.verbose('Target config file:', configFile?.yellow);
    let conf: IConfig;

    // create a default config file if it does not already exist, otherwise load in the existing one
    if (!configFile) {
      Logger.verbose('Creating a new config');
      conf = createDefaultConfig();
    } else {
      Logger.verbose('Reading config file');
      conf = config.read(configFile);
    }

    // if local install is provided
    if (localInstall) {
      Logger.verbose("Using omegga's brickadia-launcher");
      conf.server.__LOCAL = true;
    }

    // check if the auth files don't exist
    if (
      !auth.exists(path.join(workDir, soft.DATA_PATH, 'Saved/Auth')) &&
      !auth.exists()
    ) {
      const success = await auth.prompt({
        debug,
        email: process.env.BRICKADIA_USER ?? undefined,
        password: process.env.BRICKADIA_PASS ?? undefined,
        branch: conf?.server?.branch ?? undefined,
      });
      if (!success) {
        Logger.errorp('Start aborted - could not generate auth tokens');
        process.exit(1);
        return;
      }
    }

    // build options
    const options = {
      // default enable web ui (set to false)
      noweb: typeof conf.omegga?.webui === 'boolean' && !conf.omegga?.webui,
      // default enable https (set to true, will not be https if it can't generate)
      https: typeof conf.omegga?.https !== 'boolean' || conf.omegga?.https,
      port: conf.omegga?.port || soft.DEFAULT_PORT,
      debug,
    };

    Logger.verbose('Launching with options', options);

    // setup the server
    const server = new Omegga(workDir, conf, options);
    Logger.verbose('Created omegga object');

    if (verbose) {
      server.on(
        '*',
        (ev: string) => ev !== 'line' && Logger.verbose('EVENT'.green, ev)
      );
    }

    // create a terminal
    Logger.setTerminal(new Terminal(server, options));

    if (notifier.update) {
      Logger.logp(
        `Update is available (${('v' + notifier.update.latest).yellow})! Run`,
        'npm i -g omegga'.yellow,
        'to update!'
      );
    }

    Logger.logp(
      `Launching brickadia server on port ${
        ('' + (conf.server.port || 7777)).green
      }...`
    );

    // start the server
    Logger.verbose('Starting Omegga');
    server.start();
  });

program
  .command('init')
  .description('Sets up the current directory as a brickadia server')
  .action(async () => {
    const configFile = config.find('.');
    if (configFile) {
      Logger.errorp('Config file already exists:', configFile.yellow.underline);
      process.exit(1);
    }
    createDefaultConfig();
  });

program
  .command('config [field] [value]')
  .description(
    "Configure Omegga's default behavior.\n" +
      'Type ' +
      'omegga config list'.yellow.underline +
      ' for current settings and available fields'
  )
  .action(async (field, value) => {
    if (!field) field = 'list';
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
  .description(
    'Generates server auth tokens from brickadia account email+password'
  )
  .action(
    async ({
      email,
      pass: password,
      local: localAuth,
      workDir,
      global: globalAuth,
    }) => {
      const { verbose, debug } = program.opts();
      Logger.VERBOSE = verbose;
      const workdirPath = path.join(
        config.store.get('defaultOmegga'),
        'data/Saved/Auth'
      );

      if (globalAuth || localAuth) {
        if (globalAuth) {
          Logger.logp('Clearing auth files from', auth.AUTH_PATH.yellow);
          auth.clean();
        }
        if (workDir) {
          Logger.logp('Clearing auth files from', workdirPath.yellow);
          await file.rmdir(workdirPath);
        }
        if (localAuth) {
          const localPath = path.resolve('data/Saved/Auth');
          Logger.logp('Clearing auth files from', localPath.yellow);
          await file.rmdir(localPath);
        }
        return;
      } else {
        let branch;

        // if there's a config in the current directory, use that one instead
        if (config.find('.')) workDir = '.';

        // check if configured path exists
        if (fs.existsSync(workDir) && fs.statSync(workDir).isDirectory) {
          // find the config for the working directory
          const configFile = config.find(workDir);
          try {
            // read the config and extract the branch
            const conf = config.read(configFile);
            branch = conf?.server?.branch;
          } catch (error) {
            Logger.errorp('Error reading config file');
            Logger.verbose(error);
          }
        }

        // auth with that branch
        auth.prompt({ email, password, debug, branch });
      }
    }
  );

program
  .command('info')
  .alias('n')
  .description(
    'Shows server name, description, port, install info, and installed plugins'
  )
  .action(async () => {
    Logger.errorp('not implemented yet');
    // TODO: implement config parsing
  });

program
  .command('install <pluginUrl...>')
  .alias('i')
  .description('Installs a plugin to the current brickadia server')
  .option('-f, --force', 'Forcefully re-install existing plugin') // TODO: implement install --force
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .action(async plugins => {
    if (!require('hasbin').sync('git')) {
      Logger.errorp('git'.yellow, 'must be installed to install plugins.');
      process.exit(1);
      return;
    }

    if (!config.find('.')) {
      Logger.errorp(
        'Not an omegga directory, run ',
        'omegga init'.yellow,
        'to setup one.'
      );
      process.exit(1);
      return;
    }
    const { verbose, force } = program.opts();
    Logger.VERBOSE = verbose;
    pluginUtil.install(plugins, { verbose, force });
  });

program
  .command('update [pluginNames...]')
  .alias('u')
  .description('Updates all or selected installed plugins to latest versions')
  .option('-f, --force', 'Forcefully re-upgrade existing plugin') // TODO: implement update --force
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .action(async plugins => {
    if (!config.find('.')) {
      Logger.errorp(
        'Not an omegga directory, run ',
        'omegga init'.yellow,
        'to setup one.'
      );
      process.exit(1);
      return;
    }
    const { verbose, force } = program.opts();
    Logger.VERBOSE = verbose;
    pluginUtil.update(plugins, { verbose, force });
  });

program
  .command('check [pluginNames...]')
  .description('Checks plugins for compatibility issues')
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .action(async plugins => {
    if (!config.find('.')) {
      Logger.errorp(
        'Not an omegga directory, run ',
        'omegga init'.yellow,
        'to setup one.'
      );
      process.exit(1);
    }
    const { verbose } = program.opts();
    Logger.VERBOSE = verbose;
    pluginUtil.check(plugins, { verbose });
  });

program
  .command('init-plugin <pluginName>')
  .description('Initializes a new plugin with the given name and settings')
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .option(
    '-t, --type <type>',
    'The type of plugin to initialize. One of [safe, safe-ts, unsafe, rpc].',
    'safe'
  )
  .option('-a, --author <author>', 'The author of this plugin.', 'AUTHOR')
  .action(async (pluginName, { type, author }) => {
    const { verbose } = program.opts();
    Logger.VERBOSE = verbose;

    if (!pluginName.startsWith('omegga-')) pluginName = `omegga-${pluginName}`;

    pluginUtil.init(pluginName, author, type ?? 'safe');
  });

program.parseAsync(process.argv);
