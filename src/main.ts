import soft, { GAME_DIRNAME, OVERRIDE_GAME_DIR } from '@/softconfig';
import { installLauncher } from '@cli/installer';
import * as config from '@config';
import Omegga from '@omegga/server';
import * as file from '@util/file';
import 'colors';
import commander from 'commander';
import fs from 'fs';
import hasbin from 'hasbin';
import path from 'path';
import prompts from 'prompts';
import updateNotifier from 'update-notifier-cjs';
import { auth, config as omeggaConfig, pluginUtil, Terminal } from './cli';
import { IConfig } from './config/types';
import Logger from './logger';
import { GAME_BIN_PATH, GAME_INSTALL_DIR, STEAMCMD_PATH } from './softconfig';
import {
  hasSteamUpdate,
  steamcmdDownloadGame,
  steamcmdDownloadSelf,
} from './updater';
const pkg = require('../package.json');

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
  file.mkdir('data/${soft.CONFIG_SAVED_DIR}/Builds');
  file.mkdir('plugins');
  return config.defaultConfig;
};

const program = commander
  .description(pkg.description)
  .version(pkg.version)
  .option(
    '-d, --debug',
    'Print all console logs rather than just chat messages',
  )
  .option(
    '-u, --update',
    'Check for brickadia updates (on steam) and install them if available',
  )
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .action(async () => {
    const { debug, verbose, update } = program.opts();
    if (program.args.length > 0) {
      program.help();
      process.exit(1);
    }
    Logger.VERBOSE = Boolean(verbose);

    // default working directory is the one specified in config
    let workDir = config.store.get('defaultOmegga');
    Logger.verbose('Using working directory', workDir?.yellow);

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
      try {
        conf = config.read(configFile);
      } catch (error) {
        Logger.errorp('Error reading config file');
        Logger.verbose(error);
      }
    }

    const overrideBinary =
      OVERRIDE_GAME_DIR &&
      path.join(
        OVERRIDE_GAME_DIR, // from BRICKADIA_DIR env
        GAME_BIN_PATH,
      );

    const isSteam = !conf?.server?.branch;
    if (overrideBinary) {
      if (!fs.existsSync(overrideBinary)) {
        Logger.error(
          'Binary',
          overrideBinary.yellow,
          'in',
          'BRICKADIA_DIR'.yellow,
          'does not exist!',
        );
        process.exit(1);
      }

      Logger.verbose(
        'Using override binary',
        overrideBinary.yellow,
        '- skipping download.',
      );
    } else if (isSteam) {
      conf.__STEAM = true;
      await setupSteam(conf, update);
    } else {
      Logger.warnp(
        'Brickadia will be launched with',
        'non-steam launcher'.yellow,
      );

      // Check if the local launcher is installed
      if (fs.existsSync(soft.LOCAL_LAUNCHER)) {
        Logger.verbose("Using omegga's brickadia-launcher");
        conf.server.__LOCAL = true;
      } else {
        Logger.verbose("Installing launcher as it's missing");
        await installLauncher();
      }
    }

    const globalToken = auth.getGlobalToken();

    const hasHostingToken = Boolean(
      conf?.credentials?.token || process.env.BRICKADIA_TOKEN || globalToken,
    );

    // Skip auth when the hosting token is present
    if (hasHostingToken) {
      Logger.verbose(
        'Skipping auth token generation due to host token presence',
      );
      if (conf?.credentials?.token)
        Logger.verbose('Found token in config file');
      else if (process.env.BRICKADIA_TOKEN)
        Logger.verbose('Found token in', 'BRICKADIA_TOKEN'.yellow);
      else if (globalToken)
        Logger.verbose('Found token in omegga global config');
      else Logger.verbose('unreachable - no token found');

      // check if the auth files don't exist
    } else if (
      !auth.exists(
        path.join(
          workDir,
          soft.DATA_PATH,
          conf?.server?.savedDir ?? soft.CONFIG_SAVED_DIR,
          conf?.server?.authDir ?? soft.CONFIG_AUTH_DIR,
        ),
      )
    ) {
      const success = await auth.prompt({
        debug,
        email: conf?.credentials?.['email'] ?? process.env.BRICKADIA_USER,
        password: conf?.credentials?.['password'] ?? process.env.BRICKADIA_PASS,
        isSteam,
        branch: conf?.server?.branch,
        authDir: conf?.server?.authDir,
        savedDir: conf?.server?.savedDir,
        launchArgs: conf?.server?.launchArgs,
      });
      if (!success) {
        Logger.errorp('Start aborted - could not generate auth tokens');
        process.exit(1);
      }
    } else {
      Logger.verbose(
        'Skipping auth token generation due to existing auth files',
      );
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
        (ev: string) => ev !== 'line' && Logger.verbose('EVENT'.green, ev),
      );
    }

    // create a terminal
    Logger.setTerminal(new Terminal(server, options));

    if (notifier.update) {
      Logger.logp(
        `Omegga update is available (${('v' + notifier.update.latest).yellow})! Run`,
        'npm i -g omegga'.yellow,
        'to update!',
      );
    }

    if (conf.__STEAM && !update && !conf.server?.steambetaPassword) {
      hasSteamUpdate(conf.server?.steambeta).then(hasUpdate => {
        if (hasUpdate) {
          Logger.logp('A server update is available!'.brightBlue);
          Logger.log(
            '  Restart with',
            'omegga --update'.yellow,
            'to update every start.',
          );
          Logger.log('  Run', '/update'.yellow, 'to update', 'now'.green + '!');
        } else {
          Logger.verbose('No server updates available.');
        }
      });
    }

    Logger.logp(
      `Launching brickadia server on port ${
        ('' + (conf.server.port || 7777)).green
      }...`,
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
      ' for current settings and available fields',
  )
  .action((field, value) => {
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
    'Generates server auth tokens from brickadia account email+password',
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
      Logger.VERBOSE = Boolean(verbose);

      let branch: string, authDir: string, savedDir: string, launchArgs: string;
      let isSteam: boolean;

      // if there's a config in the current directory, use that one instead
      if (config.find('.')) workDir = '.';

      // check if configured path exists
      if (fs.existsSync(workDir) && fs.statSync(workDir).isDirectory) {
        Logger.verbose('Using working directory', workDir.yellow);
        // find the config for the working directory
        const configFile = config.find(workDir);
        Logger.verbose('Target config file:', configFile?.yellow);
        try {
          // read the config and extract the branch
          const conf = config.read(configFile);
          Logger.verbose(
            'Auth config:',
            conf?.server ?? 'no server config'.grey,
          );
          branch = conf?.server?.branch;
          authDir = conf?.server?.authDir;
          savedDir = conf?.server?.savedDir;
          launchArgs = conf?.server?.launchArgs;
          isSteam = !conf?.server?.branch;

          if (localAuth && conf?.credentials?.token) {
            Logger.logp(
              "This server's auth is managed by the token in",
              configFile.yellow,
            );
            return;
          }
        } catch (error) {
          Logger.errorp('Error reading config file');
          Logger.verbose(error);
        }
      } else {
        Logger.verbose('Using default working directory', workDir.yellow);
      }

      savedDir ??= soft.CONFIG_SAVED_DIR;

      const workdirPath = path.join(
        config.store.get('defaultOmegga'),
        `data/${savedDir}/Auth`,
      );

      if (globalAuth || localAuth) {
        if (globalAuth) {
          const globalAuthPath = path.join(
            soft.CONFIG_HOME,
            savedDir !== soft.CONFIG_SAVED_DIR ? savedDir : '',
            authDir ?? soft.CONFIG_AUTH_DIR,
          );
          Logger.logp('Clearing auth files from', globalAuthPath.yellow);
          auth.clean(globalAuthPath);
        }
        if (workDir) {
          Logger.logp('Clearing auth files from', workdirPath.yellow);
          await file.rmdir(workdirPath);
        }
        if (localAuth) {
          const localPath = path.resolve(
            `data/${savedDir}/`,
            authDir ?? soft.CONFIG_AUTH_DIR,
          );
          Logger.logp('Clearing auth files from', localPath.yellow);
          await file.rmdir(localPath);
        }
        return;
      }

      if (!isSteam) {
        Logger.warnp('Authenticating with', 'non-steam launcher'.yellow);
      }

      auth.prompt({
        email,
        password,
        debug,
        branch,
        authDir,
        savedDir,
        launchArgs,
      });
    },
  );

