import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatLogArgs,
  openLogFile,
  resolveLogOptions,
  type LogFileOptions,
} from './logfile';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omegga-logfile-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const at = (iso: string) => new Date(iso);
const opts = (over: Partial<LogFileOptions> = {}): LogFileOptions => ({
  dir,
  maxBytes: 1024,
  keepDays: 7,
  timestamp: 'yyyy-mm-dd HH:MM:ss.l',
  ...over,
});

const name = (date: string, index = 0) =>
  index > 0 ? `omegga-${date}.${index}.log` : `omegga-${date}.log`;
const read = (date: string, index = 0) =>
  fs.readFileSync(path.join(dir, name(date, index)), 'utf8');
const ls = () => fs.readdirSync(dir).sort();

describe('formatLogArgs', () => {
  it('renders args the way console does', () => {
    expect(formatLogArgs(['%s has %d bricks', 'world', 3])).toBe(
      'world has 3 bricks',
    );
    expect(formatLogArgs(['a', { b: 1 }])).toBe('a { b: 1 }');
  });

  it('strips the colors baked in by the colors package', () => {
    // what `'>>'.green` and `'hello'.underline` actually are by the time a
    // logger sees them
    expect(formatLogArgs(['\x1b[32m>>\x1b[39m', '\x1b[4mhello\x1b[24m'])).toBe(
      '>> hello',
    );
  });

  it('keeps an error stack', () => {
    const err = new Error('boom');
    expect(formatLogArgs([err])).toContain('Error: boom');
    expect(formatLogArgs([err])).toContain('at ');
  });

  it('normalizes carriage returns', () => {
    expect(formatLogArgs(['a\r\nb\rc'])).toBe('a\nb\nc');
  });
});

describe('resolveLogOptions', () => {
  it('is enabled with no config at all', () => {
    const resolved = resolveLogOptions('/srv', undefined);
    expect(resolved?.dir).toBe(path.resolve('/srv', './data/logs'));
    expect(resolved?.maxBytes).toBe(32 * 2 ** 20);
    expect(resolved?.keepDays).toBe(7);
  });

  it('is null when disabled', () => {
    expect(resolveLogOptions('/srv', { enabled: false })).toBeNull();
  });

  it('resolves a relative dir against the working directory', () => {
    expect(resolveLogOptions('/srv', { dir: './logs' })?.dir).toBe('/srv/logs');
  });
});

