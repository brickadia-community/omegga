import { mergeRouters } from '../trpc';
import { chatRouter } from './chat';
import { playerRouter } from './player';
import { pluginRouter } from './plugin';
import { roleRouter } from './role';
import { serverRouter } from './server';
import { sessionRouter } from './session';
import { userRouter } from './user';
import { worldRouter } from './world';

export const appRouter = mergeRouters(
  sessionRouter,
  chatRouter,
  playerRouter,
  pluginRouter,
  serverRouter,
  userRouter,
  worldRouter,
  roleRouter,
);

export type AppRouter = typeof appRouter;
