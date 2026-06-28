import Player from '@omegga/player';
import { rgbToHex } from '@util/color';
import { parseBrickadiaTime } from '@util/time';
import * as uuid from '@util/uuid';
import _ from 'lodash';
import { z } from 'zod/v4';
import { ScopeName } from '../scopes';
import { getContextDeps, protectedProcedure, router } from '../trpc';
import { waitForEvent } from '../util';

export const playerRouter = router({
  player: router({
    list: protectedProcedure(ScopeName.PlayerList)
      .input(
        z.object({
          page: z.number().optional().default(0),
          search: z.string().optional().default(''),
          sort: z.string().optional().default('name'),
          direction: z.number().optional().default(1),
          filter: z.string().optional().default(''),
        }),
      )
      .query(async ({ input }) => {
        const { database, omegga } = getContextDeps();
        const { page, search, sort, direction, filter } = input;
        const banList = (omegga.getBanList() || { banList: {} }).banList;
        const now = Date.now();
        let limitId: string[] | undefined;
        if (filter === 'banned') {
          limitId = Object.keys(banList).filter(
            b =>
              banList[b].expires <= banList[b].created ||
              parseBrickadiaTime(banList[b].expires) > Date.now(),
          );
        }
        const resp = await database.getPlayers({
          page,
          search,
          sort,
          direction,
          limitId,
        });
        const players = resp.players.map(player => {
          const foundBan = banList[player.id];
          let ban: {
            bannerId: string;
            reason: string;
            created: number;
            expires: number;
            duration: number;
            remainingTime: number;
            bannerName: string;
          } | null = null;
          if (foundBan) {
            const created = parseBrickadiaTime(foundBan.created);
            const expires = parseBrickadiaTime(foundBan.expires);
            const duration = expires - created;
            if (!(expires < now && duration > 0)) {
              ban = {
                bannerId: foundBan.bannerId,
                reason: foundBan.reason,
                created,
                expires,
                duration,
                remainingTime: expires - now,
                bannerName: _.get(
                  omegga.getNameCache(),
                  ['savedPlayerNames', foundBan.bannerId],
                  '',
                ),
              };
            }
          }
          return {
            ...player,
            seenAgo: now - player.lastSeen,
            createdAgo: now - player.created,
            ban,
          };
        });
        return { ...resp, players };
      }),

    get: protectedProcedure(ScopeName.PlayerGet)
      .input(z.string())
      .query(async ({ input: id }) => {
        const { database, omegga } = getContextDeps();
        const entry = await database.getPlayer(id);
        if (!entry) return null;
        const now = Date.now();
        const nameHistory = entry.nameHistory.map(n => ({
          ...n,
          ago: now - n.date,
        }));
        const banHistory = entry.banHistory.map(b => ({
          ...b,
          duration: (b.expires as number) - (b.created as number),
          bannerName: _.get(
            omegga.getNameCache(),
            ['savedPlayerNames', b.bannerId],
            '',
          ) as string,
        }));
        const kickHistory = entry.kickHistory.map(b => ({
          ...b,
          kickerName: _.get(
            omegga.getNameCache(),
            ['savedPlayerNames', b.kickerId],
            '',
          ) as string,
        }));
        const playerRoles = Player.getRoles(omegga, id) || [];
        const { roles: serverRoles = [] } = omegga.getRoleSetup() ?? {};
        const foundBan = (omegga.getBanList() || { banList: {} }).banList[id];
        let currentBan: {
          bannerId: string;
          reason: string;
          created: number;
          expires: number;
          duration: number;
          remainingTime: number;
          bannerName: string;
        } | null = null;
        if (foundBan) {
          const created = parseBrickadiaTime(foundBan.created);
          const expires = parseBrickadiaTime(foundBan.expires);
          const duration = expires - created;
          if (!(expires < now && duration > 0)) {
            currentBan = {
              bannerId: foundBan.bannerId,
              reason: foundBan.reason,
              created,
              expires,
              duration,
              remainingTime: expires - now,
              bannerName: _.get(
                omegga.getNameCache(),
                ['savedPlayerNames', foundBan.bannerId],
                '',
              ),
            };
          }
        }
        return {
          ...entry,
          nameHistory,
          banHistory,
          kickHistory,
          seenAgo: now - entry.lastSeen,
          createdAgo: now - entry.created,
          isHost: omegga.getHostId() === id,
          isOnline: omegga.players.some(p => p.id === id),
          currentBan,
          roles: playerRoles.map(r => {
            let color = 'ffffff';
            const role = serverRoles.find(
              sr => sr.name.toLowerCase() === r.toLowerCase(),
            );
            if (role && role.bHasColor) color = rgbToHex(role.color);
            return { name: r, color };
          }),
        };
      }),

    ban: protectedProcedure(ScopeName.PlayerBan)
      .input(
        z.object({
          id: z.string(),
          duration: z.number().optional().default(-1),
          reason: z.string().max(128).optional().default('No Reason'),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database, omegga } = getContextDeps();
        const { id, duration } = input;
        let { reason } = input;
        if (typeof duration !== 'number') return false;
        if (!uuid.match(id)) return false;
        reason = reason.replace(/\n/g, ' ').replace(/"/g, "'");
        ctx.log(
          'Banning player',
          omegga.getNameCache()?.savedPlayerNames?.[id].yellow ??
            'with id ' + id.yellow,
        );
        omegga.writeln(
          `${omegga.Console.Chat.Command} /Ban "${id}" ${duration} "${reason}"`,
        );
        const ban = await waitForEvent(database, 'update.bans', () => {
          const banList = (omegga.getBanList() || { banList: {} }).banList;
          if (!banList[id]) return false;
          return banList[id];
        });
        if (ban) {
          database.upsertBanHistory({
            banned: id,
            bannerId: null,
            created: parseBrickadiaTime(ban.created),
            expires: parseBrickadiaTime(ban.expires),
            reason: ban.reason,
          });
        }
        return !!ban;
      }),

    kick: protectedProcedure(ScopeName.PlayerKick)
      .input(
        z.object({
          id: z.string(),
          reason: z.string().max(128).optional().default('No Reason'),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const { database, omegga } = getContextDeps();
        const { id } = input;
        let { reason } = input;
        if (!uuid.match(id)) return false;
        reason = reason.replace(/\n/g, ' ').replace(/"/g, "'");
        const player = omegga.players.find(p => p.id === id);
        if (!player) return false;
        ctx.log('Kicking player', player.name.yellow);
        omegga.writeln(
          `${omegga.Console.Chat.Command} /Kick "${id}" "${reason}"`,
        );
        const ok = await waitForEvent(
          omegga,
          'leave',
          (leavingPlayer: { id: string }) => leavingPlayer.id === id,
        );
        if (ok) {
          database.upsertKickHistory({
            kicked: id,
            kickerId: null,
            created: Date.now(),
            reason,
          });
        }
        return ok;
      }),

    unban: protectedProcedure(ScopeName.PlayerUnban)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { database, omegga } = getContextDeps();
        const { id } = input;
        if (!uuid.match(id)) return false;
        const banList = (omegga.getBanList() || { banList: {} }).banList;
        if (!banList[id]) return false;
        ctx.log(
          'Unbanning player',
          omegga.getNameCache()?.savedPlayerNames?.[id].yellow ??
            'with id ' + id.yellow,
        );
        omegga.writeln(`${omegga.Console.Chat.Command} /Unban "${id}"`);
        const ok = await waitForEvent(database, 'update.bans', () => {
          const banList = (omegga.getBanList() || { banList: {} }).banList;
          return (
            !banList[id] || parseBrickadiaTime(banList[id].expires) < Date.now()
          );
        });
        return ok;
      }),

    clearBricks: protectedProcedure(ScopeName.PlayerClearBricks)
      .input(z.object({ id: z.string() }))
      .mutation(async ({ input, ctx }) => {
        const { omegga } = getContextDeps();
        const { id } = input;
        if (!uuid.match(id)) return false;
        ctx.log(
          'Clearing bricks for player',
          omegga.getNameCache()?.savedPlayerNames?.[id]?.yellow ??
            'with id ' + id.yellow,
        );
        omegga.writeln(`${omegga.Console.Bricks.Clear} "${id}"`);
        return true;
      }),

    roles: router({
      list: protectedProcedure(ScopeName.PlayerList).query(() => {
        const { omegga } = getContextDeps();
        return _.sortBy(omegga.getRoleSetup()?.roles ?? [], p =>
          p.name.toLowerCase(),
        );
      }),
    }),
  }),
});
