import { getLastSteamUpdateCheck } from '@/updater/steam';
import { VERSION } from '@/version';
import { EMPTY_PERMISSIONS, RootLevel, resolveAllScopes } from '../permissions';
import { ScopeName } from '../scopes';
import { router, protectedProcedure, getContextDeps } from '../trpc';

export const sessionRouter = router({
  session: router({
    info: protectedProcedure(ScopeName.SessionInfo).query(async ({ ctx }) => {
      const { database, omegga } = getContextDeps();
      const rolePermissions = await database.getUserRolePermissions(ctx.user);
      const userPerms = ctx.user.permissions ?? EMPTY_PERMISSIONS;

      return {
        version: VERSION,
        brickadiaVersion: omegga.version ?? null,
        canLogOut: ctx.user.username !== '',
        now: Date.now(),
        userless: !ctx.user.username,
        user: {
          username: ctx.user.username || 'Admin',
          isOwner: ctx.user.isOwner,
          roles: ctx.user.roles,
          permissions: userPerms,
          resolvedScopes: ctx.user.isOwner
            ? resolveAllScopes(
                { root: RootLevel.All, domains: {}, scopes: {} },
                [],
              )
            : resolveAllScopes(userPerms, rolePermissions),
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
