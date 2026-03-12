import _ from 'lodash';
import { router, protectedProcedure, getContextDeps } from '../trpc';

export const roleRouter = router({
  role: router({
    list: protectedProcedure('role.list').query(() => {
      const { omegga } = getContextDeps();
      return _.sortBy(omegga.getRoleSetup()?.roles ?? [], p =>
        p.name.toLowerCase(),
      );
    }),
  }),
});
