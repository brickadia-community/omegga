import { z } from 'zod/v4';
import _ from 'lodash';
import { Plugin } from '@omegga/plugin/interface';
import { router, protectedProcedure, getContextDeps } from '../trpc';
import { serverEvents } from '../events';
import { on } from 'events';

export const pluginRouter = router({
  plugin: router({
    list: protectedProcedure('plugin.list').query(() => {
      const { omegga } = getContextDeps();
      return _.sortBy(
        omegga.pluginLoader.plugins.map(p => ({
          name: p.getName(),
          documentation: p.getDocumentation(),
          path: p.shortPath,
          isLoaded: p.isLoaded(),
          isEnabled: p.isEnabled(),
        })),
        p => p.name.toLowerCase(),
      );
    }),

    get: protectedProcedure('plugin.get')
      .input(z.object({ shortPath: z.string() }))
      .query(async ({ input }) => {
        const { omegga } = getContextDeps();
        const plugin = omegga.pluginLoader.plugins.find(
          p => p.shortPath === input.shortPath,
        );
        if (!plugin) return null;

        const [defaultConfig, config, objCount] = await Promise.all([
          plugin.storage.getDefaultConfig(),
          plugin.storage.getConfig(),
          plugin.storage.count(),
        ]);

        return {
          name: plugin.getName(),
          format: (plugin.constructor as typeof Plugin).getFormat(),
          info: plugin.getInfo(),
          documentation: plugin.getDocumentation(),
          config,
          defaultConfig,
          objCount,
          path: plugin.shortPath,
          isLoaded: plugin.isLoaded(),
          isEnabled: plugin.isEnabled(),
        };
      }),

    config: protectedProcedure('plugin.config')
      .input(
        z.object({
          shortPath: z.string(),
          config: z.record(z.string(), z.unknown()),
        }),
      )
      .mutation(async ({ input }) => {
        const { omegga } = getContextDeps();
        const plugin = omegga.pluginLoader.plugins.find(
          p => p.shortPath === input.shortPath,
        );
        if (!plugin) return null;

        await plugin.storage.setConfig(input.config);
        return true;
      }),

    reloadAll: protectedProcedure('plugin.reloadAll').mutation(
      async ({ ctx }) => {
        const { omegga } = getContextDeps();
        const { log, error } = ctx;

        if (!omegga.pluginLoader) {
          error('Omegga is not using plugins');
          return false;
        }

        log('Unloading current plugins');
        let success = await omegga.pluginLoader.unload();
        if (!success) {
          error('Could not unload all plugins');
          return false;
        }

        log('Scanning for new plugins');
        success = await omegga.pluginLoader.scan();
        if (!success) {
          error('Could not scan for plugins');
          return false;
        }

        log('Starting plugins');
        success = await omegga.pluginLoader.reload();
        if (success) {
          const plugins = omegga.pluginLoader.plugins
            .filter(p => p.isLoaded())
            .map(p => p.getName());
          log('Loaded', (plugins.length + '').yellow, 'plugins:', plugins);
          return true;
        } else {
          error('Could not load all plugins');
          return false;
        }
      },
    ),

    unload: protectedProcedure('plugin.unload')
      .input(z.object({ shortPath: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { omegga } = getContextDeps();
        const { log } = ctx;

        const plugin = omegga.pluginLoader.plugins.find(
          p => p.shortPath === input.shortPath,
        );
        if (!plugin) return false;
        if (!plugin.isLoaded()) return false;

        log('Unloading'.red, 'plugin', plugin.getName().yellow);
        return await plugin.unload();
      }),

    load: protectedProcedure('plugin.load')
      .input(z.object({ shortPath: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { omegga } = getContextDeps();
        const { log } = ctx;

        const plugin = omegga.pluginLoader.plugins.find(
          p => p.shortPath === input.shortPath,
        );
        if (!plugin) return false;
        if (plugin.isLoaded() || !plugin.isEnabled()) return false;

        log('Loading'.green, 'plugin', plugin.getName().yellow);
        return await plugin.load();
      }),

    toggle: protectedProcedure('plugin.toggle')
      .input(z.object({ shortPath: z.string(), enabled: z.boolean() }))
      .mutation(({ input, ctx }) => {
        const { omegga } = getContextDeps();
        const { log, error } = ctx;

        const plugin = omegga.pluginLoader.plugins.find(
          p => p.shortPath === input.shortPath,
        );
        if (!plugin) return false;

        try {
          plugin.setEnabled(input.enabled);
          log(
            input.enabled ? 'Enabled'.green : 'Disabled'.red,
            'plugin',
            plugin.getName().yellow,
          );
          return true;
        } catch (e) {
          error(
            'Error',
            input.enabled ? 'enabling'.green : 'disabling'.red,
            'plugin',
            plugin.getName().yellow,
          );
          return false;
        }
      }),

    onStatus: protectedProcedure('plugin.onStatus').subscription(
      async function* () {
        for await (const [payload] of on(serverEvents, 'plugin')) {
          yield payload as {
            shortPath: string;
            name: string;
            isLoaded: boolean;
            isEnabled: boolean;
          };
        }
      },
    ),
  }),
});
