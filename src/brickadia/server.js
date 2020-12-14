/*
  Brickadia Server Wrapper
  Manages IO with the game server
*/
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const stripAnsi = require('strip-ansi');
require('colors');

const verboseLog = (...args) => {
  if (!process.env.VERBOSE) return;
  if (Omegga.log)
    Omegga.log('V>'.magenta, ...args);
  else
    console.log('V>'.magenta, ...args);
};

// Start a brickadia server
class BrickadiaServer extends EventEmitter {
  #child = null;
  #errInterface = null;
  #outInterface = null;

  constructor(dataPath, config) {
    super();
    this.config = config;
    // use the data path if it's absolute, otherwise build an absolute path
    this.path = path.isAbsolute(dataPath) || dataPath.startsWith('/') ? dataPath : path.join(process.cwd(), dataPath);

    this.lineListener = this.lineListener.bind(this);
    this.errorListener = this.errorListener.bind(this);
    this.exitListener = this.exitListener.bind(this);
  }

  // start the server child process
  start() {
    const { email, password } = this.config.credentials || {};
    verboseLog('Starting server', (!email && !password ? 'with' : 'without').yellow, 'credentials');
    verboseLog('Running', (this.config.server.__LOCAL ? path.join(__dirname, '../../tools/brickadia.sh') : 'brickadia launcher').yellow);

    // handle local launcher support
    const launchArgs = this.config.server.__LOCAL ? [
      path.join(__dirname, '../../tools/brickadia.sh'),
      this.config.server.branch && `--branch=${this.config.server.branch}`,
      '--server',
      '--'
    ] : [
      'brickadia',
      this.config.server.branch && `--branch=${this.config.server.branch}`,
      '--server',
      '--',
    ];

    // Either unbuffer or stdbuf must be used because brickadia's output is buffered
    // this means that multiple lines can be bundled together if the output buffer is not full
    // unfortunately without stdbuf or unbuffer, the output would not happen immediately
    this.#child = spawn('stdbuf', [
      '--output=L',
      '--',
      ...launchArgs,
      '-NotInstalled', '-log',
      this.path && `-UserDir="${this.path}"`,
      email && `-User="${email}"`, // remove email argument if not provided
      password && `-Password="${password}"`, // remove password argument if not provided
      `-port="${this.config.server.port}"`,
    ].filter(v => v)); // remove unused arguments

    verboseLog('Spawn process', this.#child ? this.#child.pid : 'failed'.red);

    this.#child.stdin.setEncoding('utf8');
    this.#outInterface = readline.createInterface({input: this.#child.stdout, terminal: false});
    this.#errInterface = readline.createInterface({input: this.#child.stderr, terminal: false});
    this.attachListeners();
    verboseLog('Attached listeners');
  }

  // write a string to the child process
  write(line) {
    if (this.#child) {
      verboseLog('WRITE'.green, line.replace(/\n$/, ''));
      this.#child.stdin.write(line);
    }
  }

  // write a line to the child process
  writeln(line) {
    this.write(line + '\n');
  }

  // forcibly kills the server
  stop() {
    if (!this.#child) {
      verboseLog('Cannot stop server as no subprocess exists');
      return;
    }

    verboseLog('Forcibly stopping server');
    // kill the process
    this.#child.kill('SIGINT');

    // ...kill it again just to make sure it's dead
    spawn('kill', ['-9', this.#child.pid]);
  }

  // detaches listeners
  cleanup() {
    if (!this.#child)
      return;

    verboseLog('Cleaning up brickadia server');

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
  errorListener(line) {
    verboseLog('ERROR'.red, line);
    this.emit('err', line);
  }

  exitListener() {
    verboseLog('Exit listener fired');
    this.emit('closed');
    this.cleanup();
  }

  lineListener(line) {
    line = stripAnsi(line);

    this.emit('line', line);
  }
}

module.exports = BrickadiaServer;