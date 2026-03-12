import { z } from 'zod/v4';
import { on } from 'events';
import { router, protectedProcedure, getContextDeps } from '../trpc';
import { serverEvents } from '../events';
import Logger from '@/logger';
import { parseLinks, sanitize } from '@util/chat';

export const chatRouter = router({
  chat: router({
    send: protectedProcedure('chat.send')
      .input(z.string())
      .mutation(async ({ input: message, ctx }) => {
        const { database, omegga } = getContextDeps();

        if (typeof message !== 'string') return;
        if (message.length > 140) message = message.slice(0, 140);

        const user = {
          name: ctx.user.username || 'Admin',
          id: ctx.user.playerId,
          color: 'ff00ff',
          web: true,
        };

        const chatLog = await database.addChatLog('msg', user, message);
        serverEvents.emit('chat', chatLog);

        omegga.broadcast(
          `"[<b><color=\\"ff00ff\\">${user.name}</></>]: ${parseLinks(sanitize(message))}"`,
        );
        Logger.log(
          `[${user.name.brightMagenta.underline}]: ${message}`,
        );

        return 'ok';
      }),

    recent: protectedProcedure('chat.recent').query(() => {
      const { database } = getContextDeps();
      return database.getChats({ sameServer: true });
    }),

    history: protectedProcedure('chat.history')
      .input(
        z.object({
          after: z.number().optional(),
          before: z.number().optional(),
        }),
      )
      .query(({ input }) => {
        const { database } = getContextDeps();
        return database.getChats({ after: input.after, before: input.before });
      }),

    calendar: protectedProcedure('chat.calendar').query(() => {
      const { database } = getContextDeps();
      return database.calendar.years;
    }),

    onMessage: protectedProcedure('chat.onMessage').subscription(
      async function* ({ signal }) {
        for await (const [chatLog] of on(serverEvents, 'chat', {
          signal,
        })) {
          yield chatLog;
        }
      },
    ),
  }),
});
