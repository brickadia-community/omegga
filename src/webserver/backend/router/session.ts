import { getLastSteamUpdateCheck } from '@/updater/steam';
import { VERSION } from '@/version';
import { router, protectedProcedure, getContextDeps } from '../trpc';

export const sessionRouter = router({
  session: router({
    info: protectedProcedure('session.info').query(async ({ ctx }) => {
      const { database, omegga } = getContextDeps();
      const roles = await database.getRoles();

      return {
        roles,
        version: VERSION,
        brickadiaVersion: omegga.version ?? null,
        canLogOut: ctx.user.username !== '',
        now: Date.now(),
        userless: !ctx.user.username,
        user: {
          username: ctx.user.username || 'Admin',
          isOwner: ctx.user.isOwner,
          roles: ctx.user.roles,
        },
        isSteam: Boolean(omegga.config.__STEAM),
        update: {
          canCheck: Boolean(omegga.config.__STEAM),
          lastCheck: getLastSteamUpdateCheck()?.result ?? null,
        },
      };
    }),
  }),
});
