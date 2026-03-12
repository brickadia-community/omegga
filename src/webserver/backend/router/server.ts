import Logger from '@/logger';
import { steamcmdDownloadGame } from '@/updater';
import { getLastSteamUpdateCheck, hasSteamUpdate } from '@/updater/steam';
import { on } from 'events';
import { z } from 'zod/v4';
import { serverEvents } from '../events';
import type Webserver from '../index';
import { getContextDeps, protectedProcedure, router } from '../trpc';

let _server: Webserver | null = null;
export function setWebserver(s: Webserver) {
  _server = s;
}

const autoRestartConfigSchema = z.object({
  type: z.literal('autoRestartConfig'),
  maxUptime: z.number(),
  maxUptimeEnabled: z.boolean(),
  emptyUptime: z.number(),
  emptyUptimeEnabled: z.boolean(),
  dailyHour: z.number(),
  dailyHourEnabled: z.boolean(),
  announcementEnabled: z.boolean(),
  playersEnabled: z.boolean(),
  saveWorld: z.boolean(),
  autoUpdateEnabled: z.boolean(),
  autoUpdateIntervalMins: z.number(),
  crashRestartEnabled: z.boolean(),
});

export const serverRouter = router({
  server: router({
    autoRestart: router({
      get: protectedProcedure('server.autorestart.get').query(async () => {
        const { database } = getContextDeps();
        return await database.getAutoRestartConfig();
      }),

      set: protectedProcedure('server.autorestart.set')
        .input(autoRestartConfigSchema)
        .mutation(async ({ input: config }) => {
          const { database } = getContextDeps();

          if (
            typeof config !== 'object' ||
            !Object.entries({
              type: 'string',
              maxUptime: 'number',
              maxUptimeEnabled: 'boolean',
              emptyUptime: 'number',
              emptyUptimeEnabled: 'boolean',
              dailyHour: 'number',
              dailyHourEnabled: 'boolean',
              announcementEnabled: 'boolean',
              playersEnabled: 'boolean',
              saveWorld: 'boolean',
              autoUpdateEnabled: 'boolean',
              autoUpdateIntervalMins: 'number',
              crashRestartEnabled: 'boolean',
            }).every(
              ([k, v]) =>
                k in config &&
                typeof config[k as keyof typeof config] === v &&
                !Number.isNaN(config[k as keyof typeof config]),
            ) ||
            config.type !== 'autoRestartConfig'
          )
            return false;

          await database.setAutoRestartConfig(config);
          return true;
        }),
    }),

    status: protectedProcedure('server.status').query(() => {
      return _server?.lastReportedStatus ?? null;
    }),

    started: protectedProcedure('server.started').query(() => {
      const { omegga } = getContextDeps();
      return {
        started: omegga.started,
        starting: omegga.starting,
        stopping: omegga.stopping,
      };
    }),

    start: protectedProcedure('server.start').mutation(async ({ ctx }) => {
      const { omegga } = getContextDeps();
      if (omegga.starting || omegga.stopping || omegga.started) return;
      ctx.log('Starting server...');
      await omegga.start();
    }),

    stop: protectedProcedure('server.stop').mutation(async ({ ctx }) => {
      const { omegga } = getContextDeps();
      if (omegga.starting || omegga.stopping || !omegga.started) return;
      ctx.log('Stopping server...');
      await omegga.stop();
    }),

    restart: protectedProcedure('server.restart').mutation(async ({ ctx }) => {
      const { database, omegga } = getContextDeps();
      if (omegga.starting || omegga.stopping) return;

      try {
        const config = await database.getAutoRestartConfig();
        await omegga.saveServer({
          players: config.playersEnabled,
          saveWorld: config.saveWorld ?? true,
          announcement: config.announcementEnabled,
        });
      } catch (err) {
        ctx.error('Error while saving server setup', err);
      }

      database.addChatLog('server', {}, 'Restarting in 5 seconds...');
      Logger.logp('Restarting in 5 seconds...');
      omegga.broadcast(
        `<size="20">Server restart in <b><color="ffffbb">${5} seconds</></></>`,
      );

      await new Promise(resolve => setTimeout(resolve, 5000));
      await omegga.restartServer();
    }),

    update: router({
      check: protectedProcedure('server.update.check').query(async () => {
        const { omegga } = getContextDeps();
        if (!omegga.config.__STEAM) return null;

        const lastUpdate = getLastSteamUpdateCheck();
        if (Date.now() - lastUpdate.attempt < 1000 * 5) {
          Logger.verbose('[rpc] Using cached steam update check');
          return lastUpdate.result;
        }

        Logger.verbose('[rpc] Checking for steam update');
        return await hasSteamUpdate(omegga.config.server?.steambeta);
      }),

      run: protectedProcedure('server.update.run').mutation(async ({ ctx }) => {
        const { omegga } = getContextDeps();
        if (!omegga.config.__STEAM) return false;
        if (omegga.stopping || omegga.starting) return false;

        const wasStarted = omegga.started;
        if (wasStarted) {
          ctx.log('Stopping server to update...');
          await omegga.stop();
        }

        ctx.log('Updating server...');
        let ok = false;
        try {
          steamcmdDownloadGame({
            steambeta: omegga.config.server?.steambeta,
            steambetaPassword: omegga.config.server?.steambetaPassword,
          });
          ok = true;
          ctx.log('Server updated successfully');
        } catch (err) {
          ctx.error('Error updating server', err);
        }

        if (wasStarted) {
          ctx.log('Starting server...');
          await omegga.start();
        }

        return ok;
      }),
    }),

    onStatus: protectedProcedure('server.onStatus').subscription(
      async function* ({ signal }) {
        for await (const [_] of on(serverEvents, 'serverStatus', { signal })) {
          const { omegga } = getContextDeps();
          yield {
            started: omegga.started,
            starting: omegga.starting,
            stopping: omegga.stopping,
          };
        }
      },
    ),

    onHeartbeat: protectedProcedure('server.onHeartbeat').subscription(
      async function* ({ signal }) {
        for await (const [status] of on(serverEvents, 'heartbeat', {
          signal,
        })) {
          yield status;
        }
      },
    ),
  }),
});
