import type { IMetricsConfig } from '@config/types';
import type Omegga from '@omegga/server';
import EventEmitter from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import MetricsServer from './index';

type Ban = { created: string; expires: string; bannerId?: string };

/** Brickadia writes times as `YYYY.MM.DD-HH.MM.SS` */
const brTime = (ms: number) =>
  new Date(ms)
    .toISOString()
    .replace(/-/g, '.')
    .replace('T', '-')
    .replace(/:/g, '.')
    .slice(0, 19);

function fakeOmegga(banList: Record<string, Ban> | null): Omegga {
  const omegga = new EventEmitter() as unknown as Omegga & {
    [key: string]: unknown;
  };
  Object.assign(omegga, {
    started: true,
    starting: false,
    stopping: false,
    crashDetected: false,
    currentMap: 'Plate',
    version: 12345,
    players: [],
    path: process.cwd(),
    gamePid: null,
    config: { server: { port: 7777 } },
    getServerStatus: async () => null,
    getBanList: () => (banList ? { banList } : undefined),
  });
  return omegga as Omegga;
}

const servers: MetricsServer[] = [];

function scrape(
  banList: Record<string, Ban> | null,
  config: Partial<IMetricsConfig> = {},
) {
  const server = new MetricsServer(fakeOmegga(banList), {
    enabled: true,
    port: 0,
    bind: '127.0.0.1',
    ...config,
  });
  servers.push(server);
  server.setup();
  return server.collect();
}

/** the value of an unlabelled metric, or null when it exported no sample */
function value(body: string, name: string): number | null {
  const match = body.match(new RegExp(`^${name} (\\S+)$`, 'm'));
  return match ? Number(match[1]) : null;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => s.stop()));
});

describe('ban metrics', () => {
  const now = Date.now();
  const hour = 3600_000;

  it('counts permanent and unexpired bans as active', async () => {
    const body = await scrape({
      permanent: {
        // a ban expiring no later than it was issued never lifts
        created: brTime(now - 5 * hour),
        expires: brTime(now - 5 * hour),
      },
      timed: {
        created: brTime(now - hour),
        expires: brTime(now + hour),
      },
      expired: {
        created: brTime(now - 5 * hour),
        expires: brTime(now - hour),
      },
    });

    expect(value(body, 'brickadia_bans_active')).toBe(2);
    expect(value(body, 'brickadia_bans_listed')).toBe(3);
  });

  it('reports zero for an empty ban list rather than going absent', async () => {
    const body = await scrape({});
    expect(value(body, 'brickadia_bans_active')).toBe(0);
    expect(value(body, 'brickadia_bans_listed')).toBe(0);
  });

  it('omits the gauges when there is no ban list to read', async () => {
    // a server that has never been started has no BanList.json, and reporting
    // zero bans there would be a number nobody measured
    const body = await scrape(null);
    expect(value(body, 'brickadia_bans_active')).toBeNull();
    expect(value(body, 'brickadia_bans_listed')).toBeNull();
    // the family is still declared, and the rest of the scrape comes back
    expect(body).toContain('# TYPE brickadia_bans_active gauge');
    expect(body).toMatch(/^brickadia_up /m);
  });
});
