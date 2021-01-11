const readline = require('readline');

const { chat: { sanitize } } = require('../util/index.js');

let log, err;

// the terminal wraps omegga and displays console output and handles console input
class Terminal {
  constructor(omegga, options={}) {
    this.options = options;
    this.omegga = omegga;

    this.commands = {};

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
    // warn = (...args) => this.warn('W>'.yellow, ...args);

    // print log line if debug is enabled
    let launcherDone = false;
    omegga.on('line', l => {
      if (options.debug)
        this.log('::'.blue, l);
      else if (!launcherDone) {
        if (l.startsWith('DOWNLOADING')) {
          // TOOD: if someone is proactive enough in the future, you could turn these steps into a legitimate progress bar
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
          process.stdout.clearLine();
          process.stdout.cursorTo(0);
          process.stdout.write(l);
          if (l.match(/Done!/)) {
            process.stdout.write('\n');
          }
        } else if (l.match(/Disabling core dumps./)) {
          launcherDone = true;
        }
      }
    });

    // print debug events regardless of debug status
    omegga.on('debug', l => this.log('?>'.magenta, l));

    // print chat events as players join/leave the server
    omegga.on('join', p => this.log(`${p.name.underline} joined.`.brightBlue));
    omegga.on('leave', p => this.log(`${p.name.underline} left.`.brightBlue));
    omegga.on('chat', (name, message) => this.log(`${name.brightYellow.underline}: ${message}`));
    omegga.on('start', () => log('Server has started. Type', '/help'.yellow, 'for more commands'));
    omegga.on('mapchange', (map) => log('Map changed to', (map.charAt(0).toUpperCase()+map.slice(1)).green));
    omegga.on('unauthorized', () => err('Server failed authentication check'));
    omegga.on('error', e => err('Server caught unhandled exception:\n' + e));
    omegga.on('server:stopped', () => log('Server has closed. Type', '/stop'.yellow, 'to close omegga'));

    this.rl.on('line', this.handleLine.bind(this));

    // console commands
    Object.entries({

      debug: {
        desc: 'toggle visibility of brickadia console logs',
        fn() {
          options.debug = !options.debug;
          log('Brickadia logs now', options.debug ? 'visible'.green : 'hidden'.red);
        },
      },

      help: {
        desc: 'list supported commands and their descriptions',
        fn() {
          const maxCmdLen = Math.max(...Object.keys(this.commands).map(s => s.length));
          log('Omegga Help Text:\n');
          this.log('  Console input not starting with / will be sent in chat from a "SERVER" user');
          this.log('  Console input starting with / will be treated as one of the following commands\n');
          this.log('-- Available Omegga commands (type', '/command'.yellow.underline, 'to run)');
          Object.keys(this.commands).sort().forEach(k => {
            this.log('  ', k.yellow.underline, '-'.padStart(maxCmdLen - k.length + 1), this.commands[k].desc);
          });
          this.log('');
        },
      },

      cmd: {
        desc: 'run a console command on the brickadia server. requires debug for log to show',
        fn(...args) {
          if (!this.omegga.started) {
            err('Omegga is not running');
            return;
          }
          this.omegga.writeln(args.join(' '));
        }
      },

      status: {
        desc: 'display server status information. brick count, online players, etc',
        async fn() {
          if (!this.omegga.started) {
            err('Omegga is not running');
            return;
          }
          const msToTime = ms => new Date(ms).toISOString().substr(11, 8);
          try {
            const status = await this.omegga.getServerStatus();

            log('Server Status');
            this.log(`
  ${status.serverName.yellow}
    Bricks: ${(status.bricks+'').yellow}
    Components: ${(status.components+'').yellow}
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

      stop: {
        desc: 'stop the server and close Omegga',
        async fn() {
          log('Stopping server...');
          await this.omegga.stop();
          process.exit();
        },
      },

      kill: {
        desc: 'forcefully kill brickadia server process without closing omegga',
        async fn() {
          log('Stopping server...');
          await this.omegga.stop();
        },
      },

      save: {
        desc: 'Save bricks to a specified file',
        async fn(...args) {
          const name = args.join(' ');
          if (!name.length)
            return err('usage:', '/save <name>'.yellow);
          log('Saving bricks');
          this.omegga.saveBricks(name);
        },
      },

      load: {
        desc: 'Load bricks from a specified file',
        async fn(...args) {
          const name = args.join(' ');
          if (!name.length)
            return err('usage:', '/load <name>'.yellow);
          log('Loading bricks');
          this.omegga.loadBricks(name);
        },
      },

      start: {
        desc: 'start the server if it is stopped',
        fn() {
          if (!this.omegga || this.omegga && (this.omegga.starting || this.omegga.started)) {
            err('Omegga is already running');
            return;
          }
          log('Starting server...');
          this.omegga.start();
        },
      },

      reload: {
        desc: 'reload available plugins',
        async fn() {
          if (!this.omegga.pluginLoader) {
            err('Omegga is not using plugins');
            return;
          }

          log('Unloading current plugins');
          let success = await this.omegga.pluginLoader.unload();
          if (!success) {
            err('Could not unload all plugins');
            return;
          }

          log('Scanning for new plugins');
          success = await this.omegga.pluginLoader.scan();
          if (!success) {
            err('Could not scan for plugins');
            return;
          }

          log('Starting plugins');
          success = await this.omegga.pluginLoader.reload();
          if (success) {
            const plugins = this.omegga.pluginLoader.plugins.filter(p => p.isLoaded()).map(p => p.getName());
            log('Loaded', (plugins.length+'').yellow, 'plugins:', plugins);
          } else {
            err('Could not load all plugins');
          }
        },
      },

    }).forEach(([cmd, {desc, fn}]) => this.addCommand(cmd, desc, fn));
  }

  // add a command
  addCommand(name, desc, fn) {
    this.commands[name] = {name, desc, fn: fn.bind(this)};
  }

  async handleLine(line) {
    if (line.startsWith('/')) {
      const [cmd, ...args] = line.slice(1).split(' ');
      if (!this.commands[cmd]) {
        err(`unrecognized command /${cmd.underline}. Type /help for more info`.red);
      } else {
        try {
          const res = this.commands[cmd].fn(...args);
          if (res instanceof Promise) {
            await res;
          }
        } catch (e) {
          err('unhandled terminal error', e);
        }
      }
    } else if (line.trim().length > 0) {
      if (this.omegga.started) {
        // broadcast when the chat does not start with a command
        this.omegga.broadcast(`"[<b><color=\\"ff00ff\\">SERVER</></>]: ${sanitize(line)}"`);
        process.stdout.clearLine();
        this.log(`[${'SERVER'.brightMagenta.underline}]: ${line}`);

        // if omegga is running a webserver - send this message in the chat log
        if (this.omegga.webserver) {
          const user = {name: 'SERVER', id: '', web: true, color: 'ff00ff'};
          // create database entry, send to web ui
          this.omegga.webserver.io.to('chat').emit('chat',
            await this.omegga.webserver.database.addChatLog('msg', user, line));
        }
      } else {
        err('Server is not started yet. type'.red,'/help'.yellow,'for more info'.red);
      }
    }
  }

  // let readline render a log without interrupting user input
  log(...args) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.log(...args);
    this.rl.prompt(true);
  }

  // let readline render a warning log without interrupting user input
  warn(...args) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.warn(...args);
    this.rl.prompt(true);
  }

  // let readline render an error log without interrupting user input
  error(...args) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    console.error(...args);
    this.rl.prompt(true);
  }
}

module.exports = Terminal;