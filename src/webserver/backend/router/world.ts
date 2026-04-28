import { readBrdbMeta } from '@util/brdb';
import { z } from 'zod/v4';
import { getContextDeps, protectedProcedure, router } from '../trpc';

export const worldRouter = router({
  world: router({
    list: protectedProcedure('world.list').query(() => {
      const { omegga } = getContextDeps();
      const prefix = omegga.worldPath + '/';
      return omegga
        .getWorlds()
        .map(world => world.replace(prefix, '').replace(/\.brdb$/, ''));
    }),

    revisions: protectedProcedure('world.revisions')
      .input(z.object({ world: z.string() }))
      .query(async ({ input }) => {
        const { omegga } = getContextDeps();
        try {
          return (
            (await omegga.getWorldRevisions(input.world))?.map(
              ({ date, ...r }) => ({ ...r, date: date.getTime() }),
            ) ?? null
          );
        } catch (_err) {
          return null;
        }
      }),

    meta: protectedProcedure('world.meta')
      .input(z.object({ world: z.string() }))
      .query(async ({ input, ctx }) => {
        const { omegga } = getContextDeps();
        try {
          const path = omegga.getWorldPath(input.world);
          if (!path) return null;
          return readBrdbMeta(path);
        } catch (err) {
          ctx.error('Error while getting world meta', err);
          return null;
        }
      }),

    next: protectedProcedure('world.next').query(() => {
      const { omegga } = getContextDeps();
      return omegga.getNextWorld();
    }),

    active: protectedProcedure('world.active').query(() => {
      const { omegga } = getContextDeps();
      return omegga.getActiveWorld();
    }),

    load: protectedProcedure('world.load')
      .input(
        z.object({
          world: z.string(),
          revision: z.number().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { omegga } = getContextDeps();
        const { log, error } = ctx;
        try {
          let res = false;
          if (input.revision) {
            log(
              'Loading world revision',
              input.revision,
              'of',
              input.world.yellow,
            );
            res = await omegga.loadWorldRevision(input.world, input.revision);
          } else {
            log('Loading world', input.world.yellow);
            res = await omegga.loadWorld(input.world);
          }
          if (res) log('World loaded successfully');
          else log('World load failed');
          return res;
        } catch (err) {
          error('Error while loading world', err);
          return false;
        }
      }),

    use: protectedProcedure('world.use')
      .input(
        z.object({
          world: z.string().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { omegga } = getContextDeps();
        const { log, error } = ctx;
        try {
          const ok = omegga.setActiveWorld(input.world || null);
          if (ok) log('Set default world to', (input.world || 'none').yellow);
          return ok;
        } catch (err) {
          error('Error while using world', err);
          return false;
        }
      }),

    create: protectedProcedure('world.create')
      .input(
        z.object({
          name: z.string(),
          level: z.enum(['Plate', 'Space', 'Studio', 'Peaks']).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { omegga } = getContextDeps();
        const { log, error } = ctx;
        try {
          log(
            'Creating new world',
            input.name.yellow,
            'with level',
            input.level?.yellow || 'Plate',
          );
          const res = await omegga.createEmptyWorld(input.name, input.level);
          if (res) log('World created successfully');
          else log('World creation failed');
          return res;
        } catch (err) {
          error('Error while creating world', err);
          return false;
        }
      }),

    save: protectedProcedure('world.save')
      .input(
        z
          .object({
            name: z.string().optional(),
          })
          .optional()
          .default({}),
      )
      .mutation(async ({ input, ctx }) => {
        const { omegga } = getContextDeps();
        const { log, error } = ctx;
        try {
          let res = false;
          if (input.name) {
            log('Saving world as', input.name.yellow);
            res = await omegga.saveWorldAs(input.name);
          } else {
            log('Saving current world');
            res = await omegga.saveWorld();
          }
          if (res) log('World saved successfully');
          else log('World save failed');
          return res;
        } catch (err) {
          error('Error while saving world', err);
          return false;
        }
      }),
  }),
});
