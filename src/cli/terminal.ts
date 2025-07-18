import { OmeggaPlayer } from '@/plugin';
import { steamcmdDownloadGame } from '@/updater';
import Omegga from '@omegga/server';
import { IOmeggaOptions } from '@omegga/types';
import { sanitize } from '@util/chat';
import readline from 'readline';
import { install } from './plugin';

declare global {
  interface String {
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  }
}

let log: (...args: any[]) => void,
  err: (...args: any[]) => void,
  warn: (...args: any[]) => void,
  info: (...args: any[]) => void;

type TerminalCommand = {
  aliases: string[];
  desc: string;
  descLines?: () => string[];
  fn(this: Terminal, ...args: string[]): void | Promise<void>;
};

function gameCommand(
  aliases: string[],
  desc: string,
  usage: string,
  command: string,
  quoteArgs?: boolean,
): TerminalCommand {
  return {
    aliases,
    desc,
    fn(...args) {
      if (!this.omegga.started) {
        err('The server is not running');
        return;
      }
      if (!args.length) {
        err('usage:', ('/' + aliases[0] + ' ' + usage).yellow);
        return;
      }
      this.omegga.writeln(
        `${command} ${quoteArgs ? '"' : ''}${args.join(' ')}${
          quoteArgs ? '"' : ''
        }`,
      );
      this.rl.prompt(true);
    },
  };
}