describe('openLogFile', () => {
  it('writes nothing and creates nothing when disabled', () => {
    expect(openLogFile(null)).toBeNull();
    expect(ls()).toEqual([]);
  });

  it('prefixes every line with a timestamp and a padded level', () => {
    const sink = openLogFile(opts(), at('2026-09-16T14:05:30.123'))!;
    sink.write('log', 'hello', at('2026-09-16T14:05:30.123'));
    sink.write('error', 'bad', at('2026-09-16T14:05:31.004'));
    sink.close();
    expect(read('2026-09-16')).toBe(
      '2026-09-16 14:05:30.123 [LOG  ] hello\n' +
        '2026-09-16 14:05:31.004 [ERROR] bad\n',
    );
  });

  it('rolls to a numbered part past the size cap', () => {
    const sink = openLogFile(
      opts({ maxBytes: 200 }),
      at('2026-09-16T01:00:00'),
    )!;
    for (let i = 0; i < 20; i++)
      sink.write('log', `line ${i}`, at('2026-09-16T01:00:00'));
    sink.close();

    expect(ls()).toContain(name('2026-09-16', 1));
    for (const file of ls())
      expect(fs.statSync(path.join(dir, file)).size).toBeLessThanOrEqual(200);

    // nothing lost or duplicated across the boundary
    const all = ls()
      .map(f => fs.readFileSync(path.join(dir, f), 'utf8'))
      .join('');
    for (let i = 0; i < 20; i++) expect(all).toContain(`line ${i}\n`);
  });

  it('writes an over-cap line to one part instead of rolling forever', () => {
    const sink = openLogFile(
      opts({ maxBytes: 64 }),
      at('2026-09-16T01:00:00'),
    )!;
    sink.write('log', 'x'.repeat(500), at('2026-09-16T01:00:00'));
    sink.close();
    expect(ls()).toEqual([name('2026-09-16')]);
    expect(read('2026-09-16')).toContain('x'.repeat(500));
  });

  it('appends to the highest existing part after a restart mid-day', () => {
    fs.writeFileSync(path.join(dir, name('2026-09-16')), 'x'.repeat(300));
    fs.writeFileSync(path.join(dir, name('2026-09-16', 1)), 'old\n');

    const sink = openLogFile(
      opts({ maxBytes: 200 }),
      at('2026-09-16T05:00:00'),
    )!;
    sink.write('log', 'resumed', at('2026-09-16T05:00:00'));
    sink.close();

    expect(read('2026-09-16', 1)).toBe(
      'old\n2026-09-16 05:00:00.000 [LOG  ] resumed\n',
    );
    expect(read('2026-09-16')).toBe('x'.repeat(300));
  });

  it('never reuses a part index that was deleted', () => {
    fs.writeFileSync(path.join(dir, name('2026-09-16')), 'a\n');
    fs.writeFileSync(path.join(dir, name('2026-09-16', 2)), 'c\n');

    const sink = openLogFile(opts(), at('2026-09-16T05:00:00'))!;
    sink.write('log', 'resumed', at('2026-09-16T05:00:00'));
    sink.close();

    expect(fs.existsSync(path.join(dir, name('2026-09-16', 1)))).toBe(false);
    expect(read('2026-09-16', 2)).toContain('resumed');
  });

  it('opens a new file when the date rolls over', () => {
    const sink = openLogFile(opts(), at('2026-09-16T23:59:59'))!;
    sink.write('log', 'before', at('2026-09-16T23:59:59'));
    sink.write('log', 'after', at('2026-09-17T00:00:01'));
    sink.close();

    expect(read('2026-09-16')).toContain('before');
    expect(read('2026-09-17')).toContain('after');
  });

  it('reopens the earlier day when the clock steps backwards', () => {
    const sink = openLogFile(opts(), at('2026-09-17T00:00:01'))!;
    sink.write('log', 'tomorrow', at('2026-09-17T00:00:01'));
    sink.write('log', 'yesterday', at('2026-09-16T23:59:50'));
    sink.close();

    expect(read('2026-09-17')).toContain('tomorrow');
    expect(read('2026-09-16')).toContain('yesterday');
  });

  it('prunes past the retention and leaves everything else alone', () => {
    for (const day of ['05', '09', '10', '16'])
      fs.writeFileSync(path.join(dir, name(`2026-09-${day}`)), 'x\n');
    fs.writeFileSync(path.join(dir, name('2026-09-09', 3)), 'x\n');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep me\n');
    fs.writeFileSync(path.join(dir, 'omegga-garbage.log'), 'keep me\n');
    fs.mkdirSync(path.join(dir, 'omegga-2026-09-01.log.d'));

    // keepDays 7 counting today keeps 2026-09-10 onward
    openLogFile(opts({ keepDays: 7 }), at('2026-09-16T01:00:00'))!.close();

    expect(ls()).toEqual(
      [
        'notes.txt',
        'omegga-2026-09-01.log.d',
        name('2026-09-10'),
        name('2026-09-16'),
        'omegga-garbage.log',
      ].sort(),
    );
  });

  it('keeps everything when retention is zero', () => {
    fs.writeFileSync(path.join(dir, name('2020-01-01')), 'x\n');
    openLogFile(opts({ keepDays: 0 }), at('2026-09-16T01:00:00'))!.close();
    expect(ls()).toContain(name('2020-01-01'));
  });

  it('reports once and stops writing when the file breaks', () => {
    const onError = vi.fn();
    const sink = openLogFile(opts({ onError }), at('2026-09-16T01:00:00'))!;
    sink.write('log', 'fine', at('2026-09-16T01:00:00'));

    // stand in for a full disk: every later write fails at the syscall
    const writeSync = vi.spyOn(fs, 'writeSync').mockImplementation(() => {
      throw new Error('ENOSPC');
    });
    sink.write('log', 'lost', at('2026-09-16T01:00:01'));
    sink.write('log', 'also lost', at('2026-09-16T01:00:02'));
    writeSync.mockRestore();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(read('2026-09-16')).toBe('2026-09-16 01:00:00.000 [LOG  ] fine\n');
  });

  it('is null when the directory cannot be created', () => {
    const onError = vi.fn();
    const blocked = path.join(dir, 'file');
    fs.writeFileSync(blocked, 'not a directory\n');
    expect(
      openLogFile(opts({ dir: path.join(blocked, 'logs'), onError })),
    ).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
