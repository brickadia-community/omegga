import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import EventEmitter from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type Database from './database';
import { serverEvents } from './events';
import type Omegga from '@omegga/server';
import { createContext, setContextDeps } from './trpc';

const USER = {
  _id: 'user-1',
  id: 'user-1',
  username: 'someone',
  isBanned: false,
  isOwner: false,
};

/** the two Database methods createContext calls */
const fakeDatabase = {
  findUserById: async () => USER,
  updateUserLastOnline: () => {},
} as unknown as Database;

/** express hands the context a response; only its close event matters here */
function fakeOpts() {
  const res = new EventEmitter();
  const req = { session: { userId: USER.id } };
  return {
    opts: { req, res } as unknown as CreateExpressContextOptions,
    res,
  };
}

const listeners = () => serverEvents.listenerCount('userInvalidated');

beforeEach(() => {
  setContextDeps({ database: fakeDatabase, omegga: {} as Omegga });
});

afterEach(() => {
  serverEvents.removeAllListeners('userInvalidated');
});

describe('createContext userAbort', () => {
  it('registers no listener until something asks for one', async () => {
    const { opts } = fakeOpts();
    await createContext(opts);
    expect(listeners()).toBe(0);
  });

  it('survives the context being spread', async () => {
    // tRPC's error shaping spreads the context. As a getter this allocated a
    // controller and a listener for every request that produced an error.
    const { opts } = fakeOpts();
    const ctx = await createContext(opts);
    const copy = { ...ctx };
    expect(listeners()).toBe(0);
    expect(typeof copy.userAbort).toBe('function');
  });

  it('registers one listener however many times it is called', async () => {
    const { opts } = fakeOpts();
    const ctx = await createContext(opts);
    expect(ctx.userAbort()).toBe(ctx.userAbort());
    expect(listeners()).toBe(1);
  });

  it('releases the listener when the response closes', async () => {
    // the path that leaked: a subscription the client simply navigated away
    // from never aborts, so cleanup cannot hang off abort alone
    const { opts, res } = fakeOpts();
    const ctx = await createContext(opts);
    ctx.userAbort();
    expect(listeners()).toBe(1);

    res.emit('close');
    expect(listeners()).toBe(0);
  });

  it('releases the listener when the user is invalidated', async () => {
    const { opts } = fakeOpts();
    const ctx = await createContext(opts);
    const ac = ctx.userAbort();

    serverEvents.emit('userInvalidated', USER.username);
    expect(ac.signal.aborted).toBe(true);
    expect(listeners()).toBe(0);
  });

  it('leaves other users alone', async () => {
    const { opts } = fakeOpts();
    const ctx = await createContext(opts);
    const ac = ctx.userAbort();

    serverEvents.emit('userInvalidated', 'somebody-else');
    expect(ac.signal.aborted).toBe(false);
    expect(listeners()).toBe(1);
  });

  it('does not accumulate listeners across many requests', async () => {
    // the reported symptom was 201 listeners on a 200 limit
    for (let i = 0; i < 250; i++) {
      const { opts, res } = fakeOpts();
      const ctx = await createContext(opts);
      ctx.userAbort();
      res.emit('close');
    }
    expect(listeners()).toBe(0);
  });
});
