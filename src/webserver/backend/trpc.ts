import Logger from '@/logger';
import type Omegga from '@omegga/server';
import { initTRPC, TRPCError } from '@trpc/server';
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import type Database from './database';
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
  user: IStoreUser & { _id: string };
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<Context> {
  const { database } = getContextDeps();
  const req = opts.req;

  const userId = (req as any).session?.userId;
  const user = await database.findUserById(userId);
  if (!user || user.isBanned) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  // Update lastOnline (migrated from Socket.IO connect handler)
  await database.stores.users.update<IStoreUser>(
    { _id: user._id },
    { $set: { lastOnline: Date.now() } },
  );

  const usernameText = `[${(user.username || 'Admin').brightMagenta}]`;

  return {
    user,
    log: (...args: any[]) => Logger.logp(usernameText, ...args),
    error: (...args: any[]) => Logger.errorp(usernameText, ...args),
  };
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const mergeRouters = t.mergeRouters;

export const requireScope = (scope: Scope) =>
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
    if (ctx.user.isOwner) return next({ ctx });
    const { database } = getContextDeps();
    const defaults = await database.getDefaultPermissions();
    if (!userHasScope(ctx.user, scope, defaults)) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next({ ctx });
  });

export const protectedProcedure = (scope: Scope) =>
  t.procedure.use(requireScope(scope));
