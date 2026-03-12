import { z } from 'zod/v4';
import { router, protectedProcedure, getContextDeps } from '../trpc';

export const userRouter = router({
  user: router({
    list: protectedProcedure('user.list')
      .input(
        z
          .object({
            page: z.number().optional().default(0),
            search: z.string().optional().default(''),
            sort: z.string().optional().default('name'),
            direction: z.number().optional().default(1),
          })
          .optional()
          .default({ page: 0, search: '', sort: 'name', direction: 1 }),
      )
      .query(async ({ input }) => {
        const { database } = getContextDeps();
        const { page, search, sort, direction } = input;
        const resp = await database.getUsers({ page, search, sort, direction });
        const now = Date.now();
        resp.users = resp.users.map(({ hash: _, ...user }) => ({
          ...user,
          hash: '',
          seenAgo: user.lastOnline ? now - user.lastOnline : Infinity,
          createdAgo: now - user.created,
        }));
        return resp;
      }),

    create: protectedProcedure('user.create')
      .input(
        z.object({
          username: z.string(),
          password: z.string(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username, password } = input;
        const { log, error } = ctx;

        if (!ctx.user.isOwner) return 'missing permission';
        if (typeof username !== 'string' || typeof password !== 'string')
          return 'username/password not a string';
        if (!username.match(/^\w{0,32}$/)) return 'username is not allowed';
        if (password.length === 0 || password.length > 128)
          return 'invalid password size';

        if (ctx.user.isOwner && ctx.user.username === '') {
          try {
            await database.stores.users.update(
              { _id: ctx.user._id },
              { username, hash: await database.hash(password) },
            );
          } catch (e) {
            error('error setting owner password', e);
            return 'error setting owner password';
          }
          log(`created account as "${username.yellow}"`);
          return '';
        }

        if (await database.userExists(username)) return 'user already exists';

        try {
          await database.createUser(username, password);
        } catch (e) {
          error('error creating new user', e);
          return 'error creating new user';
        }
        log(`created new user "${username.yellow}"`);
        return '';
      }),

    passwd: protectedProcedure('user.passwd')
      .input(
        z.object({
          username: z.string(),
          password: z.string(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username, password } = input;
        const { log, error } = ctx;

        if (!ctx.user.isOwner && username !== ctx.user.username)
          return 'missing permission';
        if (typeof username !== 'string' || typeof password !== 'string')
          return 'username/password not a string';
        if (!username.match(/^\w{0,32}$/)) return 'username is not allowed';
        if (!(await database.userExists(username)))
          return 'user does not exist';

        try {
          await database.userPasswd(username, password);
        } catch (e) {
          error('error setting user password', e);
          return "error setting user's password";
        }
        log(`changed password for "${username.yellow}"`);
        return '';
      }),
  }),
});