const COMMANDS: TerminalCommand[] = [
  // Brickadia commands
  gameCommand(
    ['kick'],
    'kick a player',
    '<name|id> [reason]',
    'Chat.Command /Kick',
  ),
  gameCommand(
    ['ban', 'banish'],
    'ban a player',
    '<name|id> [time] [reason]',
    'Ban',
  ),
  gameCommand(
    ['unban', 'pardon'],
    'unban a player',
    '<name|id>',
    'Chat.Command /Unban',
  ),
  gameCommand(
    ['grantrole', 'giverole'],
    'grant a role to a player',
    '<role> <name|id>',
    'Chat.Command /GrantRole',
  ),
  gameCommand(
    ['revokerole', 'takerole'],
    'revoke a role from a player',
    '<role> <name|id>',
    'Chat.Command /RevokeRole',
  ),
  gameCommand(
    ['clearbricks'],
    "clear a player's bricks",
    '<name|id>',
    'Bricks.Clear',
    true,
  ),
  gameCommand(['clearallbricks'], 'clear all bricks', '', 'Bricks.ClearAll'),

  // Help command
  {
    aliases: ['help', 'cmds', 'commands'],
    desc: 'list supported commands and their descriptions',
    fn() {
      const maxLen = Math.max(...COMMANDS.map(c => c.aliases[0].length));
      log('Omegga Help Text:\n');
      log(
        '  Console input not starting with / will be sent in chat from a "SERVER" user',
      );
      log(
        '  Console input starting with / will be treated as one of the following commands\n',
      );
      log(
        '-- Available Omegga commands (type',
        '/command'.yellow.underline,
        'to run)',
      );

      for (const command of COMMANDS.sort((a, b) =>
        a.aliases[0].localeCompare(b.aliases[0]),
      )) {
        const name = command.aliases[0];
        this.log(
          '  ',
          ('/' + name).yellow.underline,
          '-'.padStart(maxLen - name.length + 1),
          command.desc,
        );
        if (command.descLines)
          for (const descLine of command.descLines())
            this.log('    ', ' '.repeat(maxLen + 1), descLine);
      }
    },
  },

  // Server controls
  {
    aliases: ['stop'],
    desc: 'stop the server and close Omegga',
    async fn() {
      log('Stopping server...');
      await this.omegga.stop();
      process.exit();
    },
  },
  {
    aliases: ['restart'],
    desc: 'trigger a server restart (without announcement or saving)',
    async fn() {
      log('Restarting server...');
      await this.omegga.restartServer();
    },
  },
  {
    aliases: ['update'],
    desc: 'try to update the server and restart if started (without announcement or saving',
    async fn() {
      if (!this.omegga.config.__STEAM) {
        err(
          'This command is only available when the server is installed via SteamCMD',
        );
        return;
      }
      if (this.omegga.stopping || this.omegga.starting) {
        err(
          'The server is currently starting or stopping. Please wait a moment',
        );
        return;
      }
      const wasStarted = this.omegga.started;
      if (wasStarted) {
        log('Stopping server to update...');
        await this.omegga.stop();
      }
      log('Updating server...');
      try {
        steamcmdDownloadGame({
          steambeta: this.omegga.config.server?.steambeta,
          steambetaPassword: this.omegga.config.server?.steambetaPassword,
        });
        log('Server updated successfully.');
      } catch (e) {
        err('Error updating server:', e);
      }
      if (wasStarted) {
        log('Starting server...');
        await this.omegga.start();
      }
    },
  },
  {
    aliases: ['kill'],
    desc: 'forcefully kill brickadia server process without closing omegga',
    async fn() {
      log('Stopping server...');
      await this.omegga.stop();
    },
  },
  {
    aliases: ['start'],
    desc: 'start the server if it is stopped',
    fn() {
      if (
        !this.omegga ||
        (this.omegga && (this.omegga.starting || this.omegga.started))
      ) {
        err('The server is already running');
        return;
      }

      log('Starting server...');
      this.omegga.start();
    },
  },
  {
    aliases: ['cmd'],
    desc: 'run a console command on the Brickadia server. requires /debug for log to show',
    fn(...args) {
      if (!this.omegga.started) {
        err('The server is not running');
        return;
      }
      this.omegga.writeln(args.join(' '));
    },
  },
  {
    aliases: ['debug'],
    desc: 'toggle visibility of brickadia console logs',
    fn() {
      this.options.debug = !this.options.debug;
      log(
        'Brickadia logs now',
        this.options.debug ? 'visible'.green : 'hidden'.red,
      );
    },
  },
  {
    aliases: ['status'],
    desc: 'display server status information. brick count, online players, etc',
    async fn() {
      if (!this.omegga.started) {
        err('Omegga is not running');
        return;
      }
      const msToTime = (ms: number) => new Date(ms).toISOString().slice(11, 19);
      try {
        const status = await this.omegga.getServerStatus();

        log('Server Status');
        this.log(`
${status.serverName.yellow}
Bricks: ${(status.bricks + '').yellow}
Components: ${(status.components + '').yellow}
Uptime: ${msToTime(status.time).yellow}
Players: ${status.players.length === 0 ? 'none'.grey : ''}
  ${status.players
    .map(p => `[${msToTime(p.time).grey}] ${p.name.brightYellow}`)
    .join('\n      ')}
`);
      } catch (e) {
        err('An error occurred while getting server status');
      }
    },
  },

  // plugin stuff
  {
    aliases: ['reload'],
    desc: 'shorthand for /plugins reload',
    async fn() {
      await COMMANDS.find(c => c.aliases.includes('plugins')).fn.bind(this)(
        'reload',
      );
    },
  },
  {
    aliases: ['plugins', 'plugin', 'p'],
    desc: 'manage Omegga plugins',
    descLines: () => [
      '/plugins install <...plugin names>'.yellow + ' installs plugins',
      '/plugins load <...plugin names>'.yellow +
        ' loads plugins, and enables if they were disabled',
      '/plugins unload <...plugin names>'.yellow + ' unloads plugins',
      '/plugins reload [...plugin names]'.yellow +
        ' reloads all plugins, or those specified',
      '/plugins enable <...plugin names>'.yellow + ' enables plugins',
      '/plugins disable <...plugin names>'.yellow +
        ' disables plugins, and unloads if they were loaded',
    ],
    async fn(subcommand: string, ...args: string[]) {
      if (!this.omegga.pluginLoader) {
        err('Omegga is not using plugins');
        return;
      }

      if (!subcommand) {
        const plugins = this.omegga.pluginLoader.plugins;
        if (plugins.length === 0) {
          log('No plugins are installed');
          log('  Install some with', '/plugins install'.yellow.underline);
        } else {
          log('Installed plugins'.yellow.underline);
          for (const plugin of plugins) {
            const name = plugin.getName();
            const docs = plugin.getDocumentation();
            if (plugin.isLoaded()) log(name.cyan.underline + ' (loaded)');
            else if (plugin.isEnabled())
              log(name.green.underline + ' (enabled, not loaded)');
            else log(name.red.underline + ' (disabled)');

            log('  ' + docs.description);
            log(('  Author: ' + docs.author).gray);
          }
        }
      } else if (subcommand === 'install') {
        // install plugins
        await install(args, { verbose: true });
        log();
        log(
          'Use',
          '/plugins reload'.yellow,
          'to reload all plugins and use the installed ones',
        );
      } else if (subcommand === 'load') {
        if (args.length === 0) {
          log('Please specify at least one plugin to load');
          return;
        }

        for (const pluginName of args) {
          const plugin = this.omegga.pluginLoader.plugins.find(
            p => p.getName().toLowerCase() === pluginName.toLowerCase(),
          );

          if (!plugin) {
            warn('No plugin by the name', pluginName.cyan);
            continue;
          }

          const name = plugin.getName();
          if (plugin.isLoaded()) {
            warn(
              name.cyan,
              'is already loaded, reload with',
              ('/plugins reload ' + name).yellow,
            );
            return;
          }

          if (!plugin.isEnabled()) {
            log('Enabling and loading', name.cyan.underline);
            plugin.setEnabled(true);
            await plugin.load();
          } else {
            log('Loading', name.cyan.underline);
            await plugin.load();
          }
        }
      } else if (subcommand === 'unload') {
        if (args.length === 0) {
          log('Please specify at least one plugin to unload');
          return;
        }

        for (const pluginName of args) {
          const plugin = this.omegga.pluginLoader.plugins.find(
            p => p.getName().toLowerCase() === pluginName.toLowerCase(),
          );

          if (!plugin) {
            warn('No plugin by the name', pluginName.cyan);
            continue;
          }

          const name = plugin.getName();
          if (!plugin.isLoaded()) {
            warn(
              name.cyan,
              'is already unloaded, load with',
              ('/plugins load ' + name).yellow,
            );
            return;
          }

          log('Unloading', name.cyan.underline);
          await plugin.unload();
        }
      } else if (subcommand === 'reload') {
        let plugins = (
          args.length === 0
            ? this.omegga.pluginLoader.plugins
            : this.omegga.pluginLoader.plugins.filter(p =>
                args
                  .map(a => a.toLowerCase())
                  .includes(p.getName().toLowerCase()),
              )
        ).filter(p => p.isEnabled());

        const loaded = plugins.filter(p => p.isLoaded());
        log('Unloading', loaded.length, 'plugins');
        for (const plugin of loaded) await plugin.unload();

        if (args.length === 0) {
          log('Scanning for new plugins');
          if (!(await this.omegga.pluginLoader.scan())) {
            err('Could not scan for plugins. All plugins are unloaded');
            return;
          }
        }

        plugins = (
          args.length === 0
            ? this.omegga.pluginLoader.plugins
            : this.omegga.pluginLoader.plugins.filter(p =>
                args
                  .map(a => a.toLowerCase())
                  .includes(p.getName().toLowerCase()),
              )
        ).filter(p => p.isEnabled());
        log('Loading', plugins.length, 'plugins');
        for (const plugin of plugins) await plugin.load();

        log('Reloaded', plugins.length, 'plugins');
      } else if (subcommand === 'enable') {
        if (args.length === 0) {
          log('Please specify at least one plugin to enable');
          return;
        }

        for (const pluginName of args) {
          const plugin = this.omegga.pluginLoader.plugins.find(
            p => p.getName().toLowerCase() === pluginName.toLowerCase(),
          );

          if (!plugin) {
            warn('No plugin by the name', pluginName.cyan);
            continue;
          }

          const name = plugin.getName();
          if (plugin.isEnabled()) {
            warn(
              name.cyan,
              'is already enabled, disable with',
              ('/plugins disable ' + name).yellow,
            );
            return;
          }

          log(
            'Enabling',
            name.cyan.underline,
            '(load with',
            ('/plugins load ' + name).yellow + ')',
          );
          plugin.setEnabled(true);
        }
      } else if (subcommand === 'disable') {
        if (args.length === 0) {
          log('Please specify at least one plugin to disable');
          return;
        }

        for (const pluginName of args) {
          const plugin = this.omegga.pluginLoader.plugins.find(
            p => p.getName().toLowerCase() === pluginName.toLowerCase(),
          );

          if (!plugin) {
            warn('No plugin by the name', pluginName.cyan);
            continue;
          }

          const name = plugin.getName();
          if (!plugin.isEnabled()) {
            warn(
              name.cyan,
              'is already disabled, enable with',
              ('/plugins enable ' + name).yellow,
            );
            return;
          }

          if (plugin.isLoaded()) {
            log('Unloading and disabling', name.cyan.underline);
            await plugin.unload();
            plugin.setEnabled(false);
          } else {
            log('Disabling', name.cyan.underline);
            plugin.setEnabled(false);
          }
        }
      }
    },
  },
  {
    aliases: ['world', 'worlds', 'w'],
    desc: 'Manage worlds on the server',
    descLines: () => ['Type /worlds load a world'],
    async fn(subcommand: string, ...args: string[]) {
      switch (subcommand) {
        default:
          const commands = [
            {
              command: '/worlds use [world]',
              desc: 'set or remove a world as the default world for startup',
              short: '/w u [world]',
            },
            {
              command: '/worlds load <world> [rev]',
              desc: 'load a world',
              short: '/w load <world> [rev]',
            },
            {
              command: '/worlds saveas <world>',
              desc: 'save the current world as a new world',
              short: '/w sa <world>',
            },
            {
              command: '/worlds save',
              desc: 'save the current world',
              short: '/w s',
            },
            {
              command: '/worlds revisions <world>',
              desc: 'list revisions of a world',
              short: '/w r <world>',
            },
            {
              command: '/worlds new',
              desc: 'create a new world',
              short: '/w new <name> [Plate|Space|Studio|Peaks]',
            },
          ];
          log(
            'Default world is',
            this.omegga.getNextWorld()?.file?.yellow || 'none'.grey,
          );
          log('Available world commands:');
          for (const { command, desc, short } of commands) {
            this.log('  ', command.yellow, '-', desc, `(${short.yellow})`);
          }
          return;

        case 'use':
        case 'u':
          const world = args[0]?.replace(/\.brdb$/, '');
          if (world && !this.omegga.worldExists(world)) {
            err(`World "${world}" does not exist`);
            return;
          }
          if (this.omegga.setActiveWorld(world || null)) {
            if (world) {
              log(
                `Default world set to ${world.yellow}. It will be loaded next startup.`,
              );
            } else {
              log(
                'Default world cleared. No world will be loaded on next startup.',
              );
            }
          } else {
            err(`Failed to set default world to ${world.yellow}.`);
          }
          return;

        case 'list':
        case 'ls':
          // list worlds
          const worlds = this.omegga.getWorlds();
          if (worlds.length === 0) {
            log(
              'No worlds found. Create one with',
              '/worlds saveas <world>'.yellow,
            );
          } else {
            log('Available worlds:');
            const prefix = this.omegga.worldPath + '/';
            for (const world of worlds) {
              this.log(
                '  ',
                world.replace(prefix, '').replace(/\.brdb$/, '').yellow,
              );
            }
          }
          return;
        case 'load':
        case 'l':
          if (!this.omegga.started) {
            err('The server is not running');
            return;
          }

          // load a world
          if (args.length === 0) {
            err('Please specify a world to load');
            return;
          }
          const worldName = args[0].replace(/\.brdb$/, '');
          if (!this.omegga.getWorldPath(worldName)) {
            err(`World "${worldName}" does not exist`);
            return;
          }
          let revision: number | undefined;
          if (args.length > 1) {
            revision = parseInt(args[1], 10);
            if (isNaN(revision) || revision < 1) {
              err(`Invalid revision number: ${args[1]}`);
              return;
            }
          }
          let loadRes: boolean = false;
          if (revision) {
            log(`Loading world ${worldName.yellow} at revision ${revision}...`);
            loadRes = await this.omegga.loadWorldRevision(worldName, revision);
          } else {
            log(`Loading world ${worldName.yellow}...`);
            loadRes = await this.omegga.loadWorld(worldName);
          }
          if (loadRes) {
            log(`World ${worldName.yellow} loaded successfully.`);
          } else {
            err(`Failed to load world ${worldName.yellow}`);
          }

          return;
        case 'saveas':
        case 'sa':
          if (!this.omegga.started) {
            err('The server is not running');
            return;
          }

          // save the current world as a new world
          if (args.length === 0) {
            err('Please specify a world to save as');
            return;
          }
          const saveWorldName = args[0].replace(/\.brdb$/, '');
          if (this.omegga.getWorldPath(saveWorldName)) {
            err(`World "${saveWorldName}" already exists`);
            return;
          }
          log(`Saving current world as ${saveWorldName.yellow}...`);
          const saveAsRes = await this.omegga.saveWorldAs(saveWorldName);
          if (saveAsRes) {
            log(`Current world saved as ${saveWorldName.yellow} successfully.`);
          } else {
            err(`Failed to save current world as ${saveWorldName.yellow}`);
          }
          return;

        case 'save':
        case 's':
          if (!this.omegga.started) {
            err('The server is not running');
            return;
          }

          // save the current world
          log('Saving current world...');
          const res = await this.omegga.saveWorld();
          if (res) {
            log('Current world saved successfully.');
          } else {
            err('Failed to save the current world');
          }
          return;

        case 'revisions':
        case 'r':
          if (!this.omegga.started) {
            err('The server is not running');
            return;
          }

          // list revisions of a world
          if (args.length === 0) {
            err('Please specify a world to list revisions for');
            return;
          }
          const revisionsWorldName = args[0].replace(/\.brdb$/, '');
          if (!this.omegga.getWorldPath(revisionsWorldName)) {
            err(`World "${revisionsWorldName}" does not exist`);
            return;
          }
          log(`Listing revisions for world ${revisionsWorldName.yellow}...`);
          try {
            const revisions =
              await this.omegga.getWorldRevisions(revisionsWorldName);
            if (revisions.length === 0) {
              log('No revisions found for world', revisionsWorldName.yellow);
            } else {
              log('Revisions for world', revisionsWorldName.yellow + ':');
              for (const rev of revisions) {
                this.log(
                  '  ',
                  `Revision ${rev.index.toString().yellow} - ${
                    rev.date
                      .toISOString()
                      .replace('T', ' ')
                      .replace('.000Z', '').blue
                  }`,
                  `(${rev.note})`.grey,
                );
              }
            }
          } catch (e) {
            err(
              'An error occurred while getting world revisions:',
              e.toString(),
            );
          }
          return;

        case 'new':
        case 'n':
          if (!this.omegga.started) {
            err('The server is not running');
            return;
          }

          // create a new world
          if (args.length === 0) {
            err('Please specify a name for the new world');
            return;
          }
          const newWorldName = args[0].replace(/\.brdb$/, '');
          if (this.omegga.getWorldPath(newWorldName)) {
            err(`World "${newWorldName}" already exists`);
            return;
          }
          const map = (args[1] ? args[1] : 'Plate') as
            | 'Plate'
            | 'Space'
            | 'Studio'
            | 'Peaks';
          if (!['Plate', 'Space', 'Studio', 'Peaks'].includes(map)) {
            err(`Invalid preset "${map}". Valid map are: Plate, Space, Studio`);
            return;
          }
          log(`Creating new world ${newWorldName.yellow}...`);
          this.omegga.createEmptyWorld(newWorldName, map);
      }
    },
  },
];

