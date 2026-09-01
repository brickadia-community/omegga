import EventEmitter from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import MetricsServer from './index';
import {
  getPluginErrors,
  getUncaughtExceptions,
  getUnhandledRejections,
  recordPluginError,
  recordUncaughtException,
  recordUnhandledRejection,
  resetErrorCounts,
} from './errors';
import { PluginMetricsHost } from './plugin';
import { Registry } from './registry';
import { render } from './render';
import type Omegga from '@omegga/server';

describe('scrape resilience', () => {
  it('does not let a throwing collect callback kill the scrape', () => {
    const r = new Registry();
    r.gauge({ name: 'good' }).set(1);
    r.gauge({ name: 'bad' }).collect(() => {
      throw new Error('plugin exploded');
    });
    r.gauge({ name: 'also_good' }).set(2);

    expect(() => r.snapshot()).not.toThrow();
    const out = render(r.snapshot());
    expect(out).toContain('good 1');
    expect(out).toContain('also_good 2');
  });

  it('keeps one plugin from taking down another plugin metrics', () => {
    const host = new PluginMetricsHost();
    host.facade('good').gauge({ name: 'x' }).set(1);
    host
      .facade('bad')
      .gauge({ name: 'y' })
      .collect(() => {
        throw new Error('boom');
      });

    expect(() => host.snapshot()).not.toThrow();
    expect(render(host.snapshot())).toContain('omegga_plugin_good_x');
  });

  it('keeps a metric previous value when its collector throws', () => {
    const r = new Registry();
    let broken = false;
    const g = r.gauge({ name: 'flaky' });
    g.collect(() => {
      if (broken) throw new Error('boom');
      return 7;
    });
    expect(render(r.snapshot())).toContain('flaky 7');
    broken = true;
    expect(render(r.snapshot())).toContain('flaky 7');
  });

  it('reports a failed collector instead of swallowing it silently', () => {
    const onError = vi.fn();
    const r = new Registry();
    r.onError = onError;
    r.gauge({ name: 'bad' }).collect(() => {
      throw new Error('boom');
    });
    r.snapshot();
    expect(onError).toHaveBeenCalledWith('bad', expect.any(Error));
  });

  it('counts a plugin collect failure per plugin', () => {
    const host = new PluginMetricsHost();
    host
      .facade('bad')
      .gauge({ name: 'y' })
      .collect(() => {
        throw new Error('boom');
      });
    host.snapshot();
    host.snapshot();
    expect(host.errorCount('bad')).toBe(2);
    expect(host.errorCount('other')).toBe(0);
  });

  it('forgets error tallies when a plugin is dropped', () => {
    const host = new PluginMetricsHost();
    host
      .facade('p')
      .gauge({ name: 'y' })
      .collect(() => {
        throw new Error('boom');
      });
    host.snapshot();
    expect(host.errorCount('p')).toBe(1);
    host.drop('p');
    expect(host.errorCount('p')).toBe(0);
  });

  it('still serves a scrape when a plugin collector throws', async () => {
    const omegga = Object.assign(new EventEmitter(), {
      started: false,
      starting: false,
      stopping: false,
      crashDetected: false,
      currentMap: '',
      version: 1,
      players: [],
      path: process.cwd(),
      gamePid: null,
      config: { server: { port: 7777 } },
      webserver: undefined,
      pluginLoader: { plugins: [] },
      getServerStatus: async () => null,
    }) as unknown as Omegga;

    const server = new MetricsServer(omegga, { enabled: true, port: 0 });
    server.setup();
    server.plugins
      .facade('bad')
      .gauge({ name: 'y' })
      .collect(() => {
        throw new Error('boom');
      });

    const body = await server.collect();
    // omegga's own metrics survive a broken plugin
    expect(body).toContain('omegga_up 1');
    expect(body).toContain('omegga_metrics_collect_errors_total');
  });
});

describe('error counters', () => {
  it('tallies process errors separately', () => {
    resetErrorCounts();
    recordUncaughtException();
    recordUnhandledRejection();
    recordUnhandledRejection();
    expect(getUncaughtExceptions()).toBe(1);
    expect(getUnhandledRejections()).toBe(2);
  });

  it('tallies plugin errors by name', () => {
    resetErrorCounts();
    recordPluginError('a');
    recordPluginError('a');
    recordPluginError('b');
    expect(getPluginErrors('a')).toBe(2);
    expect(getPluginErrors('b')).toBe(1);
    expect(getPluginErrors('never-errored')).toBe(0);
  });

  it('exports the process error counters in a scrape', async () => {
    resetErrorCounts();
    const omegga = Object.assign(new EventEmitter(), {
      started: false,
      starting: false,
      stopping: false,
      crashDetected: false,
      currentMap: '',
      version: 1,
      players: [],
      path: process.cwd(),
      gamePid: null,
      config: { server: { port: 7777 } },
      webserver: undefined,
      pluginLoader: { plugins: [] },
      getServerStatus: async () => null,
    }) as unknown as Omegga;

    const server = new MetricsServer(omegga, { enabled: true, port: 0 });
    server.setup();
    recordUncaughtException();
    recordPluginError('busted');

    const body = await server.collect();
    expect(body).toContain('omegga_uncaught_exceptions_total 1');
    expect(body).toContain('omegga_unhandled_rejections_total 0');
    // an errored plugin stays visible even though the loader has no plugins
    expect(body).toContain('omegga_plugin_errors_total{plugin="busted"} 1');
    resetErrorCounts();
  });
});

describe('sessions ended by a server stop', () => {
  const fakeOmegga = () =>
    Object.assign(new EventEmitter(), {
      started: false,
      starting: false,
      stopping: false,
      crashDetected: false,
      currentMap: '',
      version: 1,
      players: [],
      path: process.cwd(),
      gamePid: null,
      config: { server: { port: 7777 } },
      webserver: undefined,
      pluginLoader: { plugins: [] },
      getServerStatus: async () => null,
    }) as unknown as Omegga;

  it('records a session cut short by a shutdown in the histogram', async () => {
    // a stopping server emits no 'leave', so without an explicit flush these
    // sessions vanish from the histogram. long sessions are the likeliest to
    // be cut off by a restart, so dropping them biases it toward short ones
    const server = new MetricsServer(fakeOmegga(), { enabled: true, port: 0 });
    server.setup();
    server.omegga.emit('join', { id: 'a' });
    server.omegga.emit('join', { id: 'b' });
    server.omegga.emit('server:stopped');

    expect(await server.collect()).toContain(
      'brickadia_player_session_seconds_count 2',
    );
  });

  it('does not count a shutdown as a player disconnect', async () => {
    // players_left_total tracks disconnects; a shutdown is not one
    const server = new MetricsServer(fakeOmegga(), { enabled: true, port: 0 });
    server.setup();
    server.omegga.emit('join', { id: 'a' });
    server.omegga.emit('server:stopped');

    const body = await server.collect();
    expect(body).toContain('brickadia_players_left_total 0');
    expect(body).toContain('brickadia_stops_total 1');
  });
});
