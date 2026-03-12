import Logger from '@/logger';
import { AutoRestartConfig, IServerStatus } from '@/plugin';
import soft from '@/softconfig';
import {
  clearLastSteamUpdateCheck,
  getLastSteamUpdateCheck,
  hasSteamUpdate,
  steamcmdDownloadGame,
} from '@/updater/steam';
import { readFileSync, statfsSync } from 'fs';
import os from 'os';
import { serverEvents } from './events';
import type Webserver from './index';
import type { IStoreAutoRestartConfig, SystemUtilization } from './types';

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

function getNetworkBytes(): { rx: number; tx: number } {
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

function pushHistory(util: SystemUtilization) {
  utilizationHistory.push(util);
  if (utilizationHistory.length > UTILIZATION_HISTORY_LEN) {
    utilizationHistory.shift();
  }
}

function collectUtilization(omeggaPath: string): SystemUtilization {
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
  return {
    cpu,
    mem: { used: totalMem - freeMem, total: totalMem },
    disk,
    net: { rxSec, txSec },
  };
}

const error = (...args: any[]) => Logger.error(...args);
let lastRestart = 0;

const sleep = t => new Promise(resolve => setTimeout(resolve, t));

export default function (server: Webserver) {
  const { database, omegga } = server;

  // Prime CPU and network counters so the first real snapshot reflects a
  // short interval rather than computing a delta from zero (host uptime).
  getCpuUsage();
  getNetworkBytes();

  // Collect initial utilization snapshot so queries return data immediately
  lastUtilization = collectUtilization(omegga.path);
  pushHistory(lastUtilization);

  // server status is checked every minute
  clearInterval(server.serverStatusInterval);
  // heartbeat happens every 60 seconds
  let empties = 0;

  // last heartbeat hour
  let lastHour = -1;
  // players that have joined in the last hour
  let hourlyPlayers: string[] = [];

  const exitOnStop = () => {
    if (omegga.stopping || !omegga.started)
      throw new Error('Omegga is already closing');
  };

  async function restartServer(
    config: IStoreAutoRestartConfig,
    update?: boolean,
  ) {
    lastRestart = Date.now();
    const iconfig: AutoRestartConfig = {
      players: config.playersEnabled,
      announcement: config.announcementEnabled,
      saveWorld: config.saveWorld,
    };
    omegga.emit('autorestart', iconfig);
    await sleep(1000);
    exitOnStop();

    const action = update ? 'Updating' : 'Restarting';

    if (config.announcementEnabled) {
      database.addChatLog('server', {}, action + ' in 30 seconds...');
      Logger.logp(action + ' in 30 seconds...');
      const announce = (t: number) =>
        omegga.broadcast(
          `<size="20">${action} in <b><color="ffffbb">${t} second${
            t !== 1 ? 's' : ''
          }</></></>`,
        );
      announce(30);
      await sleep(15000);
      announce(15);
      await sleep(10000);
      announce(5);
      await sleep(1000);
      announce(4);
      await sleep(1000);
      announce(3);
      await sleep(1000);
      announce(2);
      await sleep(1000);
      announce(1);
      await sleep(1000);
    }

    exitOnStop();

    await omegga.saveServer(iconfig);

    Logger.logp(action + '...');
    database.addChatLog('server', {}, action + ' server...');
    omegga.once('mapchange', () => {
      omegga.restoreServer();
    });

    if (
      update &&
      omegga.config.__STEAM &&
      !omegga.config.server?.steambetaPassword
    ) {
      Logger.logp('Stopping server for auto-update...');
      await omegga.stop();
      Logger.logp('Downloading update...');
      try {
        steamcmdDownloadGame({
          steambeta: omegga.config.server?.steambeta,
        });
      } catch (e) {
        error('An error occurred while downloading the update:', e);
      }
      Logger.logp('Starting server after update...');
      await omegga.start();
    } else {
      await omegga.restartServer();
    }
  }

  async function checkAutoRestart(status: IServerStatus) {
    const now = new Date();
    const currHour = now.getHours();
    const currMinute = now.getMinutes();

    /// skip restart check if we sent restart command within 5 minutes
    if (lastRestart > now.getTime() - 5 * 60 * 1000) {
      Logger.verbose('Skipping autorestart');
      return;
    }

    const config = await database.getAutoRestartConfig();
    Logger.verbose('Autorestart check', config);

    const uptimeMinutes = Math.floor(status.time / 1000 / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);

    if (config.maxUptimeEnabled && uptimeHours >= config.maxUptime) {
      Logger.verbose('Restarting due to max uptime');
      return await restartServer(config);
    }

    if (
      config.emptyUptimeEnabled &&
      uptimeHours >= config.emptyUptime &&
      status.players.length === 0
    ) {
      Logger.verbose('Restarting due to max empty uptime');
      return await restartServer(config);
    }

    if (
      config.dailyHourEnabled &&
      currHour === config.dailyHour &&
      uptimeMinutes > currMinute
    ) {
      Logger.verbose('Restarting due to daily schedule');
      return await restartServer(config);
    }

    // Cannot auto-update on steam betas with passwords
    const lastCheck = getLastSteamUpdateCheck();
    if (
      omegga.config.__STEAM &&
      config.autoUpdateEnabled &&
      !omegga.config.server?.steambetaPassword
    ) {
      const now = Date.now();
      if (
        // If there is no update
        !lastCheck.available &&
        // And the last update was too recent
        now - lastCheck.attempt < config.autoUpdateIntervalMins * 60 * 1000
      ) {
        // Skip this check
        Logger.verbose(
          `Skipping auto update check, last check was ${Math.floor(
            (now - lastCheck.attempt) / 1000 / 60,
          )} minutes ago`,
        );
        return;
      }
      Logger.verbose('Checking for steam update');
      const hasUpdate = await hasSteamUpdate(omegga.config.server?.steambeta);
      if (hasUpdate) {
        clearLastSteamUpdateCheck();
        return await restartServer(config, true);
      }
      Logger.verbose('No steam update found');
    }
  }

  server.lastReportedStatus = null;
  server.serverStatusInterval = setInterval(async () => {
    if (!omegga.started) return;
    try {
      // get the server status
      const status = await omegga.getServerStatus();
      if (!status) return;

      try {
        await checkAutoRestart(status);
      } catch (err) {
        error('Error in autorestart check', err);
      }

      // get players by id
      const players = status.players.map(p => p.id);

      // send the unaltered status to the frontend via serverEvents
      server.lastReportedStatus = status;
      serverEvents.emit('heartbeat', status);

      // collect and emit system utilization metrics
      const utilization = collectUtilization(omegga.path);
      lastUtilization = utilization;
      pushHistory(utilization);
      serverEvents.emit('utilization', utilization);
      try {
        omegga.emit('metrics:heartbeat', status);
      } catch (e) {
        // prevent the omegga callback handlers from crashing this
        error('Error in heartbeat emit', e);
      }

      // stop recording metrics after 3 empty server statuses
      if (
        players.length === 0 &&
        ++empties > soft.METRIC_EMPTIES_BEFORE_PAUSE
      ) {
        return;
      }

      const now = new Date();
      const hour = now.getUTCHours();
      // check if it's a new hour (for punchcard unique player tracking)
      if (hour !== lastHour) {
        lastHour = hour;
        hourlyPlayers = [];
      }

      // find all the players unique to this hour
      const newPlayers = players.filter(p => !hourlyPlayers.includes(p));
      if (newPlayers.length > 0) {
        // update the punchcard
        await database.updatePlayerPunchcard(newPlayers.length);
        // mark those players as previously joined players
        hourlyPlayers.push(...newPlayers);
      }

      // server is not empty, reset the counter
      empties = 0;

      const data = {
        // number of bricks
        bricks: status.bricks,
        // unique players by id
        players: players.filter((p, i) => players.indexOf(p) === i),
        // addresses by player id
        ips: Object.fromEntries(status.players.map(p => [p.id, p.address])),
      };

      // hand the server status off to the database
      await database.addHeartbeat(data);
    } catch (e) {
      // probably an issue getting server status
      error('Server Not Responding...');
    }
  }, soft.METRIC_HEARTBEAT_INTERVAL);

  // chat events
  omegga.on('chat', async (name, message) => {
    const p = omegga.getPlayer(name);
    const user = {
      id: p.id,
      name,
      displayName: p.displayName,
      color: p.getNameColor(),
    };

    // tell web users about a chat message
    serverEvents.emit('chat', await database.addChatLog('msg', user, message));
  });

  // player leave events
  omegga.on('leave', async ({ id, name, displayName }) => {
    // tell web users a player left
    serverEvents.emit(
      'chat',
      await database.addChatLog('leave', { id, name, displayName }),
    );
  });

  // player join events
  omegga.on('join', async ({ id, name, displayName }) => {
    // add the visit to the database
    const isFirst = await database.addVisit({ id, name, displayName });

    // tell web users a player joined (and if it's their first time joining)
    serverEvents.emit(
      'chat',
      await database.addChatLog('join', {
        id,
        name,
        displayName,
        ...(isFirst ? { isFirst } : {}),
      }),
    );
  });

  // tell web users plugin status
  omegga.on(
    'plugin:status',
    (
      shortPath: string,
      info: { name: string; isLoaded: boolean; isEnabled: boolean },
    ) => {
      serverEvents.emit('plugin', { shortPath, ...info });
    },
  );

  // server status events
  omegga.on('start', () =>
    serverEvents.emit('serverStatus', {
      started: true,
      starting: false,
      stopping: false,
    }),
  );
  omegga.on('server:starting', () =>
    serverEvents.emit('serverStatus', {
      started: false,
      starting: true,
      stopping: false,
    }),
  );
  omegga.on('mapchange', () =>
    serverEvents.emit('serverStatus', {
      started: true,
      starting: false,
      stopping: false,
    }),
  );
  omegga.on('server:stopped', () =>
    serverEvents.emit('serverStatus', {
      started: false,
      starting: false,
      stopping: false,
    }),
  );
  omegga.on('server:stopping', () =>
    serverEvents.emit('serverStatus', {
      started: true,
      starting: false,
      stopping: true,
    }),
  );
}
