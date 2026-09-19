import { type ILogsConfig } from '@config/types';
import soft from '@/softconfig';
import dateformatImport from 'dateformat';
import fs from 'fs';
import path from 'path';
import stripAnsi from 'strip-ansi';
import { format } from 'util';

type DateFormat = (date: Date, mask: string) => string;

// dateformat v5 is ESM-only, so the CJS bundle vite emits resolves this import
// to the module namespace rather than to the function it is typed as, which is
// what the cast is for. src/logger.ts dodges the same problem with a require()
const dateformat: DateFormat =
  (dateformatImport as unknown as { default?: DateFormat }).default ??
  dateformatImport;

export type LogLevel = 'log' | 'debug' | 'warn' | 'error';

/** padded so the message column lines up between levels */
const LEVEL_TAG: Record<LogLevel, string> = {
  log: 'LOG  ',
  debug: 'DEBUG',
  warn: 'WARN ',
  error: 'ERROR',
};

const DAY_FMT = 'yyyy-mm-dd';

// `omegga-2026-09-16.log` and its `.1` size parts. Discovery and pruning both
// use it, so nothing else in the directory is ever opened or deleted
const LOG_FILE_RE = new RegExp(
  `^${soft.LOG_FILE_PREFIX}-(\\d{4}-\\d{2}-\\d{2})(?:\\.(\\d+))?\\.log$`,
);

// how often an unlinked file is noticed, instead of an fstat per line
const VERIFY_INTERVAL = 60_000;

export type LogFileOptions = {
  dir: string;
  maxBytes: number;
  /** days of files to keep, counting today. 0 keeps them forever */
  keepDays: number;
  timestamp: string;
  /**
   * Called once, after the sink has disabled itself, so the handler can log
   * the reason without recursing into a broken sink.
   */
  onError?: (err: unknown) => void;
};

export interface LogFileSink {
  /**
   * `when` is a parameter, not the clock, so lines buffered before the sink
   * existed keep the time they happened.
   */
  write(level: LogLevel, text: string, when: Date): void;
  close(): void;
}

/**
 * Render log args the way `console` would, minus the colors a file cannot
 * show. The `colors` package bakes escapes in before a logger ever sees them.
 */
export function formatLogArgs(args: unknown[]): string {
  return stripAnsi(format(...args)).replace(/\r\n?/g, '\n');
}

function fileName(date: string, index: number) {
  return index > 0
    ? `${soft.LOG_FILE_PREFIX}-${date}.${index}.log`
    : `${soft.LOG_FILE_PREFIX}-${date}.log`;
}

/**
 * Local midnight either side of a date. Built from calendar fields so the Date
 * constructor normalizes a 23 or 25 hour DST day.
 */
function dayBounds(when: Date): [number, number] {
  const y = when.getFullYear();
  const m = when.getMonth();
  const d = when.getDate();
  return [new Date(y, m, d).getTime(), new Date(y, m, d + 1).getTime()];
}

class LogFile implements LogFileSink {
  #opts: LogFileOptions;
  #fd = -1;
  #bytes = 0;
  #index = 0;
  #date = '';
  #dayStart = 0;
  #dayEnd = 0;
  #lastVerify = 0;
  #disabled = false;

  constructor(opts: LogFileOptions, when: Date) {
    this.#opts = opts;
    this.#openDay(when);
  }

