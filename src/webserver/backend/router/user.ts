import bcrypt from 'bcryptjs';
import { z } from 'zod/v4';
import {
  EMPTY_PERMISSIONS,
  userHasScope,
  type PermissionSet,
} from '../permissions';
import { verifyToken } from '../totp';
import {
  actorHasAllPermissions,
  checkPermissionEscalation,
  checkPermissionRevocation,
  checkRoleHierarchy,
  checkUserHierarchy,
  getGrantablePermissions,
} from '../roleHierarchy';
import { ScopeName } from '../scopes';
import { router, protectedProcedure, getContextDeps } from '../trpc';

const PermissionSetSchema = z.object({
  root: z.enum(['all', 'read', 'off']),
  domains: z.record(z.string(), z.enum(['all', 'read', 'none'])),
  scopes: z.record(z.string(), z.boolean()),
});

export const userRouter = router({
  user: router({
    list: protectedProcedure(ScopeName.UserList)
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
        resp.users = resp.users.map(
          ({
            hash: _h,
            totpSecret: _ts,
            recoveryCodes: _rc,
            passkeys: _pk,
            permissions: _perms,
            ...user
          }) => ({
            ...user,
            hash: '',
            permissions: _perms,
            totpEnabled: user.totpEnabled ?? false,
            passkeyCount: _pk?.length ?? 0,
            seenAgo: user.lastOnline ? now - user.lastOnline : Infinity,
            createdAgo: now - user.created,
          }),
        );
        return resp;
      }),

    self: protectedProcedure(ScopeName.SessionInfo).query(async ({ ctx }) => {
      const now = Date.now();
      return {
        username: ctx.user.username || 'Admin',
        isOwner: ctx.user.isOwner,
        isBanned: ctx.user.isBanned ?? false,
        lastOnline: ctx.user.lastOnline ?? 0,
        created: ctx.user.created ?? 0,
        seenAgo: ctx.user.lastOnline ? now - ctx.user.lastOnline : Infinity,
        createdAgo: now - (ctx.user.created ?? now),
        permissions: ctx.user.permissions,
        roles: ctx.user.roles ?? [],
        totpEnabled: ctx.user.totpEnabled ?? false,
        passkeyCount: ctx.user.passkeys?.length ?? 0,
      };
    }),

    create: protectedProcedure(ScopeName.UserCreate)
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

        if (typeof username !== 'string' || typeof password !== 'string')
          return 'username/password not a string';
        if (!username.match(/^\w{1,32}$/)) return 'username is not allowed';
        if (password.length === 0 || password.length > 128)
          return 'invalid password size';

        if (ctx.user.isOwner && ctx.user.username === '') {
          try {
            database.updateOwnerCredentials(
              ctx.user._id,
              username,
              await database.hash(password),
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

    // self-service: any authenticated user can change their own password
    // changing another user's password requires user.passwd permission (enforced here)
    passwd: protectedProcedure(ScopeName.SessionInfo)
      .input(
        z.object({
          username: z.string(),
          password: z.string(),
          currentPassword: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username, password } = input;
        const { log, error } = ctx;

        const isSelf = username === ctx.user.username;
        if (isSelf) {
          if (!input.currentPassword) return 'current password required';
          const bcryptLib = await import('bcryptjs');
          if (!(await bcryptLib.compare(input.currentPassword, ctx.user.hash)))
            return 'incorrect current password';
        } else {
          const rolePerms = await database.getUserRolePermissions(ctx.user);
          if (!userHasScope(ctx.user, ScopeName.UserPasswd, rolePerms))
            return 'missing permission';

          const target = await database.findUserByUsername(username);
          if (!target) return 'user does not exist';
          const hierErr = await checkUserHierarchy(ctx.user, target);
          if (hierErr) return hierErr;
        }

        if (typeof username !== 'string' || typeof password !== 'string')
          return 'username/password not a string';
        if (!username.match(/^\w{1,32}$/)) return 'username is not allowed';
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

    // self-service: change your own username (requires the user.rename
    // permission). users cannot take a name already held by another user,
    // including case variants
    rename: protectedProcedure(ScopeName.UserRename)
      .input(z.object({ username: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username } = input;
        const { log, error } = ctx;

        if (!ctx.user.username)
          return 'create an account before renaming yourself';
        if (username === ctx.user.username) return '';

        try {
          await database.renameUser(ctx.user._id, username);
        } catch (e) {
          error('error renaming user', e);
          return e instanceof Error ? e.message : 'error renaming user';
        }
        log(`renamed "${ctx.user.username.yellow}" to "${username.yellow}"`);
        return '';
      }),

    // owner-only: grant full ownership to another user. requires the owner to
    // re-enter their password (and a TOTP code when MFA is enabled)
    grantOwner: protectedProcedure(ScopeName.SessionInfo)
      .input(
        z.object({
          username: z.string(),
          password: z.string(),
          code: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username, password, code } = input;
        const { log, error } = ctx;

        if (!ctx.user.isOwner) return 'only an owner can grant ownership';
        if (!ctx.user.username)
          return 'create an account before granting ownership';
        if (username === ctx.user.username) return 'you are already an owner';

        if (!(await bcrypt.compare(password, ctx.user.hash)))
          return 'incorrect password';

        if (ctx.user.totpEnabled) {
          if (!code) return 'MFA code required';
          if (!ctx.user.totpSecret || !verifyToken(code, ctx.user.totpSecret))
            return 'invalid MFA code';
        }

        try {
          await database.grantOwner(username);
        } catch (e) {
          error('error granting ownership', e);
          return e instanceof Error ? e.message : 'error granting ownership';
        }
        log(`granted ownership to "${username.yellow}"`);
        return '';
      }),

    ban: protectedProcedure(ScopeName.UserBan)
      .input(
        z.object({
          username: z.string(),
          banned: z.boolean(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username, banned } = input;
        const { log } = ctx;

        if (username === ctx.user.username) return 'cannot disable yourself';
        if (!(await database.userExists(username)))
          return 'user does not exist';

        const target = await database.findUserByUsername(username);
        if (!target) return 'user does not exist';
        const hierErr = await checkUserHierarchy(ctx.user, target);
        if (hierErr) return hierErr;

        await database.banUser(username, banned);
        log(`${banned ? 'disabled' : 'enabled'} user "${username.yellow}"`);
        return '';
      }),

    delete: protectedProcedure(ScopeName.UserDelete)
      .input(
        z.object({
          username: z.string(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username } = input;
        const { log } = ctx;

        if (username === ctx.user.username) return 'cannot delete yourself';
        if (!(await database.userExists(username)))
          return 'user does not exist';

        const target = await database.findUserByUsername(username);
        if (!target) return 'user does not exist';
        const hierErr = await checkUserHierarchy(ctx.user, target);
        if (hierErr) return hierErr;

        await database.deleteUser(username);
        log(`deleted user "${username.yellow}"`);
        return '';
      }),

    permissions: protectedProcedure(ScopeName.UserPermissions)
      .input(
        z.object({
          username: z.string(),
          permissions: PermissionSetSchema,
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username } = input;
        const permissions = input.permissions as PermissionSet;
        const { log } = ctx;

        if (username === ctx.user.username)
          return 'cannot edit own permissions';

        const target = await database.findUserByUsername(username);
        if (!target) return 'user does not exist';
        const hierErr = await checkUserHierarchy(ctx.user, target);
        if (hierErr) return hierErr;

        if (!ctx.user.isOwner) {
          const rolePerms = await database.getUserRolePermissions(ctx.user);
          const escErr = checkPermissionEscalation(
            ctx.user,
            rolePerms,
            permissions,
          );
          if (escErr) return escErr;

          const revErr = checkPermissionRevocation(
            target.permissions ?? EMPTY_PERMISSIONS,
            permissions,
          );
          if (revErr) return revErr;
        }

        await database.setUserPermissions(username, permissions);
        log(`updated permissions for "${username.yellow}"`);
        return '';
      }),

    grantRole: protectedProcedure(ScopeName.UserGrantRole)
      .input(z.object({ username: z.string(), roleId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username, roleId } = input;
        const { log } = ctx;

        if (username === ctx.user.username)
          return 'cannot grant roles to yourself';

        const target = await database.findUserByUsername(username);
        if (!target) return 'user does not exist';
        if (target.isOwner) return 'cannot modify the owner';

        const role = await database.getRole(roleId);
        if (!role) return 'role not found';

        const err = await checkRoleHierarchy(
          ctx.user,
          role,
          ScopeName.UserGrantRole,
        );
        if (err) return err;

        if (!ctx.user.isOwner) {
          const assignedRoles = await database.getUserAssignedRoles(ctx.user);
          const grantable = getGrantablePermissions(assignedRoles, role.order);
          if (!actorHasAllPermissions(grantable, role.permissions))
            return 'cannot grant a role with permissions you do not have';
        }

        if (target.roles.includes(roleId)) return '';
        database.addUserRole(target.id, roleId);
        log(`granted role "${role.name.yellow}" to "${username.yellow}"`);
        return '';
      }),

    revokeRole: protectedProcedure(ScopeName.UserGrantRole)
      .input(z.object({ username: z.string(), roleId: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username, roleId } = input;
        const { log } = ctx;

        if (username === ctx.user.username)
          return 'cannot revoke roles from yourself';

        const target = await database.findUserByUsername(username);
        if (!target) return 'user does not exist';
        if (target.isOwner) return 'cannot modify the owner';

        const role = await database.getRole(roleId);
        if (!role) return 'role not found';

        const err = await checkRoleHierarchy(
          ctx.user,
          role,
          ScopeName.UserGrantRole,
        );
        if (err) return err;

        database.removeUserRole(target.id, roleId);
        log(`revoked role "${role.name.yellow}" from "${username.yellow}"`);
        return '';
      }),

    resetMfa: protectedProcedure(ScopeName.UserResetMfa)
      .input(z.object({ username: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { username } = input;
        const { log } = ctx;

        if (username === ctx.user.username) return 'cannot reset own MFA';

        const target = await database.findUserByUsername(username);
        if (!target) return 'user does not exist';
        const hierErr = await checkUserHierarchy(ctx.user, target);
        if (hierErr) return hierErr;

        await database.resetUserMfa(username);
        log(`reset MFA for "${username.yellow}"`);
        return '';
      }),
  }),
});
