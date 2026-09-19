import type Terminal from '@cli/terminal';
import { formatLogArgs, type LogFileSink, type LogLevel } from '@util/logfile';

// bounds the buffer when capture starts but no log file ever opens
const EARLY_LIMIT = 512;

export default class Logger {
  static VERBOSE = false;
  static terminal: Terminal;
  private static sink: LogFileSink | null = null;
  private static fileVerbose = false;
  private static early:
    | {
        when: Date;
        level: LogLevel;
        text: string;
        verbose: boolean;
      }[]
    | null = null;
  private static dateformat: ((date: Date, fmt: string) => string) | null =
    null;
  private static timestampFmt: string | null = null;

  /**
   * Set the timestamp format and load dateformat
   */
  static setTimestamp(fmt: string) {
    Logger.timestampFmt = fmt;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Logger.dateformat = require('dateformat').default;
  }

  /**
   * Prepend a grey timestamp to args if configured
   */
  static timestamped(args: unknown[]): unknown[] {
    if (!Logger.timestampFmt || !Logger.dateformat) return args;
    return [Logger.dateformat(new Date(), Logger.timestampFmt).grey, ...args];
  }

  /**
   * Buffer console output until a log file exists. Only the server path calls
   * this; CLI subcommands exit before a working directory is resolved.
   */
  static startCapture() {
    Logger.early ??= [];
  }

  /**
   * Mirror one console line to the log file, or hold it until there is one.
   *
   * Called from the two leaves of `out` below, never `out` itself: `Terminal`
   * renders joins, chat and command replies through its own `log`, which never
   * reaches `out`. Recording at the fork would miss those; recording at both
   * the fork and the leaves would double every line.
   */
  static record(level: LogLevel, args: unknown[], verbose = false) {
    if (!Logger.sink && !Logger.early) return;
    const when = new Date();
    // rendered now, not at flush: the args belong to the caller and may mutate
    const text = formatLogArgs(args);
    if (Logger.sink) Logger.sink.write(level, text, when);
    else if (Logger.early!.push({ when, level, text, verbose }) > EARLY_LIMIT)
      Logger.early!.shift();
  }

  /**
   * Log with timestamp when no terminal, pass through to terminal otherwise
   */
  private static out(method: LogLevel, args: unknown[]) {
    if (Logger.terminal) {
      Logger.terminal[method](...args);
    } else {
      Logger.record(method, args);
      console[method](...Logger.timestamped(args));
    }
  }

  /**
   * Send a console log to the readline terminal or stdout
   */
  static log(...args: unknown[]) {
    Logger.out('log', args);
  }

  /**
   * Send a prefixed console log to the readline terminal or stdout
   */
  static logp(...args: unknown[]) {
    Logger.out('log', ['>>'.green, ...args]);
  }

  /**
   * Send a console debug to the readline terminal or stdout
   */
  static debug(...args: unknown[]) {
    Logger.out('debug', args);
  }

  /**
   * Send a console error to the readline terminal or stderr
   */
  static error(...args: unknown[]) {
    Logger.out('error', args);
  }

  /**
   * Send a prefixed console error to the readline terminal or stderr
   */
  static errorp(...args: unknown[]) {
    Logger.out('error', ['!>'.red, ...args]);
  }

  /**
   * Send a console warn to the readline terminal or stdout
   */
  static warn(...args: unknown[]) {
    Logger.out('warn', args);
  }

  /**
   * Send a prefixed console warn to the readline terminal or stdout
   */
  static warnp(...args: unknown[]) {
    Logger.out('warn', ['>>'.yellow, ...args]);
  }

  /**
   * Send a console log when omegga is launched when --verbose.
   *
   * Without it, `logs.verbose` can still keep these on disk, where the detail
   * is worth having afterwards and costs nobody a readable console. The config
   * that decides has not been read yet during the startup buffer, so they are
   * held either way and `setFileSink` drops them if the file does not want them.
   */
  static verbose(...args: unknown[]) {
    const line = ['V>'.magenta, ...args];
    if (Logger.VERBOSE) return Logger.out('log', line);
    if (Logger.fileVerbose || Logger.early) Logger.record('log', line, true);
  }

  /**
   * Send a console log to the readline terminal or console
   */
  static setTerminal(term: Terminal) {
    Logger.terminal = term;
  }

  /**
   * Attach the log file and replay what was buffered before it opened. A null
   * sink means logging is off, so the buffer is dropped rather than held.
   */
  static setFileSink(sink: LogFileSink | null, verbose = false) {
    // set before the replay below, which needs it to decide
    Logger.fileVerbose = verbose;
    Logger.sink = sink;
    const early = Logger.early;
    Logger.early = null;
    if (sink && early)
      for (const entry of early)
        if (!entry.verbose || verbose)
          sink.write(entry.level, entry.text, entry.when);
  }
}

// the Logger class is exposed globally for internal convenience
// (src/index.d.ts is shadowed by src/index.ts, so the declaration lives here)
declare global {
  var Logger: typeof import('./logger').default;
}

global.Logger = Logger;