// the terminal wraps omegga and displays console output and handles console input
export default class Terminal {
  options: IOmeggaOptions;
  omegga: Omegga;
  rl: readline.Interface;

  constructor(omegga: Omegga, options: IOmeggaOptions = {}) {
    this.options = options;
    this.omegga = omegga;

    // terminal interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    this.rl.setPrompt('> '.brightGreen);

    // shortand fns
    log = (...args) => this.log('>>'.green, ...args);
    err = (...args) => this.error('!>'.red, ...args);
    info = (...args) => this.log('?>'.blue, ...args);
    warn = (...args) => this.warn('W>'.yellow, ...args);

    // print log line if debug is enabled
    let launcherDone = false;
    let lastDoneMessage = '';
    omegga.on('line', l => {
      if (options.debug) this.log('::'.blue, l);
      else if (!launcherDone) {
        if (l.match(/Update Failed/)) {
          err(l);
          info(
            'This might be resolved by deleting brickadia and reinstalling:',
          );
          info('  rm -rf ~/.local/share/brickadia-launcher'.grey);
        }
        if (l.startsWith('DOWNLOADING')) {
          // TODO: if someone is proactive enough in the future, you could turn these steps into a legitimate progress bar
          /* Here's some launcher log lines that might be helpful
            Grabbing manifest and checking game files...
            DOWNLOADING MANIFEST | Hold on...
            DOWNLOADING MANIFEST (100%) | Hold on...
            DOWNLOADING MANIFEST (100%) | 0 B/s - 13 KiB / 13 KiB (Unknown time remaining...)
            DOWNLOADING MANIFEST (100%) | Done!
            Checking launcher and downloading version info...
            Installing patches and booting...
            DOWNLOADING BRICKADIA (0%) | Done!
            DOWNLOADING BRICKADIA (100%) | 110 MiB/s - 584 MiB / 584 MiB (1 second remaining...)
            DOWNLOADING BRICKADIA (100%) | Nearly done...
            DOWNLOADING BRICKADIA (100%), INSTALLING BRICKADIA (86%) | Nearly done...
          */
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(l);
          // add a newline on "Done!" but prevent newlines on repeat done messages
          if (l.match(/Done!/) && l !== lastDoneMessage) {
            lastDoneMessage = l;
            process.stdout.write('\n');
          }
        } else if (l.match(/Disabling core dumps./)) {
          launcherDone = true;
        }
      }

      // [2025.07.07-20.45.40:310][845]LogBRWorldManager: World successfully loaded.
      if (
        l.match(
          /^\[[^\]]+\]\[[^\]]+\]LogBRWorldManager: World successfully loaded\.$/,
        )
      ) {
        info('World successfully loaded.');
      }
    });

    // print debug events regardless of debug status
    omegga.on('debug', l => this.log('?>'.magenta, l));

    // print chat events as players join/leave the server
    omegga.on('join', (p: OmeggaPlayer) =>
      this.log(
        `${p.name.underline} (${p.displayName.underline}) joined.`.brightBlue,
      ),
    );
    omegga.on('leave', (p: OmeggaPlayer) =>
      this.log(
        `${p.name.underline} (${p.displayName.underline}) left.`.brightBlue,
      ),
    );
    omegga.on('chat', (name, message) =>
      this.log(`${name.brightYellow.underline}: ${message}`),
    );
    omegga.on('start', () => {
      const { checkWsl } = require('../util/wsl');
      const wsl = checkWsl();
      log(
        `Server has started${
          wsl === 1 ? ' in single thread mode due to WSL1' : ''
        }. Type ${'/help'.yellow} for more commands`,
      );
      if (!this.omegga.getNextWorld()) {
        info(
          'No',
          'default world'.yellow,
          'is configured. Run',
          '/worlds use <world>'.yellow,
          'to load one on startup.',
        );
      }

      // check if this is WSL2 and wsl2binds is installed
      if (
        wsl === 2 &&
        this.omegga.pluginLoader &&
        !this.omegga.pluginLoader.plugins.some(p => p.getName() === 'wsl2binds')
      ) {
        warn(
          '####'.yellow,
          `You are running ${'WSL2'.yellow} and you don't have the ${
            'wsl2binds'.yellow
          } plugin.`,
        );
        warn(
          '####'.yellow,
          `The wsl2binds plugin works as a ${
            'UDP proxy'.underline
          } between Windows and the WSL2 VM.`,
        );
        warn('####'.yellow, 'Install it by:');
        warn('####'.yellow, ' 1. Closing omegga with', '/stop'.green);
        warn(
          '####'.yellow,
          ' 2. Installing wsl2binds with',
          'omegga install gh:Meshiest/wsl2binds'.green,
        );
        warn('####'.yellow, ' 3. Restarting', 'omegga'.green);
      }
    });
    omegga.on('mapchange', ({ map }) =>
      log('Map changed to', (map.charAt(0).toUpperCase() + map.slice(1)).green),
    );
    omegga.on('unauthorized', () => {
      err('Server failed authentication check');
      info('You can clear auth tokens with', 'omegga auth -gl'.green);
      info(
        'This will require you to paste a new hosting token or sign-in again',
      );
      process.exit();
    });
    omegga.on('error', e => err('Server caught unhandled exception:\n' + e));
    omegga.on('server:stopped', () =>
      log('Server has closed. Type', '/stop'.yellow, 'to close omegga'),
    );

    this.rl.on('line', this.handleLine.bind(this));
    // Gracefully shut down server on Ctrl+C and SIGTERM
    process.on('SIGINT', () => this.handleLine('/stop'));
    process.on('SIGTERM', () => this.handleLine('/stop'));
  }

  async handleLine(line: string) {
    if (line.startsWith('/')) {
      const [cmd, ...args] = line.slice(1).split(' ');
      const c = COMMANDS.find(c => c.aliases.includes(cmd));
      if (!c) {
        err(
          `unrecognized command /${cmd.underline}. Type /help for more info`
            .red,
        );
      } else {
        try {
          const res = c.fn.bind(this)(...args);
          if (res instanceof Promise) await res;
        } catch (e) {
          err('unhandled terminal error', e);
        }
      }
    } else if (line.trim().length > 0) {
      if (this.omegga.started) {
        // broadcast when the chat does not start with a command
        this.omegga.broadcast(
          `"[<b><color=\\"ff00ff\\">SERVER</></>]: ${sanitize(line)}"`,
        );
        process.stdout.clearLine(0);
        this.log(`[${'SERVER'.brightMagenta.underline}]: ${line}`);

        // if omegga is running a webserver - send this message in the chat log
        if (this.omegga.webserver) {
          const user = { name: 'SERVER', id: '', web: true, color: 'ff00ff' };
          // create database entry, send to web ui
          this.omegga.webserver.io
            .to('chat')
            .emit(
              'chat',
              await this.omegga.webserver.database.addChatLog(
                'msg',
                user,
                line,
              ),
            );
        }
      } else {
        err(
          'Server is not started yet. type'.red,
          '/help'.yellow,
          'for more info'.red,
        );
      }
    }
  }

  // let readline render a log without interrupting user input
  log(...args: any[]) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    console.log(...args);
    this.rl.prompt(true);
  }

  // let readline render a debug log without interrupting user input
  debug(...args: any[]) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    console.debug(...args);
    this.rl.prompt(true);
  }

  // let readline render a warning log without interrupting user input
  warn(...args: any[]) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    console.warn(...args);
    this.rl.prompt(true);
  }

  // let readline render an error log without interrupting user input
  error(...args: any[]) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    console.error(...args);
    this.rl.prompt(true);
  }
}
