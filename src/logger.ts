import type Terminal from '@cli/terminal';

export default class Logger {
  static VERBOSE = false;
  static terminal: Terminal;

  /**
   * Send a console log to the readline terminal or stdout
   */
  static log(...args: any[]) {
    (Logger.terminal || console).log(...args);
  }

  /**
   * Send a prefixed console log to the readline terminal or stdout
   */
  static logp(...args: any[]) {
    (Logger.terminal || console).log('>>'.green, ...args);
  }

  /**
   * Send a console debug to the readline terminal or stdout
   */
  static debug(...args: any[]) {
    (Logger.terminal || console).debug(...args);
  }

  /**
   * Send a console error to the readline terminal or stderr
   */
  static error(...args: any[]) {
    (Logger.terminal || console).error(...args);
  }

  /**
   * Send a prefixed console error to the readline terminal or stderr
   */
  static errorp(...args: any[]) {
    (Logger.terminal || console).error('!>'.red, ...args);
  }

  /**
   * Send a console warn to the readline terminal or stdout
   */
  static warn(...args: any[]) {
    (Logger.terminal || console).warn(...args);
  }

  /**
   * Send a prefixed console warn to the readline terminal or stdout
   */
  static warnp(...args: any[]) {
    (Logger.terminal || console).warn('>>'.yellow, ...args);
  }

  /**
   * Send a console log when omegga is launched when --verbose
   */
  static verbose(...args: any[]) {
    if (!Logger.VERBOSE) return;
    (Logger.terminal || console).log('V>'.magenta, ...args);
  }

  /**
   * Send a console log to the readline terminal or console
   */
  static setTerminal(term: Terminal) {
    Logger.terminal = term;
  }
}

global.Logger = Logger;
