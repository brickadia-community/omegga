/*
  Brickadia Server Wrapper
  Manages IO with the game server
*/
const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const stripAnsi = require('strip-ansi');

const BINARY_PATH = 'Brickadia/Binaries/Linux/BrickadiaServer-Linux-Shipping';

// Start a brickadia server
class BrickadiaServer extends EventEmitter {
  #child = null;
  #errInterface = null;
  #outInterface = null;

  constructor(dataPath, config) {
    super();
    this.config = config;
    this.path = dataPath;

    this.lineListener = this.lineListener.bind(this);
    this.errorListener = this.errorListener.bind(this);
    this.exitListener = this.exitListener.bind(this);
  }

  // start the server child process
  start() {
    const { email, password } = this.config.credentials;

    // Either unbuffer or stdbuf must be used because brickadia's output is buffered
    // this means that multiple lines can be bundled together if the output buffer is not full
    // unfortunately without stdbuf or unbuffer, the output would not happen immediately
    this.#child = spawn('stdbuf', [
      '--output=L',
      '--',
      'brickadia',
      this.config.server.branch && `--branch=${this.config.server.branch}`,
      '--server',
      '--',
      '-NotInstalled', '-log',
      this.path && `-UserDir="${path.join(process.cwd(), this.path)}"`,
      email && `-User="${email}"`, // remove email argument if not provided
      password && `-Password="${password}"`, // remove password argument if not provided
      `-port="${this.config.server.port}"`,
    ].filter(v => v)); // remove unused arguments
    this.#child.stdin.setEncoding('utf8');
    this.#outInterface = readline.createInterface({input: this.#child.stdout, terminal: false});
    this.#errInterface = readline.createInterface({input: this.#child.stderr, terminal: false});
    this.attachListeners();
  }

  // write a string to the child process
  write(line) {
    if (this.#child)
      this.#child.stdin.write(line);
  }

  // write a line to the child process
  writeln(line) {
    this.write(line + '\n');
  }

  // forcibly kills the server
  stop() {
    if (!this.#child)
      return;

    // kill the process
    this.#child.kill('SIGINT');

    // ...kill it again just to make sure it's dead
    spawn('kill', ['-9', this.#child.pid]);
  }

  // detaches listeners
  cleanup() {
    if (!this.#child)
      return;

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
  }

  // removes previously attached proxy event listeners
  detachListeners() {
    this.#outInterface.off('line', this.lineListener);
    this.#errInterface.off('line', this.errorListener);
    this.#child.off('exit', this.exitListener);
  }

  // -- listeners for basic events (line, err, exit)
  errorListener(line) {
    this.emit('err', line);
  }

  exitListener() {
    this.emit('exit');
    this.cleanup();
  }

  lineListener(line) {
    line = stripAnsi(line);

    this.emit('line', line);
  }
}

module.exports = BrickadiaServer;