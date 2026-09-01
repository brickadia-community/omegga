import EventEmitter from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import MetricsServer from './index';
import type Omegga from '@omegga/server';
import { type IServerStatus } from '@omegga/types';

const status = (): IServerStatus => ({
  serverName: 'Test Server',
  description: '',
  bricks: 1,
  components: 1,
  time: 1000,
  maxPlayers: 50,
  stats: { bricks: 1, components: 1 },
  players: [],
});

/** an omegga that is up and answering status commands */
function runningOmegga() {
  const o = Object.assign(new EventEmitter(), {
    started: true,
    starting: false,
    stopping: false,
    crashDetected: false,
    currentMap: 'Plate',
    version: 1,
    players: [],
    path: process.cwd(),
    gamePid: null,
    config: { server: { port: 7777 } },
    webserver: undefined,
    pluginLoader: { plugins: [] },
    getServerStatus: async () => status(),
  });
  return o as unknown as Omegga;
}

const servers: MetricsServer[] = [];
const make = (cfg = {}) => {
  const s = new MetricsServer(runningOmegga(), {
    enabled: true,
    port: 0,
    ...cfg,
  });
  servers.push(s);
  s.setup();
  return s;
};
afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => s.stop()));
});

const up = (body: string) => Number(body.match(/^brickadia_up (\S+)$/m)?.[1]);

describe('brickadia_up', () => {
  it('is 1 on the first scrape of a running server', async () => {
    expect(up(await make().collect())).toBe(1);
  });

  it('stays 1 across scrapes spaced wider than statusMaxAge', async () => {
    // Prometheus commonly scrapes every 30s or 60s. The cached status is
    // refreshed in the background during a scrape, so by the next scrape it is
    // always about one scrape-interval old. Tying `up` to that age meant any
    // interval past the threshold read as down on every single scrape.
    // 50ms stands in for statusMaxAge; the gaps below stand in for a scrape
    // interval wider than it, which is the normal case at 30s or 60s
    const server = make({ statusMaxAge: 0.05 });
    expect(up(await server.collect())).toBe(1);

    await new Promise(r => setTimeout(r, 150));
    expect(up(await server.collect())).toBe(1);
    await new Promise(r => setTimeout(r, 150));
    expect(up(await server.collect())).toBe(1);
  });

  it('is 0 while the server is still starting', async () => {
    const server = make();
    (
      server.omegga as unknown as { started: boolean; starting: boolean }
    ).started = false;
    (server.omegga as unknown as { starting: boolean }).starting = true;
    expect(up(await server.collect())).toBe(0);
  });

  it('is 0 once the server has stopped', async () => {
    const server = make();
    (server.omegga as unknown as { started: boolean }).started = false;
    expect(up(await server.collect())).toBe(0);
  });
});

describe('brickadia_status_responsive', () => {
  const responsive = (body: string) =>
    body.match(/^brickadia_status_responsive (\S+)$/m)?.[1];

  it('reports 1 while the game answers status polls', async () => {
    const server = make();
    expect(responsive(await server.collect())).toBe('1');
  });

  it('reports 0 when the game stops answering, without affecting up', async () => {
    // this is the signal `up` used to conflate: the process is alive but the
    // console is not answering
    const server = make({ statusMaxAge: 0 });
    await server.collect();
    (
      server.omegga as unknown as { getServerStatus: () => Promise<null> }
    ).getServerStatus = async () => null;
    await server.collect();
    const body = await server.collect();
    expect(responsive(body)).toBe('0');
    expect(up(body)).toBe(1);
  });

  it('is absent before any poll has been attempted', async () => {
    const server = make();
    (
      server.omegga as unknown as { started: boolean; starting: boolean }
    ).starting = true;
    expect(responsive(await server.collect())).toBeUndefined();
  });
});
