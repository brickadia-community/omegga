/*
  Process-level metrics: omegga's own node process (under the standard
  `process_`/`nodejs_` names, so off-the-shelf dashboards work) and the
  Brickadia child process read straight out of /proc.

  A host-level exporter can see the machine but can't attribute usage to the
  game, which is why the child process is read here.
*/

import { readFileSync } from 'node:fs';
import os from 'node:os';
import { type Registry } from '../registry';

const CLOCK_TICKS = 100; // _SC_CLK_TCK is 100 on every platform we run on
const PAGE_SIZE = 4096;

/** cpu seconds and resident bytes for a pid, or null when unreadable */
export function readProcessStats(
  pid: number,
): { cpuSeconds: number; residentBytes: number; startTime: number } | null {
  if (process.platform !== 'linux') return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    // the comm field can contain spaces and parens, so fields are counted from
    // after the final ')' rather than by splitting the whole line
    const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    // after comm and state, field indexes are shifted by 3 from the man page
    const utime = Number(fields[11]);
    const stime = Number(fields[12]);
    const starttime = Number(fields[19]);
    const rss = Number(fields[21]);
    if ([utime, stime, starttime, rss].some(Number.isNaN)) return null;
    return {
      cpuSeconds: (utime + stime) / CLOCK_TICKS,
      residentBytes: rss * PAGE_SIZE,
      // /proc/<pid>/stat reports start time relative to boot
      startTime: Date.now() / 1000 - os.uptime() + starttime / CLOCK_TICKS,
    };
  } catch {
    return null;
  }
}

function countOpenFds(pid: number): number | null {
  if (process.platform !== 'linux') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('node:fs').readdirSync(`/proc/${pid}/fd`).length;
  } catch {
    return null;
  }
}

/**
 * Register the standard node process metrics under their conventional
 * unprefixed names, so existing Node dashboards and alerts work unchanged.
 */
export function registerDefaultMetrics(registry: Registry): void {
  // a `_total` suffix must be a counter, not a gauge. process.cpuUsage() is
  // already cumulative, so the collector mirrors it rather than incrementing
  registry
    .counter({
      name: 'process_cpu_seconds_total',
      help: 'Total user and system CPU time spent in seconds',
    })
    .collect(() => {
      const usage = process.cpuUsage();
      return (usage.user + usage.system) / 1e6;
    });

  registry
    .gauge({
      name: 'process_resident_memory_bytes',
      help: 'Resident memory size in bytes',
    })
    .collect(() => process.memoryUsage.rss());

  registry
    .gauge({
      name: 'process_start_time_seconds',
      help: 'Start time of the process since unix epoch in seconds',
    })
    .collect(() => (Date.now() - process.uptime() * 1000) / 1000);

  registry
    .gauge({
      name: 'nodejs_heap_size_used_bytes',
      help: 'Process heap size used, in bytes',
    })
    .collect(() => process.memoryUsage().heapUsed);

  registry
    .gauge({
      name: 'nodejs_heap_size_total_bytes',
      help: 'Process heap size total, in bytes',
    })
    .collect(() => process.memoryUsage().heapTotal);

  registry
    .gauge({
      name: 'nodejs_external_memory_bytes',
      help: 'Node.js external memory size in bytes',
    })
    .collect(() => process.memoryUsage().external);

  const versionInfo = registry.gauge({
    name: 'nodejs_version_info',
    help: 'Node.js version info',
    labels: ['version'],
  });
  versionInfo.set({ version: process.version }, 1);

  // sampled continuously rather than at scrape time: measuring lag inside a
  // scrape would only ever measure the scrape itself
  let lagSeconds = 0;
  let last = process.hrtime.bigint();
  const timer = setInterval(() => {
    const now = process.hrtime.bigint();
    // the timer is scheduled for 500ms; anything beyond that is lag
    lagSeconds = Math.max(0, Number(now - last) / 1e9 - 0.5);
    last = now;
  }, 500);
  // never hold the process open for the sake of a metric
  timer.unref();

  registry
    .gauge({
      name: 'nodejs_eventloop_lag_seconds',
      help: 'Lag of the event loop in seconds',
    })
    .collect(() => lagSeconds);
}

/**
 * Register metrics for the Brickadia child process. `getPid` is polled at
 * scrape time because the child is replaced on every restart.
 */
export function registerChildProcessMetrics(
  registry: Registry,
  getPid: () => number | null,
): void {
  // /proc is linux-only, and so is the dedicated server
  if (process.platform !== 'linux') return;

  const read = () => {
    const pid = getPid();
    return pid == null ? null : readProcessStats(pid);
  };

  registry
    .counter({
      name: 'brickadia_process_cpu_seconds_total',
      help: 'Total user and system CPU time consumed by the Brickadia server',
    })
    // /proc owns the cumulative value. it resets when the game restarts, which
    // prometheus detects and handles as a counter reset
    .collect(() => read()?.cpuSeconds ?? []);

  registry
    .gauge({
      name: 'brickadia_process_resident_memory_bytes',
      help: 'Resident memory size of the Brickadia server in bytes',
    })
    .collect(() => read()?.residentBytes ?? []);

  registry
    .gauge({
      name: 'brickadia_process_start_time_seconds',
      help: 'Start time of the Brickadia server since unix epoch in seconds',
    })
    .collect(() => read()?.startTime ?? []);

  registry
    .gauge({
      name: 'brickadia_process_open_fds',
      help: 'Number of open file descriptors held by the Brickadia server',
    })
    .collect(() => {
      const pid = getPid();
      if (pid == null) return [];
      return countOpenFds(pid) ?? [];
    });
}
