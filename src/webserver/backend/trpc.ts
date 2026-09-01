import Logger from '@/logger';
import type Omegga from '@omegga/server';
import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type Database from './database';
import { serverEvents } from './events';
import { userHasScope } from './permissions';
import type { Scope } from './scopes';
import type { IStoreUser } from './types';

export type ContextDeps = {
  database: Database;
  omegga: Omegga;
};

let _deps: ContextDeps | null = null;

export function setContextDeps(deps: ContextDeps) {
  _deps = deps;
}

export function getContextDeps(): ContextDeps {
  if (!_deps) throw new Error('tRPC context deps not initialized');
  return _deps;
}

export type Context = {
  user: IStoreUser & { id: string; _id: string };
  req: import('express').Request;
  /** lazily created; call only where the request genuinely needs to be aborted */
  userAbort: () => AbortController;
  log: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<Context> {
  const { database } = getContextDeps();
  const req = opts.req;

  const session = req.session;
  if (session?.mfaPending) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  const userId = session?.userId;
  const user = await database.findUserById(userId);
  if (!user || user.isBanned) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  database.updateUserLastOnline(user._id);

  const usernameText = `[${(user.username || 'Admin').brightMagenta}]`;

  let _userAbort: AbortController | null = null;

  /*
    Allocated on demand, because only subscriptions need one.

    This is a function rather than a getter on purpose: tRPC's error shaping
    spreads the context, and spreading invokes getters. As a getter this
    allocated a controller and registered a `userInvalidated` listener for every
    request that produced an error, none of which ever asked for one.
  */
  const userAbort = () => {
    if (_userAbort) return _userAbort;

    const ac = new AbortController();
    _userAbort = ac;

    const onInvalidated = (name: string) => {
      if (name === user.username) ac.abort();
    };
    serverEvents.on('userInvalidated', onInvalidated);

    // `serverEvents` lives as long as the process, so the listener has to come
    // off however the request ends. Releasing it only on abort left one behind
    // for every subscription that closed normally.
    const release = () => {
      serverEvents.off('userInvalidated', onInvalidated);
      opts.res.off('close', release);
    };
    ac.signal.addEventListener('abort', release, { once: true });
    opts.res.once('close', release);

    return ac;
  };

  return {
    user,
    req,
    userAbort,
    log: (...args: unknown[]) => Logger.logp(usernameText, ...args),
    error: (...args: unknown[]) => Logger.errorp(usernameText, ...args),
  };
}

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error, path, ctx }) {
    const user = (ctx as Context | undefined)?.user?.username || '?';
    Logger.errorp(
      `[${user.brightMagenta}]`,
      `${error.code} ${path ?? '?'}: ${error.message}`,
    );
    return shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;

export const requireScope = (scope: Scope) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (ctx.user.isOwner) return next({ ctx });
    const { database } = getContextDeps();
    const rolePermissions = await database.getUserRolePermissions(ctx.user);
    if (!userHasScope(ctx.user, scope, rolePermissions)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `missing scope: ${scope}`,
      });
    }
    return next({ ctx });
  });

export const protectedProcedure = (scope: Scope) =>
  t.procedure.use(requireScope(scope));

/**
 * Admit a user holding any one of these scopes. Used where a route lists what
 * the caller may see rather than gating a single action, such as the metrics
 * dashboards, which the caller may be allowed some of and not others.
 */
export const requireAnyScope = (...scopes: Scope[]) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (ctx.user.isOwner) return next({ ctx });
    const { database } = getContextDeps();
    const rolePermissions = await database.getUserRolePermissions(ctx.user);
    if (!scopes.some(s => userHasScope(ctx.user, s, rolePermissions))) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `missing one of: ${scopes.join(', ')}`,
      });
    }
    return next({ ctx });
  });

export const anyScopeProcedure = (...scopes: Scope[]) =>
  t.procedure.use(requireAnyScope(...scopes));

/** the scopes a user actually holds out of a candidate list */
export async function filterScopes(
  user: Context['user'],
  scopes: Scope[],
): Promise<Set<Scope>> {
  if (user.isOwner) return new Set(scopes);
  const { database } = getContextDeps();
  const rolePermissions = await database.getUserRolePermissions(user);
  return new Set(scopes.filter(s => userHasScope(user, s, rolePermissions)));
}
