/*
  Metrics about omegga itself: build info, the plugin loader, and host
  utilization borrowed from the web UI heartbeat.
*/

import type Omegga from '@omegga/server';
import { isContainer } from '@util/container';
import { VERSION } from '@/version';
import {
  getErroredPlugins,
  getPluginErrors,
  getUncaughtExceptions,
  getUnhandledRejections,
} from '../errors';
import { getLastUtilization, getNetworkBytes } from './host';
import { type Registry, type ScalarSample } from '../registry';

export function registerOmeggaMetrics(
  registry: Registry,
  omegga: Omegga,
): void {
  registry
    .gauge({
      name: 'omegga_build_info',
      help: 'omegga build information, always 1',
      labels: ['version', 'node', 'platform', 'container'],
    })
    .set(
      {
        version: VERSION,
        node: process.version,
        platform: process.platform,
        container: String(isContainer()),
      },
      1,
    );

  registry
    .gauge({ name: 'omegga_up', help: 'Whether omegga is running, always 1' })
    .set(1);

  registry
    .gauge({
      name: 'omegga_start_time_seconds',
      help: 'Unix timestamp of the omegga process start',
    })
    .set((Date.now() - process.uptime() * 1000) / 1000);

  registry
    .gauge({
      name: 'omegga_webserver_up',
      help: 'Whether the omegga web UI is serving',
    })
    .collect(() => (omegga.webserver?.started ? 1 : 0));

  registry
    .counter({
      name: 'omegga_uncaught_exceptions_total',
      help: 'Exceptions that reached the process uncaughtException handler',
    })
    .collect(() => getUncaughtExceptions());

  registry
    .counter({
      name: 'omegga_unhandled_rejections_total',
      help: 'Promise rejections that reached the process handler',
    })
    .collect(() => getUnhandledRejections());

  // labelled by every plugin that has errored, including ones since unloaded,
  // so a crash loop stays visible after the plugin is gone
  registry
    .counter({
      name: 'omegga_plugin_errors_total',
      help: 'Plugin load, unload, and runtime failures',
      labels: ['plugin'],
    })
    .collect((): ScalarSample[] =>
      getErroredPlugins().map(plugin => ({
        labels: { plugin },
        value: getPluginErrors(plugin),
      })),
    );

  // ------------------------------------------------------------- plugins

  const plugins = () => omegga.pluginLoader?.plugins ?? [];

  registry
    .gauge({
      name: 'omegga_plugins_scanned',
      help: 'Number of plugins found on disk',
    })
    .collect(() => plugins().length);

  registry
    .gauge({
      name: 'omegga_plugins_enabled',
      help: 'Number of plugins that are enabled',
    })
    .collect(() => plugins().filter(p => p.isEnabled()).length);

  registry
    .gauge({
      name: 'omegga_plugins_loaded',
      help: 'Number of plugins currently loaded',
    })
    .collect(() => plugins().filter(p => p.isLoaded()).length);

  registry
    .gauge({
      name: 'omegga_plugin_info',
      help: 'Installed plugins and their format, always 1',
      labels: ['plugin', 'format'],
    })
    .collect((): ScalarSample[] =>
      plugins().map(p => ({
        labels: {
          plugin: p.getName(),
          format: (
            p.constructor as unknown as { getFormat(): string }
          ).getFormat(),
        },
        value: 1,
      })),
    );

  registry
    .gauge({
      name: 'omegga_plugin_loaded',
      help: 'Whether each plugin is currently loaded',
      labels: ['plugin'],
    })
    .collect((): ScalarSample[] =>
      plugins().map(p => ({
        labels: { plugin: p.getName() },
        value: p.isLoaded() ? 1 : 0,
      })),
    );

  registry
    .gauge({
      name: 'omegga_plugin_enabled',
      help: 'Whether each plugin is enabled',
      labels: ['plugin'],
    })
    .collect((): ScalarSample[] =>
      plugins().map(p => ({
        labels: { plugin: p.getName() },
        value: p.isEnabled() ? 1 : 0,
      })),
    );

  // ---------------------------------------------------------------- host

  // These are sampled by the web UI heartbeat, which owns the cpu/net deltas.
  // Reading the last sample rather than taking a new one keeps a scrape from
  // corrupting those deltas. It also means they are absent, rather than wrong,
  // when the web UI is disabled.
  const util = () => getLastUtilization().current;

  registry
    .gauge({
      name: 'omegga_host_cpu_ratio',
      help: 'Host CPU utilization, 0-1, as sampled by the web UI heartbeat',
    })
    .collect(() => {
      const current = util();
      return current ? current.cpu / 100 : [];
    });

  const hostGauge = (
    name: string,
    help: string,
    read: (u: NonNullable<ReturnType<typeof util>>) => number,
  ) =>
    registry.gauge({ name, help }).collect(() => {
      const current = util();
      return current ? read(current) : [];
    });

  hostGauge(
    'omegga_host_memory_used_bytes',
    'Host memory in use',
    u => u.mem.used,
  );
  hostGauge(
    'omegga_host_memory_total_bytes',
    'Host memory installed',
    u => u.mem.total,
  );
  hostGauge(
    'omegga_host_disk_used_bytes',
    'Disk space used on the omegga filesystem',
    u => u.disk.used,
  );
  hostGauge(
    'omegga_host_disk_total_bytes',
    'Disk space total on the omegga filesystem',
    u => u.disk.total,
  );

  // network is read straight from /proc rather than from the heartbeat sample:
  // it is a plain cumulative read with no delta state to disturb, and raw
  // counters are what prometheus wants (it can compute the rate itself, at the
  // scrape interval, rather than inheriting the heartbeat's 60s window)
  registry
    .counter({
      name: 'omegga_host_network_receive_bytes_total',
      help: 'Bytes received across all non-loopback interfaces',
    })
    .collect(() => (process.platform === 'linux' ? getNetworkBytes().rx : []));
  registry
    .counter({
      name: 'omegga_host_network_transmit_bytes_total',
      help: 'Bytes transmitted across all non-loopback interfaces',
    })
    .collect(() => (process.platform === 'linux' ? getNetworkBytes().tx : []));
}
