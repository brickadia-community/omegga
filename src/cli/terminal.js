const readline = require('readline');
const colors = require('colors');

const { chat: { sanitize } } = require('../util/index.js');

const log = (...args) => console.log('>>'.green, ...args);
const err = (...args) => console.log('!>'.red, ...args);

// the terminal wraps omegga and displays console output and handles console input
class Terminal {
  constructor(omegga, options={}) {
    this.options = options;
    this.omegga = omegga;

    this.commands = {};

    // print log line if debug is enabled
    omegga.on('line', l => options.debug && console.log('[out]'.blue, l));

    // print debug events regardless of debug status
    omegga.on('debug', l => console.log('[dbg]'.green, l));

    // print chat events as players join/leave the server
    omegga.on('join', p => console.log(`${p.name.underline} joined.`.brightBlue));
    omegga.on('leave', p => console.log(`${p.name.underline} left.`.brightBlue));
    omegga.on('chat', (name, message) => console.log(`${name.brightYellow.underline}: ${message}`));
    omegga.on('start', () => log('Server has started'));
    omegga.on('unauthorized', () => err('Server failed authentication check'));
    omegga.on('error', e => err('Server caught unhandled exception:\n' + e));
    omegga.on('exit', e => log('Server is closing', e));

    // terminal interface
    readline.createInterface({input: process.stdin, output: process.stdout, terminal: false})
      .on('line', line => {
        if (line.startsWith('/')) {
          const [cmd, ...args] = line.slice(1).split(' ');
          if (!this.commands[cmd]) {
            err(`unrecognized command /${cmd.underline}. type /help for more info`.red);
          } else {
            this.commands[cmd].fn(args);
          }
        } else {
          if (omegga.started) {
            // broadcast when the chat does not start with a command
            omegga.broadcast(`"[<b><color=\\"ff00ff\\">SERVER</></>]: ${sanitize(line)}"`);
            console.log(`[${'SERVER'.brightMagenta.underline}]: ${line}`);
          } else {
            err(`server is not started yet. type /help for more info`.red);
          }
        }
      });

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
          log('Omegga Help Text:\n')
          console.log('  Console input not starting with / will be sent in chat from a "SERVER" user');
          console.log('  Console input starting with / will be treated as one of the following commands\n');
          console.log('-- Available Omegga commands (type', '/command'.yellow.underline, 'to run)');
          Object.keys(this.commands).sort().forEach(k => {
            console.log('  ', k.yellow.underline, '-'.padStart(maxCmdLen - k.length + 1), this.commands[k].desc);
          });
        },
      },

      cmd: {
        desc: 'run a console command on the brickadia server. requires debug for log to show',
        fn(args) {
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
            const maxNameLen = Math.max(...status.players.map(p => p.name.length));

            log('Server Status');
            console.log(`
  ${status.serverName.yellow}
    Bricks: ${(status.bricks+'').yellow}
    Uptime: ${msToTime(status.time).yellow}
    Players:
      ${status.players.map(p =>
      `[${msToTime(p.time).grey}] ${p.name.yellow.underline}`
    ).join('\n      ')}
`)
          } catch (e) {
            err('An error occurred while getting server status');
          }
        },
      },

      stop: {
        desc: 'stop the server and close Omegga',
        fn() {
          if (!this.omegga.started) {
            err('Omegga is not running');
            return;
          }
          log('Stopping server...');
          this.omegga.stop();
          process.exit();
        },
      },

      reload: {
        desc: 'reload available plugins',
        fn() {
          if (!this.omegga.started) {
            err('Omegga is not running');
            return;
          }

          log('Unloading current plugins');
          let success = this.omegga.pluginLoader.unload();
          if (!success) {
            err('Could not unload all plugins');
            return;
          }

          log('Scanning for new plugins');
          success = this.omegga.pluginLoader.scan();
          if (!success) {
            err('Could not scan for plugins')
            return;
          }

          log('Starting plugins');
          success = this.omegga.pluginLoader.reload();
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

  addCommand(name, desc, fn) {
    this.commands[name] = {name, desc, fn: fn.bind(this)};
  }
}

module.exports = Terminal;