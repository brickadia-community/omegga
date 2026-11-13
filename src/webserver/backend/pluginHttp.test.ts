import type {
  IPluginDocumentation,
  PluginHttpRequest,
  PluginHttpResponse,
} from '@/plugin';
import { asHttpResponse } from '@omegga/plugin/http';
import express from 'express';
import { describe, expect, it, vi } from 'vitest';
import { errorHandler } from './middleware';
import { type HttpPlugin, pluginHttpRouter } from './pluginHttp';

vi.mock('@/logger', () => ({ default: { errorp: () => {} } }));

const doc = (isPublic: boolean): IPluginDocumentation => ({
  name: 'maps',
  description: '',
  author: '',
  config: {},
  commands: [],
  http: { public: isPublic },
});

function plugin(
  handler: (r: PluginHttpRequest) => Promise<PluginHttpResponse | undefined>,
  isPublic = false,
): HttpPlugin & { seen: PluginHttpRequest[] } {
  const seen: PluginHttpRequest[] = [];
  return {
    seen,
    getName: () => 'maps',
    isLoaded: () => true,
    getDocumentation: () => doc(isPublic),
    http: r => {
      seen.push(r);
      return handler(r);
    },
  };
}

/**
 * An app with the plugin routes, where the `x-test-user` header stands in for
 * a logged-in session.
 */
function app(p: HttpPlugin, timeoutMs?: number) {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    const userId = req.headers['x-test-user'];
    Object.assign(req, {
      session: { userId: typeof userId === 'string' ? userId : undefined },
    });
    next();
  });
  a.use(
    '/api/v1/plugin',
    pluginHttpRouter({
      findPlugin: name => (name === p.getName() ? p : undefined),
      findUser: async id => (id ? { id, username: 'user-' + id } : null),
      timeoutMs,
    }),
  );
  a.use(errorHandler);
  return a;
}

async function request(a: express.Express, path: string, init?: RequestInit) {
  const server = a.listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const addr = server.address();
    if (!addr || typeof addr === 'string')
      throw new Error('not listening on a port');
    const { port } = addr;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
    return {
      status: res.status,
      type: res.headers.get('content-type') ?? '',
      body: await res.text(),
    };
  } finally {
    server.close();
  }
}

describe('plugin http routes', () => {
  it('needs a login unless the plugin is public', async () => {
    const p = plugin(async () => ({ body: 'hi' }));
    expect((await request(app(p), '/api/v1/plugin/maps/x')).status).toBe(401);
    expect(p.seen).toHaveLength(0);
    const pub = plugin(
      async r => ({ body: r.user === null ? 'anonymous' : 'user' }),
      true,
    );
    const res = await request(app(pub), '/api/v1/plugin/maps/x');
    expect(res).toMatchObject({ status: 200, body: 'anonymous' });
    expect(res.type).toMatch(/^text\/plain/);
  });

  it('hands the plugin the request and sends back JSON', async () => {
    const p = plugin(async r => ({ status: 201, body: { got: r.body } }));
    const res = await request(
      app(p),
      '/api/v1/plugin/maps/live/map?zoom=2&tag=a&tag=b',
      {
        method: 'POST',
        headers: {
          'x-test-user': '7',
          'content-type': 'application/json',
          cookie: 'connect.sid=secret',
        },
        body: JSON.stringify({ x: 1 }),
      },
    );
    expect(res.status).toBe(201);
    expect(JSON.parse(res.body)).toEqual({ got: { x: 1 } });
    const [r] = p.seen;
    expect(r).toMatchObject({
      method: 'POST',
      path: '/live/map',
      query: { zoom: '2', tag: ['a', 'b'] },
      user: { id: '7', username: 'user-7' },
    });
    expect(r?.headers.cookie).toBeUndefined();
  });

  it('gives a GET no body, and the plugin root the path /', async () => {
    const p = plugin(async () => ({ body: null }));
    await request(app(p), '/api/v1/plugin/maps', {
      headers: { 'x-test-user': '1' },
    });
    expect(p.seen[0]).toMatchObject({ path: '/', body: undefined });
  });

  it('refuses a logged-in cross-origin POST', async () => {
    const p = plugin(async () => ({ body: 'done' }));
    const res = await request(app(p), '/api/v1/plugin/maps/delete', {
      method: 'POST',
      headers: { 'x-test-user': '1', origin: 'https://elsewhere.example' },
    });
    expect(res.status).toBe(403);
    expect(p.seen).toHaveLength(0);
  });

  it('answers 404 for no answer or no such plugin, 500 for a throw, 504 for a hang', async () => {
    const auth = { headers: { 'x-test-user': '1' } };
    expect(
      (
        await request(
          app(plugin(async () => undefined)),
          '/api/v1/plugin/maps/x',
          auth,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          app(plugin(async () => undefined)),
          '/api/v1/plugin/other/x',
          auth,
        )
      ).status,
    ).toBe(404);
    const broken = plugin(async () => {
      throw new Error('boom');
    });
    expect(
      (await request(app(broken), '/api/v1/plugin/maps/x', auth)).status,
    ).toBe(500);
    const hung = plugin(() => new Promise(() => {}));
    expect(
      (await request(app(hung, 50), '/api/v1/plugin/maps/x', auth)).status,
    ).toBe(504);
  });
});

describe('asHttpResponse', () => {
  it('keeps valid fields and drops the rest', () => {
    expect(asHttpResponse(null)).toBeUndefined();
    expect(asHttpResponse('hi')).toBeUndefined();
    expect(
      asHttpResponse({ status: 99, headers: { a: 'b', c: 3 }, body: [1] }),
    ).toEqual({
      headers: { a: 'b' },
      body: [1],
    });
    expect(asHttpResponse({ status: 418 })).toEqual({ status: 418 });
  });
});
