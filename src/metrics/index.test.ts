import { type IMetricsConfig } from '@config/types';
import type Omegga from '@omegga/server';
import EventEmitter from 'node:events';
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import MetricsServer from './index';
import { CONTENT_TYPE } from './render';

/** the slice of Omegga the collectors touch */
function fakeOmegga(): Omegga {
  const omegga = new EventEmitter() as unknown as Omegga & {
    [key: string]: unknown;
  };
  Object.assign(omegga, {
    started: false,
    starting: false,
    stopping: false,
    crashDetected: false,
    currentMap: 'Plate',
    version: 12345,
    players: [],
    path: process.cwd(),
    gamePid: null,
    config: { server: { port: 7777 } },
    webserver: undefined,
    pluginLoader: undefined,
    getServerStatus: async () => null,
  });
  return omegga as Omegga;
}

const servers: MetricsServer[] = [];

function makeServer(config: Partial<IMetricsConfig> = {}) {
  const server = new MetricsServer(fakeOmegga(), {
    enabled: true,
    // port 0 asks the OS for a free one, so tests never collide
    port: 0,
    bind: '127.0.0.1',
    ...config,
  });
  servers.push(server);
  return server;
}

/** start the server and return the port the OS actually handed out */
async function listen(server: MetricsServer): Promise<number> {
  await server.start();
  const address = (
    server as unknown as { server: { address(): { port: number } } }
  ).server.address();
  return address.port;
}

/**
 * One connection per request, rather than fetch's pooled keep-alive sockets.
 * Reusing a pooled socket races the server closing it: the next request is
 * written onto a connection that is already being torn down, and no response
 * ever comes back. It surfaces intermittently as
 * `UND_ERR_SOCKET: other side closed`. `agent: false` opens and closes a
 * socket per request, so there is nothing to reuse and nothing to race.
 */
function request(
  url: string,
  options: { method?: string; headers?: Record<string, string> } = {},
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      {
        agent: false,
        method: options.method ?? 'GET',
        headers: options.headers,
      },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => (body += chunk));
        res.on('error', reject);
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(s => s.stop()));
});