program
  .command('info')
  .alias('n')
  .description(
    'Shows server name, description, port, install info, and installed plugins',
  )
  .action(async () => {
    Logger.errorp('not implemented yet');
    // TODO: implement config parsing
  });

program
  .command('install <pluginUrl...>')
  .alias('i')
  .option('-f, --force', 'Forcefully re-install existing plugin') // TODO: implement install --force
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .description('Installs a plugin to the current brickadia server')
  .action(async plugins => {
    if (!hasbin.sync('git')) {
      Logger.errorp('git'.yellow, 'must be installed to install plugins.');
      process.exit(1);
    }

    if (!config.find('.')) {
      Logger.errorp(
        'Not an omegga directory, run ',
        'omegga init'.yellow,
        'to setup one.',
      );
      process.exit(1);
    }
    const { verbose, force } = program.opts();
    Logger.VERBOSE = Boolean(verbose);
    pluginUtil.install(plugins, { verbose, force });
  });

program
  .command('update [pluginNames...]')
  .alias('u')
  .option('-f, --force', 'Forcefully re-upgrade existing plugin') // TODO: implement update --force
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .description('Updates all or selected installed plugins to latest versions')
  .action(async plugins => {
    if (!config.find('.')) {
      Logger.errorp(
        'Not an omegga directory, run ',
        'omegga init'.yellow,
        'to setup one.',
      );
      process.exit(1);
    }
    const { verbose, force } = program.opts();
    Logger.VERBOSE = Boolean(verbose);
    pluginUtil.update(plugins, { verbose, force });
  });

