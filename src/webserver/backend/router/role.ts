import { z } from 'zod/v4';
import { userHasScope, type PermissionSet } from '../permissions';
import {
  actorHasAllPermissions,
  checkPermissionRevocation,
  checkRoleHierarchy,
  getActorHighestOrder,
  getGrantablePermissions,
} from '../roleHierarchy';
import { ScopeName } from '../scopes';
import { getContextDeps, protectedProcedure, router } from '../trpc';

const PermissionSetSchema = z.object({
  root: z.enum(['all', 'read', 'off']),
  domains: z.record(z.string(), z.enum(['all', 'read', 'none'])),
  scopes: z.record(z.string(), z.boolean()),
});

export const roleRouter = router({
  role: router({
    list: protectedProcedure(ScopeName.RoleList).query(async () => {
      const { database } = getContextDeps();
      const roles = await database.getAllRoles();
      return roles.map(({ type: _t, permissions, ...r }) => ({
        ...r,
        permissions,
      }));
    }),

    get: protectedProcedure(ScopeName.RoleList)
      .input(z.object({ id: z.string() }))
      .query(async ({ input }) => {
        const { database } = getContextDeps();
        const role = await database.getRole(input.id);
        if (!role) return null;
        const { type: _t, permissions, ...r } = role;
        return { ...r, permissions: permissions };
      }),

    create: protectedProcedure(ScopeName.RoleEdit)
      .input(
        z.object({
          name: z.string().min(1).max(64),
          description: z.string().max(512).default(''),
          permissions: PermissionSetSchema.optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { log } = ctx;

        if (!ctx.user.isOwner) {
          const err = await checkRoleHierarchy(
            ctx.user,
            { order: 1 } as any,
            ScopeName.RoleEdit,
          );
          if (err) return err;

          if (input.permissions) {
            const rolePerms = await database.getUserRolePermissions(ctx.user);
            if (
              !userHasScope(ctx.user, ScopeName.RoleGrantPermission, rolePerms)
            )
              return 'missing permission: role.grantPermission';

            const assignedRoles = await database.getUserAssignedRoles(ctx.user);
            const grantable = getGrantablePermissions(assignedRoles, 1);
            if (
              !actorHasAllPermissions(
                grantable,
                input.permissions as PermissionSet,
              )
            )
              return 'cannot grant permissions you do not have';
          }
        }

        const perms = (input.permissions as PermissionSet) ?? {
          root: 'off',
          domains: {},
          scopes: {},
        };
        const role = await database.createRole(
          input.name,
          input.description,
          perms,
        );
        log(`created role "${input.name.yellow}"`);
        return { id: role.id };
      }),

    update: protectedProcedure(ScopeName.RoleEdit)
      .input(
        z.object({
          id: z.string(),
          name: z.string().min(1).max(64).optional(),
          description: z.string().max(512).optional(),
          permissions: PermissionSetSchema.optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { log } = ctx;

        const role = await database.getRole(input.id);
        if (!role) return 'role not found';

        if (!ctx.user.isOwner) {
          const err = await checkRoleHierarchy(
            ctx.user,
            role,
            ScopeName.RoleEdit,
          );
          if (err) return err;

          if (input.permissions) {
            const rolePerms = await database.getUserRolePermissions(ctx.user);
            if (
              !userHasScope(ctx.user, ScopeName.RoleGrantPermission, rolePerms)
            )
              return 'missing permission: role.grantPermission';

            const assignedRoles = await database.getUserAssignedRoles(ctx.user);
            const grantable = getGrantablePermissions(
              assignedRoles,
              role.order,
            );
            if (
              !actorHasAllPermissions(
                grantable,
                input.permissions as PermissionSet,
              )
            )
              return 'cannot grant permissions you do not have';

            const currentPerms = role.permissions;
            const revErr = checkPermissionRevocation(
              currentPerms,
              input.permissions as PermissionSet,
            );
            if (revErr) return revErr;
          }
        }

        const updates: Parameters<typeof database.updateRole>[1] = {};
        if (input.name !== undefined) updates.name = input.name;
        if (input.description !== undefined)
          updates.description = input.description;
        if (input.permissions)
          updates.permissions = input.permissions as PermissionSet;

        await database.updateRole(input.id, updates);
        log(`updated role "${role.name.yellow}"`);
        return '';
      }),

    delete: protectedProcedure(ScopeName.RoleEdit)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { log } = ctx;

        const role = await database.getRole(input.id);
        if (!role) return 'role not found';

        const err = await checkRoleHierarchy(
          ctx.user,
          role,
          ScopeName.RoleEdit,
        );
        if (err) return err;

        const result = await database.deleteRole(input.id);
        if (result) return result;
        log(`deleted role "${role.name.yellow}"`);
        return '';
      }),

    reorder: protectedProcedure(ScopeName.RoleEdit)
      .input(z.object({ orderedIds: z.array(z.string()) }))
      .mutation(async ({ input, ctx }) => {
        const { database } = getContextDeps();
        const { log } = ctx;

        const allRoles = await database.getAllRoles();
        const dedupedIds = [...new Set(input.orderedIds)];

        if (!ctx.user.isOwner) {
          const actorRoles = await database.getUserAssignedRoles(ctx.user);
          const actorOrder = getActorHighestOrder(
            ctx.user,
            actorRoles,
            ScopeName.RoleEdit,
          );
          if (actorOrder < 0)
            return 'reorder requires role.edit from an assigned role';

          for (const id of dedupedIds) {
            const role = allRoles.find(r => r.id === id);
            if (!role) return `role not found: ${id}`;
            if (role.order >= actorOrder)
              return `cannot reorder role "${role.name}" at or above your level`;
          }

          const manageable = allRoles.filter(r => r.order < actorOrder);
          if (dedupedIds.length !== manageable.length)
            return 'must include all roles below your level';
          for (const r of manageable) {
            if (!dedupedIds.includes(r.id))
              return `missing role "${r.name}" from reorder list`;
          }
        }

        const unmanagedOrders = allRoles
          .filter(r => !dedupedIds.includes(r.id))
          .map(r => r.order)
          .sort((a, b) => b - a);
        const managedSlots = allRoles
          .map(r => r.order)
          .filter(o => !unmanagedOrders.includes(o))
          .sort((a, b) => b - a);

        await database.reorderRoles(
          dedupedIds.map((id, i) => ({ id, order: managedSlots[i] ?? i + 1 })),
        );
        log('reordered roles');
        return '';
      }),

    defaultPermissions: router({
      get: protectedProcedure(ScopeName.RoleList).query(async () => {
        const { database } = getContextDeps();
        const defaults = await database.getDefaultPermissions();
        return {
          root: defaults.root,
          domains: defaults.domains,
          scopes: defaults.scopes,
        };
      }),

      set: protectedProcedure(ScopeName.RoleDefaultPermissions)
        .input(PermissionSetSchema)
        .mutation(async ({ input, ctx }) => {
          const { database } = getContextDeps();
          const { log } = ctx;
          const permissions = input as unknown as PermissionSet;

          if (!ctx.user.isOwner) {
            const assignedRoles = await database.getUserAssignedRoles(ctx.user);
            const grantable = getGrantablePermissions(assignedRoles);
            if (!actorHasAllPermissions(grantable, permissions))
              return 'cannot grant permissions you do not have';

            const current = await database.getDefaultPermissions();
            const revErr = checkPermissionRevocation(current, permissions);
            if (revErr) return revErr;
          }

          await database.setDefaultPermissions(permissions);
          log('updated default permissions');
          return '';
        }),
    }),
  }),
});