describe('MetricsServer.collect', () => {
  it('renders the built-in metrics', async () => {
    const server = makeServer();
    server.setup();
    const body = await server.collect();
    expect(body).toContain('# TYPE omegga_build_info gauge');
    expect(body).toContain('omegga_up 1');
    expect(body).toContain('# TYPE brickadia_server_state gauge');
    expect(body).toContain('# TYPE brickadia_players_joined_total counter');
  });

  it('reports exactly one active lifecycle state', async () => {
    const server = makeServer();
    server.setup();
    const body = await server.collect();
    const active = [...body.matchAll(/^brickadia_server_state\{.*\} 1$/gm)];
    expect(active).toHaveLength(1);
    expect(active[0][0]).toContain('state="stopped"');
  });

  it('counts game events', async () => {
    const server = makeServer();
    server.setup();
    const omegga = server.omegga;
    omegga.emit('chat', 'someone', 'hello');
    omegga.emit('chat', 'someone', 'again');
    omegga.emit('join', { id: 'a' });
    omegga.emit('join', { id: 'a' });
    omegga.emit('join', { id: 'b' });
    const body = await server.collect();
    expect(body).toContain('brickadia_chat_messages_total 2');
    expect(body).toContain('brickadia_players_joined_total 3');
    // 'a' joined twice but is one unique player
    expect(body).toContain('brickadia_players_joined_unique_total 2');
  });

  it('observes a session length when a player leaves', async () => {
    const server = makeServer();
    server.setup();
    server.omegga.emit('join', { id: 'a' });
    server.omegga.emit('leave', { id: 'a' });
    const body = await server.collect();
    expect(body).toContain('brickadia_player_session_seconds_count 1');
  });

  it('omits world stats until a status has been seen', async () => {
    // a metric that is absent is better than one reporting a made-up zero
    const server = makeServer();
    server.setup();
    const body = await server.collect();
    expect(body).toContain('# TYPE brickadia_bricks_count gauge');
    expect(body).not.toMatch(/^brickadia_bricks_count /m);
  });

  it('exports world stats once a heartbeat supplies a status', async () => {
    const server = makeServer();
    server.setup();
    server.omegga.emit('metrics:heartbeat', {
      serverName: 'test',
      description: '',
      bricks: 100,
      components: 50,
      time: 60000,
      maxPlayers: 20,
      stats: { bricks: 100, components: 50 },
      players: [],
    });
    const body = await server.collect();
    expect(body).toContain('brickadia_bricks_count 100');
    expect(body).toContain('brickadia_components_count 50');
    expect(body).toContain('brickadia_uptime_seconds 60');
    expect(body).toContain('brickadia_players_max 20');
  });

  it('exports a stat the game only started reporting later', async () => {
    const server = makeServer();
    server.setup();
    server.omegga.emit('metrics:heartbeat', {
      serverName: 'test',
      description: '',
      bricks: 1,
      components: 1,
      time: 0,
      stats: { bricks: 1, components: 1, entities: 12, wire_graphs: 3 },
      players: [],
    });
    const body = await server.collect();
    expect(body).toContain('brickadia_entities_count 12');
    // a stat with no dedicated gauge gets one created on first sight
    expect(body).toContain('brickadia_wire_graphs_count 3');
  });

  it('includes plugin metrics', async () => {
    const server = makeServer();
    server.setup();
    server.plugins.facade('My Plugin').counter({ name: 'runs_total' }).inc(4);
    expect(await server.collect()).toContain(
      'omegga_plugin_my_plugin_runs_total{plugin="My Plugin"} 4',
    );
  });

  it('omits plugin metrics when plugins are disabled', async () => {
    const server = makeServer({ plugins: false });
    server.setup();
    server.plugins.facade('My Plugin').counter({ name: 'runs_total' }).inc(4);
    expect(await server.collect()).not.toContain('omegga_plugin_my_plugin');
  });

  it('omits default process metrics when they are turned off', async () => {
    const server = makeServer({ defaultMetrics: false });
    server.setup();
    expect(await server.collect()).not.toContain('nodejs_heap_size_used_bytes');
  });
});

describe('MetricsServer http', () => {
  it('serves the exposition format on the metrics path', async () => {
    const server = makeServer();
    const port = await listen(server);
    const res = await request(`http://127.0.0.1:${port}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(CONTENT_TYPE);
    expect(res.body).toContain('omegga_up 1');
  });

  it('answers HEAD with headers and no body', async () => {
    const server = makeServer();
    const port = await listen(server);
    const res = await request(`http://127.0.0.1:${port}/metrics`, {
      method: 'HEAD',
    });
    expect(res.status).toBe(200);
    expect(res.body).toBe('');
  });

  it('ignores the query string when routing', async () => {
    const server = makeServer();
    const port = await listen(server);
    const res = await request(`http://127.0.0.1:${port}/metrics?collect=all`);
    expect(res.status).toBe(200);
  });

  it('404s any other path or method', async () => {
    const server = makeServer();
    const port = await listen(server);
    expect((await request(`http://127.0.0.1:${port}/`)).status).toBe(404);
    expect((await request(`http://127.0.0.1:${port}/metrics/x`)).status).toBe(
      404,
    );
    const post = await request(`http://127.0.0.1:${port}/metrics`, {
      method: 'POST',
    });
    expect(post.status).toBe(404);
  });

  it('serves on a custom path', async () => {
    const server = makeServer({ path: '/internal/metrics' });
    const port = await listen(server);
    expect((await request(`http://127.0.0.1:${port}/metrics`)).status).toBe(
      404,
    );
    expect(
      (await request(`http://127.0.0.1:${port}/internal/metrics`)).status,
    ).toBe(200);
  });

  it('requires the bearer token when one is configured', async () => {
    const server = makeServer({ token: 'sekrit' });
    const port = await listen(server);
    const url = `http://127.0.0.1:${port}/metrics`;

    const noAuth = await request(url);
    expect(noAuth.status).toBe(401);
    expect(noAuth.headers['www-authenticate']).toBe('Bearer');

    const wrong = await request(url, {
      headers: { authorization: 'Bearer nope!!' },
    });
    expect(wrong.status).toBe(401);

    const right = await request(url, {
      headers: { authorization: 'Bearer sekrit' },
    });
    expect(right.status).toBe(200);
  });

  it('survives a port already in use instead of throwing', async () => {
    // a metrics port clash must never stop a game server from booting
    const first = makeServer();
    const port = await listen(first);
    const second = makeServer({ port });
    await expect(second.start()).resolves.toBeUndefined();
    expect(second.started).toBe(false);
  });

  it('stops listening after stop()', async () => {
    const server = makeServer();
    const port = await listen(server);
    await server.stop();
    expect(server.started).toBe(false);
    await expect(request(`http://127.0.0.1:${port}/metrics`)).rejects.toThrow();
  });
});

