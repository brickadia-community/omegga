import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyLogsOverrides } from './index';
import { type IConfig } from './types';

// keep the "not a number"/"not a boolean" warnings out of the test output
vi.mock('@/logger', () => ({
  default: { warnp: () => {}, verbose: () => {} },
}));

const ENV_KEYS = [
  'LOGS_ENABLED',
  'LOGS_DIR',
  'LOGS_MAX_SIZE_MB',
  'LOGS_KEEP_DAYS',
  'LOGS_VERBOSE',
] as const;

const baseConfig = (): IConfig => ({
  server: { port: 7777 },
  logs: { enabled: true },
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('applyLogsOverrides', () => {
  it('leaves the config alone when nothing is set', () => {
    expect(applyLogsOverrides(baseConfig()).logs).toEqual({ enabled: true });
  });

  it('lets the environment win over the config file', () => {
    process.env.LOGS_DIR = '/var/log/omegga';
    process.env.LOGS_MAX_SIZE_MB = '128';
    process.env.LOGS_KEEP_DAYS = '30';
    expect(applyLogsOverrides(baseConfig()).logs).toEqual({
      enabled: true,
      dir: '/var/log/omegga',
      maxSizeMB: 128,
      keepDays: 30,
    });
  });

  it('disables what the config file enabled', () => {
    process.env.LOGS_ENABLED = 'false';
    expect(applyLogsOverrides(baseConfig()).logs?.enabled).toBe(false);
  });

  it('creates the block from the environment alone', () => {
    process.env.LOGS_ENABLED = 'true';
    expect(applyLogsOverrides({ server: { port: 7777 } }).logs).toEqual({
      enabled: true,
    });
  });

  it('turns file verbose on from the environment', () => {
    process.env.LOGS_VERBOSE = 'true';
    expect(applyLogsOverrides(baseConfig()).logs?.verbose).toBe(true);
  });

  it('keeps zero, which means keep everything', () => {
    process.env.LOGS_KEEP_DAYS = '0';
    expect(applyLogsOverrides(baseConfig()).logs?.keepDays).toBe(0);
  });

  it('ignores values that are not numbers', () => {
    process.env.LOGS_MAX_SIZE_MB = 'big';
    process.env.LOGS_KEEP_DAYS = '-1';
    expect(applyLogsOverrides(baseConfig()).logs).toEqual({ enabled: true });
  });

  it('ignores a whitespace-only directory', () => {
    process.env.LOGS_DIR = '   ';
    expect(applyLogsOverrides(baseConfig()).logs).toEqual({ enabled: true });
  });
});