program
  .command('check [pluginNames...]')
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .description('Checks plugins for compatibility issues')
  .action(async plugins => {
    if (!config.find('.')) {
      Logger.errorp(
        'Not an omegga directory, run ',
        'omegga init'.yellow,
        'to setup one.',
      );
      process.exit(1);
    }
    const { verbose } = program.opts();
    Logger.VERBOSE = Boolean(verbose);
    pluginUtil.check(plugins, { verbose });
  });

program
  .command('init-plugin')
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .description('Initializes a new plugin with the given name and settings')
  .action(async () => {
    const { verbose } = program.opts();
    Logger.VERBOSE = Boolean(verbose);

    pluginUtil.init();
  });

program
  .command('plugin-init')
  .description('Alias for ' + 'init-plugin'.yellow.underline)
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .action(async () => {
    const { verbose } = program.opts();
    Logger.VERBOSE = Boolean(verbose);

    pluginUtil.init();
  });

program
  .command('get-config <pluginName> [configName]')
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .option('-j, --json', 'Print config as json')
  .description(
    'Gets a config for a plugin. If ' +
      'configName'.yellow.underline +
      ' is omitted, returns all config values.',
  )
  .action(async (pluginName, configName) => {
    if (!config.find('.')) {
      Logger.errorp(
        'Not an omegga directory, run ',
        'omegga init'.yellow,
        'to setup one.',
      );
      process.exit(1);
    }
    const { verbose } = program.opts();
    const json = program.args.includes('-j') || program.args.includes('--json');
    Logger.VERBOSE = Boolean(verbose);
    if (!configName) {
      pluginUtil.listConfig(pluginName, json);
    } else {
      pluginUtil.getConfig(pluginName, configName, json);
    }
  });

program
  .command('set-config <pluginName> [configName] [configValue]')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('-v, --verbose', 'Print extra messages for debugging purposes')
  .description(
    'Sets a config for a plugin. If ' +
      'configValue'.yellow.underline +
      ' is omitted, the config will be reset. If ' +
      'configName'.yellow.underline +
      ' is omitted, the entire plugin config will be reset.',
  )
  .action(async (pluginName, configName, configValue) => {
    if (!config.find('.')) {
      Logger.errorp(
        'Not an omegga directory, run ',
        'omegga init'.yellow,
        'to setup one.',
      );
      process.exit(1);
    }
    const { verbose } = program.opts();
    const yes = program.args.includes('-y') || program.args.includes('--yes');
    Logger.VERBOSE = Boolean(verbose);
    if (!configName) {
      pluginUtil.resetAllConfigs(pluginName, yes);
    } else if (!configValue) {
      pluginUtil.resetConfig(pluginName, configName);
    } else {
      pluginUtil.setConfig(pluginName, configName, configValue);
    }
  });

program.parseAsync(process.argv);

async function setupSteam(config: config.IConfig, forceUpdate = false) {
  const steambeta = config?.server?.steambeta;
  const steambetaPassword = config?.server?.steambetaPassword;

  const binaryPath = path.join(
    GAME_INSTALL_DIR, // steam install directory
    steambeta ?? 'main', // steam beta branch (or main)
    GAME_DIRNAME, // Brickadia
    GAME_BIN_PATH, // path to binary
  );

  if (!forceUpdate && fs.existsSync(binaryPath)) {
    Logger.verbose(
      'Game binary already exists at',
      binaryPath.yellow,
      '- skipping download.',
    );
    return;
  }

  // Check if steamcmd is installed
  if (!fs.existsSync(STEAMCMD_PATH)) {
    // Lookup steamcmd in path
    const hasSteamcmd = hasbin.sync('steamcmd');

    if (!hasSteamcmd) {
      // Prompt to install steamcmd
      const { install } = await prompts({
        type: 'confirm',
        name: 'install',
        message: 'SteamCMD is not installed. OK to download it?',
        initial: true,
      });

      if (!install) {
        Logger.errorp('SteamCMD is required for steam support. Exiting...');
        process.exit(1);
      }

      Logger.logp('Downloading SteamCMD...');
    }

    try {
      steamcmdDownloadSelf();
      if (!fs.existsSync(STEAMCMD_PATH)) {
        Logger.errorp('Failed to setup SteamCMD. Exiting...');
        process.exit(1);
      }
    } catch (err) {
      Logger.errorp('Error setting up SteamCMD:', err);
      process.exit(1);
    }
  }

  Logger.logp('Downloading Brickadia', (steambeta ?? 'main').yellow, '...');
  try {
    steamcmdDownloadGame({ steambeta, steambetaPassword });
  } catch (err) {
    Logger.errorp('Error downloading Brickadia:', err);
    process.exit(1);
  }
}