describe('exposition conventions', () => {
  it('types every _total metric as a counter', async () => {
    // a `_total` suffix on a gauge breaks rate() for anyone using it
    const server = makeServer();
    server.setup();
    const body = await server.collect();
    const wrong = [...body.matchAll(/^# TYPE (\S+_total) (\S+)$/gm)].filter(
      m => m[2] !== 'counter',
    );
    expect(wrong.map(m => m[1])).toEqual([]);
  });

  it('declares a TYPE for every metric it emits a sample for', async () => {
    const server = makeServer();
    server.setup();
    server.plugins.facade('p').gauge({ name: 'x' }).set(1);
    const body = await server.collect();
    const declared = new Set(
      [...body.matchAll(/^# TYPE (\S+) /gm)].map(m => m[1]),
    );
    const sampled = [...body.matchAll(/^([a-zA-Z_:][a-zA-Z0-9_:]*)[{ ]/gm)].map(
      m => m[1],
    );
    for (const name of sampled) {
      // histograms emit _bucket/_sum/_count under the family name
      const family = name.replace(/_(bucket|sum|count)$/, '');
      expect(declared.has(name) || declared.has(family)).toBe(true);
    }
  });

  it('emits families in sorted order, plugins included', async () => {
    const server = makeServer();
    server.setup();
    server.plugins.facade('p').gauge({ name: 'x' }).set(1);
    const names = [
      ...(await server.collect()).matchAll(/^# TYPE (\S+) /gm),
    ].map(m => m[1]);
    expect(names).toEqual([...names].sort());
  });
});

describe('cold start', () => {
  it('reports event counters as zero before anything has happened', async () => {
    // an absent series reads as "no data" in a dashboard, not as "quiet"
    const server = makeServer();
    server.setup();
    const body = await server.collect();
    for (const name of [
      'brickadia_players_joined_total',
      'brickadia_players_left_total',
      'brickadia_chat_messages_total',
      'brickadia_crashes_total',
      'brickadia_log_lines_total',
      'brickadia_stderr_lines_total',
    ]) {
      expect(body).toContain(`${name} 0`);
    }
  });
});

describe('playtime', () => {
  /** pull one numeric sample out of a rendered scrape */
  const value = (body: string, name: string) =>
    Number(body.match(new RegExp(`^${name} (\\S+)$`, 'm'))?.[1]);

  it('accrues while a player is still connected', async () => {
    const server = makeServer();
    server.setup();
    server.omegga.emit('join', { id: 'a' });

    const first = value(
      await server.collect(),
      'brickadia_player_playtime_seconds_total',
    );
    await new Promise(r => setTimeout(r, 25));
    const second = value(
      await server.collect(),
      'brickadia_player_playtime_seconds_total',
    );
    expect(second).toBeGreaterThan(first);
  });

  it('does not go backwards when a player leaves', async () => {
    // a counter that drops breaks rate(); leaving must bank the time, not lose it
    const server = makeServer();
    server.setup();
    server.omegga.emit('join', { id: 'a' });
    await new Promise(r => setTimeout(r, 25));

    const before = value(
      await server.collect(),
      'brickadia_player_playtime_seconds_total',
    );
    server.omegga.emit('leave', { id: 'a' });
    const after = value(
      await server.collect(),
      'brickadia_player_playtime_seconds_total',
    );
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('does not go backwards when the server stops with players online', async () => {
    // 'server:stopped' clears the join table without emitting 'leave'
    const server = makeServer();
    server.setup();
    server.omegga.emit('join', { id: 'a' });
    server.omegga.emit('join', { id: 'b' });
    await new Promise(r => setTimeout(r, 25));

    const before = value(
      await server.collect(),
      'brickadia_player_playtime_seconds_total',
    );
    server.omegga.emit('server:stopped');
    const after = value(
      await server.collect(),
      'brickadia_player_playtime_seconds_total',
    );
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it('counts each connected player separately', async () => {
    const one = makeServer();
    one.setup();
    one.omegga.emit('join', { id: 'a' });

    const two = makeServer();
    two.setup();
    two.omegga.emit('join', { id: 'a' });
    two.omegga.emit('join', { id: 'b' });
    two.omegga.emit('join', { id: 'c' });

    await new Promise(r => setTimeout(r, 30));
    const single = value(
      await one.collect(),
      'brickadia_player_playtime_seconds_total',
    );
    const triple = value(
      await two.collect(),
      'brickadia_player_playtime_seconds_total',
    );
    expect(triple).toBeGreaterThan(single * 2);
  });
});

describe('label cardinality safety', () => {
  /** every label name that appears anywhere in a scrape */
  const labelNames = (body: string) => {
    const names = new Set<string>();
    for (const m of body.matchAll(/^[a-zA-Z_:][a-zA-Z0-9_:]*\{([^}]*)\}/gm)) {
      for (const pair of m[1].split(',')) {
        const name = pair.split('=')[0].trim();
        if (name) names.add(name);
      }
    }
    return names;
  };

  it('never labels a metric with a player identity', async () => {
    // Prometheus keeps every label combination it has ever scraped for the
    // whole retention window, so one series per player is unbounded growth:
    // every visitor ever, plus a fresh series each time one is renamed.
    const server = makeServer();
    server.setup();
    server.omegga.emit('metrics:heartbeat', {
      serverName: 'test',
      description: '',
      bricks: 1,
      components: 1,
      time: 1000,
      stats: { bricks: 1, components: 1 },
      players: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          name: 'TestPlayer',
          ping: 100,
          time: 1000,
          roles: [],
          address: '12.3.4.5',
        },
      ],
    });

    const body = await server.collect();
    for (const banned of ['player', 'id', 'name', 'address', 'role']) {
      expect(labelNames(body).has(banned)).toBe(false);
    }
    // the player's identity must not leak through a label value either
    expect(body).not.toContain('TestPlayer');
    expect(body).not.toContain('00000000-0000-4000-8000-000000000001');
    expect(body).not.toContain('12.3.4.5');
    // the aggregate ping histogram still carries the signal
    expect(body).toContain('brickadia_player_ping_seconds_count 1');
  });

  it('keeps every built-in label to a bounded set of values', async () => {
    const server = makeServer();
    server.setup();
    const found = labelNames(await server.collect());
    // plugin is bounded by installed plugins, state/le/version by the code
    const allowed = new Set([
      'plugin',
      'state',
      'le',
      'version',
      'server_name',
      'map',
      'steambeta',
      'port',
      'node',
      'platform',
      'container',
    ]);
    expect([...found].filter(n => !allowed.has(n))).toEqual([]);
  });
});
