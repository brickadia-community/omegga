import type Terminal from '@cli/terminal';

export default class Logger {
  static VERBOSE = false;
  static terminal: Terminal;
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
  static timestamped(args: any[]): any[] {
    if (!Logger.timestampFmt || !Logger.dateformat) return args;
    return [Logger.dateformat(new Date(), Logger.timestampFmt).grey, ...args];
  }

  /**
   * Log with timestamp when no terminal, pass through to terminal otherwise
   */
  private static out(method: 'log' | 'debug' | 'warn' | 'error', args: any[]) {
    if (Logger.terminal) {
      Logger.terminal[method](...args);
    } else {
      console[method](...Logger.timestamped(args));
    }
  }

  /**
   * Send a console log to the readline terminal or stdout
   */
  static log(...args: any[]) {
    Logger.out('log', args);
  }

  /**
   * Send a prefixed console log to the readline terminal or stdout
   */
  static logp(...args: any[]) {
    Logger.out('log', ['>>'.green, ...args]);
  }

  /**
   * Send a console debug to the readline terminal or stdout
   */
  static debug(...args: any[]) {
    Logger.out('debug', args);
  }

  /**
   * Send a console error to the readline terminal or stderr
   */
  static error(...args: any[]) {
    Logger.out('error', args);
  }

  /**
   * Send a prefixed console error to the readline terminal or stderr
   */
  static errorp(...args: any[]) {
    Logger.out('error', ['!>'.red, ...args]);
  }

  /**
   * Send a console warn to the readline terminal or stdout
   */
  static warn(...args: any[]) {
    Logger.out('warn', args);
  }

  /**
   * Send a prefixed console warn to the readline terminal or stdout
   */
  static warnp(...args: any[]) {
    Logger.out('warn', ['>>'.yellow, ...args]);
  }

  /**
   * Send a console log when omegga is launched when --verbose
   */
  static verbose(...args: any[]) {
    if (!Logger.VERBOSE) return;
    Logger.out('log', ['V>'.magenta, ...args]);
  }

  /**
   * Send a console log to the readline terminal or console
   */
  static setTerminal(term: Terminal) {
    Logger.terminal = term;
  }
}

global.Logger = Logger;