  write(level: LogLevel, text: string, when: Date) {
    if (this.#disabled) return;
    try {
      const now = when.getTime();
      // the lower bound matters too: a clock stepped backwards across midnight
      // has to reopen the previous day rather than keep appending to tomorrow
      if (now >= this.#dayEnd || now < this.#dayStart) this.#openDay(when);
      else this.#verifyStillLinked(now);

      const line = `${dateformat(when, this.#opts.timestamp)} [${
        LEVEL_TAG[level]
      }] ${text}\n`;
      const buf = Buffer.from(line, 'utf8');

      // a line longer than the whole cap still goes to one oversized part
      // rather than rolling forever looking for a file it would fit in
      if (this.#bytes > 0 && this.#bytes + buf.length > this.#opts.maxBytes)
        this.#openIndex(this.#index + 1);

      // writeSync is allowed to write less than it was given
      let offset = 0;
      while (offset < buf.length)
        offset += fs.writeSync(this.#fd, buf, offset, buf.length - offset);
      this.#bytes += buf.length;
    } catch (err) {
      this.#fail(err);
    }
  }

  close() {
    this.#disabled = true;
    this.#closeFd();
  }

  #closeFd() {
    if (this.#fd < 0) return;
    try {
      fs.closeSync(this.#fd);
    } catch {
      /* the fd is being abandoned either way */
    }
    this.#fd = -1;
  }

  /** disable before reporting, or the report recurses straight back in here */
  #fail(err: unknown) {
    if (this.#disabled) return;
    this.#disabled = true;
    this.#closeFd();
    this.#opts.onError?.(err);
  }

  /**
   * An external logrotate or `rm` leaves the fd valid but pointed at an
   * unlinked inode, so writes succeed into nothing until something reopens the
   * path. Windows reports nlink 1 and refuses the delete, so it is a no-op.
   */
  #verifyStillLinked(now: number) {
    if (now - this.#lastVerify < VERIFY_INTERVAL) return;
    this.#lastVerify = now;
    try {
      if (fs.fstatSync(this.#fd).nlink === 0) this.#openIndex(this.#index);
    } catch {
      /* a failed check is not a reason to stop logging */
    }
  }

  #openDay(when: Date) {
    this.#date = dateformat(when, DAY_FMT);
    [this.#dayStart, this.#dayEnd] = dayBounds(when);
    this.#lastVerify = when.getTime();
    this.#openIndex(this.#highestIndex());
    this.#prune(when);
  }

  /**
   * The highest part already on disk for the open date, so a restart mid-day
   * appends instead of clobbering. A gap left by a deleted part is not filled:
   * that index sits between neighbours that bracket it in time.
   */
  #highestIndex() {
    let highest = 0;
    try {
      for (const name of fs.readdirSync(this.#opts.dir)) {
        const match = name.match(LOG_FILE_RE);
        if (!match || match[1] !== this.#date) continue;
        highest = Math.max(highest, Number(match[2] ?? 0));
      }
    } catch {
      /* the directory is created on open; an unreadable one fails there */
    }
    return highest;
  }

  #openIndex(index: number) {
    this.#closeFd();
    fs.mkdirSync(this.#opts.dir, { recursive: true });

    // appending rather than truncating, so no path through here can destroy an
    // existing log, and a part already over the cap advances to a fresh one
    for (;;) {
      const file = path.join(this.#opts.dir, fileName(this.#date, index));
      const fd = fs.openSync(file, 'a');
      // fstat on the fd rather than stat on the path, so the size belongs to
      // the file that was actually opened
      const size = fs.fstatSync(fd).size;
      if (size < this.#opts.maxBytes || index >= Number.MAX_SAFE_INTEGER) {
        this.#fd = fd;
        this.#bytes = size;
        this.#index = index;
        return;
      }
      fs.closeSync(fd);
      index++;
    }
  }

  /**
   * Zero-padded ISO dates compare correctly as strings, so retention needs no
   * date parsing or timezone math beyond finding the cutoff day.
   */
  #prune(when: Date) {
    if (this.#opts.keepDays <= 0) return;
    const cutoff = dateformat(
      new Date(
        when.getFullYear(),
        when.getMonth(),
        when.getDate() - (this.#opts.keepDays - 1),
      ),
      DAY_FMT,
    );
    try {
      for (const name of fs.readdirSync(this.#opts.dir)) {
        const match = name.match(LOG_FILE_RE);
        if (!match || match[1] >= cutoff) continue;
        try {
          fs.unlinkSync(path.join(this.#opts.dir, name));
        } catch {
          /* one locked file must not stop the rest of the sweep */
        }
      }
    } catch {
      /* pruning is best effort; failing it is not worth losing logging over */
    }
  }
}

/** Fold config over the defaults. Null when logging is turned off. */
export function resolveLogOptions(
  workDir: string,
  logs: ILogsConfig | undefined,
): LogFileOptions | null {
  if (logs?.enabled === false) return null;
  const { maxSizeMB, keepDays, timestamp } = soft.LOGS_DEFAULTS;
  return {
    dir: path.resolve(workDir, logs?.dir ?? soft.LOGS_PATH),
    maxBytes: Math.max(1, Math.round((logs?.maxSizeMB ?? maxSizeMB) * 2 ** 20)),
    keepDays: logs?.keepDays ?? keepDays,
    timestamp: logs?.timestamp ?? timestamp,
  };
}

/**
 * Open the rotating console log. Null when logging is disabled or the first
 * file cannot be opened at all: omegga runs a game server, and an unwritable
 * log directory is not a reason to refuse to start.
 *
 * Writes are synchronous. Omegga calls `process.exit()` from its shutdown path
 * and its uncaught exception handler, neither of which drains a stream, so a
 * buffered sink would lose exactly the lines someone opens this file to read.
 * Nothing is in flight here, so there is nothing to flush on the way out.
 */
export function openLogFile(
  opts: LogFileOptions | null,
  now = new Date(),
): LogFileSink | null {
  if (!opts) return null;
  try {
    return new LogFile(opts, now);
  } catch (err) {
    opts.onError?.(err);
    return null;
  }
}
