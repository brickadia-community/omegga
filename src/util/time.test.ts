import { describe, expect, it } from 'vitest';
import { parseBrickadiaTime } from './time';

describe('parseBrickadiaTime', () => {
  it('parses the standard BanList.json format (YYYY.MM.DD-HH.MM.SS)', () => {
    // the exact shape Brickadia writes for created/expires
    expect(parseBrickadiaTime('2026.07.07-14.04.18')).toBe(
      Date.UTC(2026, 6, 7, 14, 4, 18),
    );
    expect(parseBrickadiaTime('2026.07.08-14.04.18')).toBe(
      Date.UTC(2026, 6, 8, 14, 4, 18),
    );
  });

  it('parses a permanent ban (expires before created) as a finite value', () => {
    // a -1 "permanent" ban writes expires one minute before created; omegga
    // treats expires <= created as permanent, but it must still be a real time
    const value = parseBrickadiaTime('2026.07.07-14.08.28');
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBe(Date.UTC(2026, 6, 7, 14, 8, 28));
  });

  it('parses year-overflowed dates (Brickadia clamps a huge duration)', () => {
    // large ban durations overflow Brickadia's year field; the string is still
    // structurally valid and must parse to a finite (here negative) epoch
    const value = parseBrickadiaTime('0643.07.13-14.47.10');
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeLessThan(0);
  });

  it('returns NaN (does not throw) for an invalid date', () => {
    // an overflow that lands on an out-of-range field yields Invalid Date; this
    // is the value that, unguarded, hit the NOT NULL ban_history.expires crash
    expect(parseBrickadiaTime('9999.99.99-99.99.99')).toBeNaN();
    expect(parseBrickadiaTime('0000.00.00-00.00.00')).toBeNaN();
  });

  it('returns NaN (does not throw) when the time part is missing', () => {
    // no dash means String.split yields only a date; the old code threw a
    // TypeError reading .replace on the undefined time half
    expect(() => parseBrickadiaTime('2026.07.07')).not.toThrow();
    expect(parseBrickadiaTime('2026.07.07')).toBeNaN();
    expect(parseBrickadiaTime('0')).toBeNaN();
    expect(parseBrickadiaTime('')).toBeNaN();
  });

  it('returns NaN for non-string input', () => {
    expect(parseBrickadiaTime(undefined as any)).toBeNaN();
    expect(parseBrickadiaTime(null as any)).toBeNaN();
  });
});
