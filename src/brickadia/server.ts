/*
  Brickadia Server Wrapper
  Manages IO with the game server
*/

import Logger from '@/logger';
import { IConfig } from '@config/types';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import 'colors';
import EventEmitter from 'events';
import path from 'path';
import readline from 'readline';
import stripAnsi from 'strip-ansi';

// list of errors that can be solved by yelling at the user
const knownErrors: {
  name: string;
  solution?: string;
  match: RegExp;
  message?: string;
}[] = [
  {
    name: 'MISSING_LIBGL',
    solution: 'apt-get install libgl1-mesa-glx libglib2.0-0',
    match:
      /error while loading shared libraries: libGL\.so\.1: cannot open shared object file/,
  },
  {
    name: 'MISSING_GLIB',
    solution: 'apt-get install libgl1-mesa-glx libglib2.0-0',
    match:
      /error while loading shared libraries: libgthread-2\.0\.so\.0: cannot open shared object file/,
  },
];

// Start a brickadia server
export default class BrickadiaServer extends EventEmitter {
  #child: ChildProcessWithoutNullStreams = null;
  #errInterface: readline.Interface = null;
  #outInterface: readline.Interface = null;

  config: IConfig;
  path: string;

  constructor(dataPath: string, config: IConfig) {
    super();

    this.config = config;
    // use the data path if it's absolute, otherwise build an absolute path
    this.path =
      path.isAbsolute(dataPath) || dataPath.startsWith('/')
        ? dataPath
        : path.join(process.cwd(), dataPath);

    this.lineListener = this.lineListener.bind(this);
    this.errorListener = this.errorListener.bind(this);
    this.exitListener = this.exitListener.bind(this);
  }

  // start the server child process
  start() {
    const { email, password } = this.config.credentials || {};
    Logger.verbose(
      'Starting server',
      (!email && !password ? 'without' : 'with').yellow,
      'credentials'
    );
    Logger.verbose(
      'Running',
      (this.config.server.__LOCAL
        ? path.join(__dirname, '../../tools/brickadia.sh')
        : 'brickadia launcher'
      ).yellow
    );
    if (typeof this.config.server.branch === 'string')
      Logger.verbose('Using branch', this.config.server.branch.yellow);

    // handle local launcher support
    const launchArgs = [
      this.config.server.__LOCAL
        ? path.join(__dirname, '../../tools/brickadia.sh')
        : 'brickadia',
      this.config.server.branch && `--branch=${this.config.server.branch}`,
      '--server',
      '--',
    ];

    // Either unbuffer or stdbuf must be used because brickadia's output is buffered
    // this means that multiple lines can be bundled together if the output buffer is not full
    // unfortunately without stdbuf or unbuffer, the output would not happen immediately
    this.#child = spawn(
      'stdbuf',
      [
        '--output=L',
        '--',
        ...launchArgs,
        this.config.server.map && `${this.config.server.map}`,
        '-NotInstalled',
        '-log',
        require('../util/wsl') === 1 ? '-OneThread' : null,
        this.path ? `-UserDir="${this.path}"` : null,
        email ? `-User="${email}"` : null, // remove email argument if not provided
        password ? `-Password="${password}"` : null, // remove password argument if not provided
        `-port="${this.config.server.port}"`,
      ].filter(Boolean)
    ); // remove unused arguments

    Logger.verbose(
      'Spawn process',
      this.#child ? this.#child.pid : 'failed'.red
    );

    this.#child.stdin.setDefaultEncoding('utf8');
    this.#outInterface = readline.createInterface({
      input: this.#child.stdout,
      terminal: false,
    });
    this.#errInterface = readline.createInterface({
      input: this.#child.stderr,
      terminal: false,
    });
    this.attachListeners();
    Logger.verbose('Attached listeners');
  }

  // write a string to the child process
  write(line: string) {
    if (line.length >= 512) {
      // show a warning
      Logger.warn(
        'WARNING'.yellow,
        'The following line was called and is',
        'longer than allowed limit'.red
      );
      Logger.warn(line.replace(/\n$/, ''));
      // throw a fake error to get the line number
      try {
        throw new Error('Console Line Too Long');
      } catch (err) {
        Logger.warn(err);
      }
      return;
    }
    if (this.#child) {
      Logger.verbose('WRITE'.green, line.replace(/\n$/, ''));
      this.#child.stdin.write(line);
    }
  }

  // write a line to the child process
  writeln(line: string) {
    this.write(line + '\n');
  }

  // forcibly kills the server
  stop() {
    if (!this.#child) {
      Logger.verbose('Cannot stop server as no subprocess exists');
      return;
    }

    Logger.verbose('Forcibly stopping server');
    // kill the process
    this.#child.kill('SIGINT');

    // ...kill it again just to make sure it's dead
    spawn('kill', ['-9', this.#child.pid + '']);
  }

  // detaches listeners
  cleanup() {
    if (!this.#child) return;

    Logger.verbose('Cleaning up brickadia server');

    // detach listener
    this.detachListeners();

    this.#child = null;
    this.#outInterface = null;
    this.#errInterface = null;
  }

  // attaches proxy event listeners
  attachListeners() {
    this.#outInterface.on('line', this.lineListener);
    this.#errInterface.on('line', this.errorListener);
    this.#child.on('exit', this.exitListener);
    this.#child.on('close', () => {});
  }

  // removes previously attached proxy event listeners
  detachListeners() {
    this.#outInterface.off('line', this.lineListener);
    this.#errInterface.off('line', this.errorListener);
    this.#child.off('exit', this.exitListener);
    this.#child.removeAllListeners('close');
  }

  // -- listeners for basic events (line, err, exit)
  errorListener(line: string) {
    Logger.verbose('ERROR'.red, line);
    this.emit('err', line);
    for (const { match, solution, name, message } of knownErrors) {
      if (line.match(match)) {
        Logger.error(
          `Encountered ${name.red}. ${
            solution ? 'Known fix:\n  ' + solution : message || 'Unknown error.'
          }`
        );
      }
    }
  }

  exitListener(...args: any[]) {
    Logger.verbose('Exit listener fired');
    this.emit('closed', ...args);
    this.cleanup();
  }

  lineListener(line: string) {
    this.emit('line', stripAnsi(line));
  }
}
