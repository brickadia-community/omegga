import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMetricsOverrides } from './index';
import { type IConfig } from './types';

// keep the "not a port"/"not a boolean" warnings out of the test output
vi.mock('@/logger', () => ({
  default: { warnp: () => {}, verbose: () => {} },
}));

const ENV_KEYS = ['METRICS_ENABLED', 'METRICS_BIND', 'METRICS_PORT'] as const;

const baseConfig = (): IConfig => ({
  server: { port: 7777 },
  metrics: { enabled: false, bind: '127.0.0.1', port: 9000 },
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('applyMetricsOverrides', () => {
  it('leaves the config alone when nothing is set', () => {
    const conf = baseConfig();
    expect(applyMetricsOverrides(conf).metrics).toEqual({
      enabled: false,
      bind: '127.0.0.1',
      port: 9000,
    });
  });

  it('lets the environment win over the config file', () => {
    process.env.METRICS_ENABLED = 'true';
    process.env.METRICS_BIND = '0.0.0.0';
    process.env.METRICS_PORT = '9111';
    expect(applyMetricsOverrides(baseConfig()).metrics).toEqual({
      enabled: true,
      bind: '0.0.0.0',
      port: 9111,
    });
  });

  it('accepts the usual boolean spellings', () => {
    for (const value of ['true', '1', 'yes', 'on', 'TRUE', ' True ']) {
      process.env.METRICS_ENABLED = value;
      expect(applyMetricsOverrides(baseConfig()).metrics?.enabled).toBe(true);
    }
    for (const value of ['false', '0', 'no', 'off', 'FALSE']) {
      process.env.METRICS_ENABLED = value;
      expect(applyMetricsOverrides(baseConfig()).metrics?.enabled).toBe(false);
    }
  });

  it('can disable metrics that the config file enabled', () => {
    process.env.METRICS_ENABLED = 'false';
    const conf = baseConfig();
    conf.metrics = { enabled: true };
    expect(applyMetricsOverrides(conf).metrics?.enabled).toBe(false);
  });

  it('ignores a value that is not a boolean', () => {
    process.env.METRICS_ENABLED = 'maybe';
    expect(applyMetricsOverrides(baseConfig()).metrics?.enabled).toBe(false);
  });

  it('ignores a port that is not a port', () => {
    for (const value of ['nope', '0', '65536', '-1', '80.5']) {
      process.env.METRICS_PORT = value;
      expect(applyMetricsOverrides(baseConfig()).metrics?.port).toBe(9000);
    }
  });

  it('ignores an empty bind rather than binding to nothing', () => {
    process.env.METRICS_BIND = '   ';
    expect(applyMetricsOverrides(baseConfig()).metrics?.bind).toBe('127.0.0.1');
  });

  it('creates the metrics block when the config file has none', () => {
    process.env.METRICS_ENABLED = 'true';
    const conf: IConfig = { server: { port: 7777 } };
    expect(applyMetricsOverrides(conf).metrics).toEqual({ enabled: true });
  });
});
