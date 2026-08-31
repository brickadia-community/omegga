/*
  Host machine utilization: cpu, memory, disk, and network.

  This lives here rather than in the webserver because `getCpuUsage` and
  `getNetworkBytes` are delta measurements over module-level state. Two
  independent callers sampling them would each see only the slice since the
  other's last call, silently halving both readings - so there is exactly one
  owner, and both the web UI heartbeat and the metrics endpoint read through it.
*/

import { readFileSync, statfsSync } from 'node:fs';
import os from 'node:os';

export interface SystemUtilization {
  /** whole percent, 0-100 */
  cpu: number;
  mem: { used: number; total: number };
  disk: { used: number; total: number };
  net: { rxSec: number; txSec: number };
}

let prevCpuIdle = 0;
let prevCpuTotal = 0;
let prevNetRx = 0;
let prevNetTx = 0;
let prevNetTime = 0;

function getCpuUsage(): number {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total +=
      cpu.times.user +
      cpu.times.nice +
      cpu.times.sys +
      cpu.times.irq +
      cpu.times.idle;
  }
  const dIdle = idle - prevCpuIdle;
  const dTotal = total - prevCpuTotal;
  prevCpuIdle = idle;
  prevCpuTotal = total;
  if (dTotal === 0) return 0;
  return Math.round((1 - dIdle / dTotal) * 100);
}

function getDiskUsage(path: string): { used: number; total: number } {
  try {
    const stat = statfsSync(path);
    const total = stat.blocks * stat.bsize;
    const free = stat.bfree * stat.bsize;
    return { used: total - free, total };
  } catch {
    return { used: 0, total: 1 };
  }
}

/** cumulative rx/tx bytes across every interface except loopback */
export function getNetworkBytes(): { rx: number; tx: number } {
  if (process.platform !== 'linux') return { rx: 0, tx: 0 };
  try {
    const data = readFileSync('/proc/net/dev', 'utf8');
    let rx = 0;
    let tx = 0;
    for (const line of data.split('\n').slice(2)) {
      const parts = line.trim().split(/\s+/);
      if (!parts[0] || parts[0] === 'lo:') continue;
      rx += Number(parts[1]) || 0;
      tx += Number(parts[9]) || 0;
    }
    return { rx, tx };
  } catch {
    return { rx: 0, tx: 0 };
  }
}

const UTILIZATION_HISTORY_LEN = 30;
let lastUtilization: SystemUtilization | null = null;
const utilizationHistory: SystemUtilization[] = [];

export function getLastUtilization(): {
  current: SystemUtilization | null;
  history: SystemUtilization[];
} {
  return { current: lastUtilization, history: utilizationHistory };
}

/**
 * Take a utilization sample, storing it as the latest and appending it to the
 * rolling history. Only the heartbeat calls this. The metrics endpoint reads
 * `getLastUtilization()` instead, so that scrapes never disturb the deltas.
 */
export function collectUtilization(omeggaPath: string): SystemUtilization {
  const cpu = getCpuUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const disk = getDiskUsage(omeggaPath);
  const net = getNetworkBytes();
  const now = Date.now();
  const dt = prevNetTime ? (now - prevNetTime) / 1000 : 1;
  const rxSec = prevNetTime ? Math.max(0, (net.rx - prevNetRx) / dt) : 0;
  const txSec = prevNetTime ? Math.max(0, (net.tx - prevNetTx) / dt) : 0;
  prevNetRx = net.rx;
  prevNetTx = net.tx;
  prevNetTime = now;

  lastUtilization = {
    cpu,
    mem: { used: totalMem - freeMem, total: totalMem },
    disk,
    net: { rxSec, txSec },
  };
  utilizationHistory.push(lastUtilization);
  if (utilizationHistory.length > UTILIZATION_HISTORY_LEN) {
    utilizationHistory.shift();
  }
  return lastUtilization;
}

/**
 * Prime the cpu and network counters so the first real sample reflects a short
 * interval rather than computing a delta against zero (i.e. host uptime).
 */
export function primeUtilization(omeggaPath: string): void {
  getCpuUsage();
  getNetworkBytes();
  collectUtilization(omeggaPath);
}
