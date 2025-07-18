/*
  Brickadia Server Wrapper
  Manages IO with the game server
*/

import Logger from '@/logger';
import {
  ACTIVE_WORLD_FILE,
  CONFIG_SAVED_DIR,
  GAME_BIN_PATH,
  GAME_DIRNAME,
  GAME_INSTALL_DIR,
  OVERRIDE_GAME_DIR,
} from '@/softconfig';
import { getGlobalToken } from '@cli/auth';
import { IConfig } from '@config/types';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import 'colors';
import EventEmitter from 'events';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { env } from 'process';
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

/** Start a brickadia server */
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

  getActiveWorldFile(): string {
    return path.join(this.path, ACTIVE_WORLD_FILE);
  }

  /** A world specified by the active world file */
  getActiveWorld(): string | null {
    const activeWorldFile = this.getActiveWorldFile();
    if (existsSync(activeWorldFile)) {
      try {
        return readFileSync(activeWorldFile, 'utf8').trim();
      } catch (err) {
        Logger.errorp(
          'Failed to read active world file',
          activeWorldFile.yellow,
          err,
        );
        return null;
      }
    }
    return null;
  }

  /** Set the world to use next startup */
  setActiveWorld(world: string | null): boolean {
    const activeWorldFile = this.getActiveWorldFile();
    if (!world || world === null) {
      if (existsSync(activeWorldFile)) {
        Logger.verbose('Removing active world file', activeWorldFile.yellow);
        unlinkSync(activeWorldFile);
      }
      return true;
    }

    if (!this.worldExists(world)) {
      Logger.verbose(
        'Cannot set active world to',
        world.yellow,
        'as it does not exist',
      );
      return false;
    }

    Logger.verbose('Setting active world to', world.yellow);
    try {
      writeFileSync(activeWorldFile, world, 'utf8');
      return true;
    } catch (err) {
      Logger.errorp(
        'Failed to write active world file',
        activeWorldFile.yellow,
        err,
      );
      return false;
    }
  }

  /** A world specified by the config */
  getConfigWorld(): string | null {
    return this.config?.server?.world ?? null;
  }

  /** A world specified by the BRICKADIA_WORLD env variable */
  getEnvWorld(): string | null {
    return env.BRICKADIA_WORLD || null;
  }

  /** Check if a world exists */
  worldExists(world: string): boolean {
    const savedDir = this.config?.server?.savedDir ?? CONFIG_SAVED_DIR;
    const worldPath = path.join(this.path, savedDir, 'Worlds', world + '.brdb');
    return existsSync(worldPath);
  }

  /** Get the world that will be used next startup */
  getNextWorld() {
    const candidates = [
      { source: 'file', file: this.getActiveWorld() },
      { source: 'config', file: this.getConfigWorld() },
      { source: 'env', file: this.getEnvWorld() },
    ];

    return (
      candidates.find(({ file }) => file && this.worldExists(file)) ?? null
    );
  }

  // start the server child process
  start() {
    const {
      email,
      password,
      token: confToken,
    }: { email?: string; password?: string; token?: string } = this.config
      .credentials || {};

    const token = confToken || process.env.BRICKADIA_TOKEN || getGlobalToken();

    if (token) {
      Logger.verbose('Starting server with hosting token');
    } else {
      Logger.verbose(
        'Starting server',
        (!email && !password ? 'without' : 'with').yellow,
        'credentials',
      );
    }

    const isSteam = !this.config.server.branch;
    const steamBeta = this.config.server.steambeta ?? 'main';
    const overrideBinary =
      OVERRIDE_GAME_DIR &&
      path.join(
        OVERRIDE_GAME_DIR, // from BRICKADIA_DIR env
        GAME_BIN_PATH,
      );
    const steamBinary = path.join(
      GAME_INSTALL_DIR, // steam install directory
      steamBeta, // steam beta branch (or main)
      GAME_DIRNAME, // Brickadia
      GAME_BIN_PATH, // path to binary
    );

    let gameBinary = steamBinary;

    if (overrideBinary) {
      if (!existsSync(overrideBinary)) {
        Logger.error(
          'Override binary',
          overrideBinary.yellow,
          'does not exist!',
        );
        throw new Error(`Override binary ${overrideBinary} does not exist!`);
      }

      Logger.verbose(
        'Using override binary',
        overrideBinary.yellow,
        'instead of',
        steamBinary.yellow,
      );
      gameBinary = overrideBinary;
    } else if (isSteam) {
      Logger.verbose('Using steam binary', steamBeta.yellow);
    } else {
      Logger.verbose(
        'Running',
        (this.config.server.__LOCAL
          ? path.join(__dirname, '../../tools/brickadia.sh')
          : 'brickadia launcher'
        ).yellow,
      );
      if (typeof this.config.server.branch === 'string')
        Logger.verbose('Using branch', this.config.server.branch.yellow);
    }

    // handle local launcher support
    const launchArgs = isSteam
      ? [gameBinary]
      : [
          this.config.server.__LOCAL
            ? path.join(__dirname, '../../tools/brickadia.sh')
            : 'brickadia',
          this.config.server.branch && `--branch=${this.config.server.branch}`,
          '--server',
          '--',
        ];

    const world = this.getNextWorld();
    if (world) {
      Logger.verbose(
        'Using world',
        world.file.yellow,
        'from',
        world.source.yellow,
      );
    } else if (this.config.server.map) {
      Logger.verbose('Using map', this.config.server.map.yellow, 'from config');
    }

    const params = [
      '--output=L',
      '--',
      ...launchArgs,
      !world &&
        this.config.server.map &&
        `-Environment="${this.config.server.map}"`,
      world && `-World="${world.file}"`,
      '-NotInstalled',
      '-log',
      require('../util/wsl') === 1 ? '-OneThread' : null,
      this.path ? `-UserDir="${this.path}"` : null,
      token ? `-Token="${token}"` : null, // remove token argument if not provided
      !token && email ? `-User="${email}"` : null, // remove email argument if not provided or token is provided
      !token && password ? `-Password="${password}"` : null, // remove password argument if not provided or token is provided
      `-port="${this.config.server.port}"`,
      this.config.server.launchArgs,
    ].filter(Boolean); // remove unused arguments
    Logger.verbose(
      'Params for spawn',
      params
        .join(' ')
        .replace(/-User=".*?"/, '-User="<hidden>"')
        .replace(/-Password=".*?"/, '-Password="<hidden>"')
        .replace(/-Token=".*?"/, '-Token="<hidden>"'),
    );

    // Either unbuffer or stdbuf must be used because brickadia's output is buffered
    // this means that multiple lines can be bundled together if the output buffer is not full
    // unfortunately without stdbuf or unbuffer, the output would not happen immediately
    this.#child = spawn('stdbuf', params);

    Logger.verbose(
      'Spawn process',
      this.#child ? this.#child.pid : 'failed'.red,
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
        'longer than allowed limit'.red,
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
          }`,
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
