import _ from 'lodash';
import { router, protectedProcedure, getContextDeps } from '../trpc';
import { ScopeName } from '../scopes';

export const roleRouter = router({
  role: router({
    list: protectedProcedure(ScopeName.RoleList).query(() => {
      const { omegga } = getContextDeps();
      return _.sortBy(omegga.getRoleSetup()?.roles ?? [], p =>
        p.name.toLowerCase(),
      );
    }),
  }),
});
