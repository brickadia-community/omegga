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
  if (!global.VERBOSE) return;
  if (Omegga.log)
    Omegga.log('V>'.magenta, ...args);
  else
    console.log('V>'.magenta, ...args);
};

const errorLog = (...args) => {
  if (Omegga.error)
    Omegga.error('!>'.red, ...args);
  else
    console.error('!>'.red, ...args);
};

const warnLog = (...args) => {
  if (Omegga.error)
    Omegga.warn('W>'.yellow, ...args);
  else
    console.warn('W>'.yellow, ...args);
};

// list of errors that can be solved by yelling at the user
const knownErrors = [{
  name: 'MISSING_LIBGL',
  solution: 'apt-get install libgl1-mesa-glx libglib2.0-0',
  match: /error while loading shared libraries: libGL\.so\.1: cannot open shared object file/,
}, {
  name: 'MISSING_GLIB',
  solution: 'apt-get install libgl1-mesa-glx libglib2.0-0',
  match: /error while loading shared libraries: libgthread-2\.0\.so\.0: cannot open shared object file/,
}];

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
      this.path ? `-UserDir="${this.path}"` : null,
      email ? `-User="${email}"` : null, // remove email argument if not provided
      password ? `-Password="${password}"` : null, // remove password argument if not provided
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
    if (line.length >= 512) {
      // show a warning
      warnLog('WARNING'.yellow, 'The following line was called and is', 'longer than allowed limit'.red);
      warnLog(line.replace(/\n$/, ''));
      // throw a fake error to get the line number
      try {
        throw new Error('Console Line Too Long');
      } catch(err) {
        warnLog(err);
      }
      return;
    }
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
    for (const {match, solution, name, message} of knownErrors) {
      if (line.match(match)) {
        errorLog(`Encountered ${name.red}. ${solution ? 'Known fix:\n  ' + solution : message || 'Unknown error.'}`);
      }
    }
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
