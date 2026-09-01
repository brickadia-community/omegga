import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNonInteractive, parseEnvBool } from './env';

vi.mock('@/logger', () => ({
  default: { warnp: () => {} },
}));

const ORIGINAL_TTY = process.stdin.isTTY;

afterEach(() => {
  delete process.env.TEST_BOOL;
  delete process.env.OMEGGA_NONINTERACTIVE;
  process.stdin.isTTY = ORIGINAL_TTY;
});

describe('parseEnvBool', () => {
  it('reads the value rather than testing for presence', () => {
    // the whole point: an orchestrator that materialises every declared
    // variable cannot leave one unset, so "false" has to mean false
    for (const raw of ['false', '0', 'no', 'off', 'FALSE', ' Off ']) {
      process.env.TEST_BOOL = raw;
      expect(parseEnvBool('TEST_BOOL')).toBe(false);
    }
    for (const raw of ['true', '1', 'yes', 'on', 'TRUE', ' On ']) {
      process.env.TEST_BOOL = raw;
      expect(parseEnvBool('TEST_BOOL')).toBe(true);
    }
  });

  it('returns undefined for unset, empty, and unparseable values', () => {
    expect(parseEnvBool('TEST_BOOL')).toBeUndefined();
    process.env.TEST_BOOL = '';
    expect(parseEnvBool('TEST_BOOL')).toBeUndefined();
    process.env.TEST_BOOL = 'maybe';
    expect(parseEnvBool('TEST_BOOL')).toBeUndefined();
  });
});

describe('isNonInteractive', () => {
  it('follows the tty when OMEGGA_NONINTERACTIVE is unset', () => {
    process.stdin.isTTY = true;
    expect(isNonInteractive()).toBe(false);
    process.stdin.isTTY = false;
    expect(isNonInteractive()).toBe(true);
  });

  it('lets OMEGGA_NONINTERACTIVE override the tty in both directions', () => {
    // a panel console is a real tty that still cannot answer an arrow-key
    // prompt, and a caller feeding stdin is not a tty but can
    process.stdin.isTTY = true;
    process.env.OMEGGA_NONINTERACTIVE = 'true';
    expect(isNonInteractive()).toBe(true);

    process.stdin.isTTY = false;
    process.env.OMEGGA_NONINTERACTIVE = 'false';
    expect(isNonInteractive()).toBe(false);
  });

  it('falls back to the tty when the override is not a boolean', () => {
    process.stdin.isTTY = false;
    process.env.OMEGGA_NONINTERACTIVE = 'maybe';
    expect(isNonInteractive()).toBe(true);
  });
});
