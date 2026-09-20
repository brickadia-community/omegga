import express from 'express';
import type { AddressInfo } from 'node:net';
import { describe, expect, it, vi } from 'vitest';
import {
  asyncRoute,
  errorHandler,
  HttpError,
  requireSession,
} from './middleware';

const errors: unknown[][] = [];
const lastError = () => errors[errors.length - 1] ?? [];
vi.mock('@/logger', () => ({
  default: { errorp: (...args: unknown[]) => errors.push(args) },
}));

/** run an app on an ephemeral port for the duration of one request */
async function request(app: express.Express, path = '/', init?: RequestInit) {
  const server = app.listen(0);
  try {
    await new Promise(resolve => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
    return { status: res.status, body: await res.text() };
  } finally {
    server.close();
  }
}

describe('asyncRoute', () => {
  it('forwards a rejection to the error handler', async () => {
    const next = vi.fn();
    const err = new Error('database is locked');
    asyncRoute(async () => {
      throw err;
    })({} as express.Request, {} as express.Response, next);
    await new Promise(resolve => setImmediate(resolve));

    expect(next).toHaveBeenCalledWith(err);
  });

  it('leaves a handler that resolves alone', async () => {
    const next = vi.fn();
    asyncRoute(async () => {})(
      {} as express.Request,
      {} as express.Response,
      next,
    );
    await new Promise(resolve => setImmediate(resolve));

    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireSession', () => {
  it('rejects a request express-session declined to give a session', async () => {
    const app = express();
    app.use(requireSession);
    app.use((_req, res) => res.status(200).json({}));

    expect((await request(app)).status).toBe(400);
  });

  it('passes a request that has one', async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.session = {} as express.Request['session'];
      next();
    });
    app.use(requireSession);
    app.use((_req, res) => res.status(200).json({}));

    expect((await request(app)).status).toBe(200);
  });
});

describe('errorHandler', () => {
  it('answers 500 for a route that threw, rather than crashing', async () => {
    const app = express();
    app.get(
      '/boom',
      asyncRoute(async () => {
        throw new Error('database is locked');
      }),
    );
    app.use(errorHandler);

    const res = await request(app, '/boom');
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ message: 'internal error' });
    expect(lastError().join(' ')).toContain('database is locked');
  });

  it('uses the status an HttpError carries', async () => {
    const app = express();
    app.get('/nope', (_req, _res, next) => {
      next(new HttpError(401, 'unauthorized'));
    });
    app.use(errorHandler);

    const res = await request(app, '/nope');
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ message: 'unauthorized' });
  });

  it('delegates when the response is already on the wire', () => {
    // express' default handler is the only one that can still act here: it
    // destroys the socket rather than appending a second response body
    const next = vi.fn();
    const err = new Error('too late');
    errorHandler(
      err,
      {} as express.Request,
      { headersSent: true } as express.Response,
      next,
    );

    expect(next).toHaveBeenCalledWith(err);
  });
});
