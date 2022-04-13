import Player from '@omegga/player';
import { Plugin } from '@omegga/plugin';
import { parseLinks, sanitize } from '@util/chat';
import { rgbToHex } from '@util/color';
import { parseBrickadiaTime } from '@util/time';
import * as uuid from '@util/uuid';
import express from 'express';
import {
  JSONRPCClient,
  JSONRPCServer,
  JSONRPCServerAndClient,
} from 'json-rpc-2.0';
import _ from 'lodash';
const pkg = require('../../../package.json');
import type Webserver from './index';
import {
  IFrontendBanEntry,
  IPlayer,
  IStoreBanHistory,
  IStoreKickHistory,
  IStoreUser,
  IUserAgo,
  IUserHistory,
  IUserNote,
  OmeggaSocketIo,
} from './types';

export default function (server: Webserver, io: OmeggaSocketIo) {
  const { database, omegga } = server;

  // open API is accessible without auth
  const openApi = express.Router();
  const api = express.Router();

  // check if this is the first user in the database
  openApi.get('/first', async (req, res) =>
    res.json(await database.isFirstUser())
  );

  // login / create admin user route
  openApi.post('/auth', async (req, res) => {
    // body is username and password
    if (
      typeof req.body !== 'object' ||
      typeof req.body.username !== 'string' ||
      typeof req.body.password !== 'string'
    ) {
      return res.status(422).json({ message: 'invalid body' });
    }
    const { username, password } = req.body;

    // username regex
    if (!username.match(/^\w{0,32}$/)) {
      return res.status(422).json({ message: 'invalid body' });
    }

    // if this is the first user, create it as the admin user
    const isFirst = await database.isFirstUser();
    let user;
    if (isFirst) {
      user = await database.createAdminUser(
        username,
        username === '' ? '' : password
      );
    } else {
      user = await database.authUser(username, password);
    }

    if (user) {
      req.session.userId = user._id;
      req.session.save();
      res.status(200).json({});
    } else {
      res.status(404).json({ message: 'no user found' });
    }
  });

  // kill a session
  api.get('/logout', (req, res) => {
    req.session.destroy(e => {
      res.status(e ? 500 : 200).json({});
    });
  });

  // authentication middleware for api
  api.all('*', (req, _res, next) => {
    (async () => {
      const user = await database.findUserById(req.session.userId);
      if (!user || user.isBanned) return next(new Error('unauthorized'));
      // req.user = user;

      next();
    })();
  });

  // websocket data
  io.on('connection', socket => {
    // let this user receive messages directed to this user
    socket.join('user:' + socket.data.user._id);

    database.getRoles().then(roles => {
      socket.emit('data', {
        roles,
        version: pkg.version,
        canLogOut: socket.data.user.username !== '',
        now: Date.now(), // this can be used for the frontend to anticipate drift
        userless: !socket.data.user.username,
        user: {
          username: socket.data.user.username || 'Admin',
          isOwner: socket.data.user.isOwner,
          roles: socket.data.user.roles,
        },
      });
    });

    // logging for this user in the console for web ui actions
    const usernameText = `[${
      (socket.data.user.username || 'Admin').brightMagenta
    }]`;
    const log = (...args: any[]) =>
      global.Omegga.log('>>'.green, usernameText, ...args);
    const error = (...args: any[]) =>
      global.Omegga.error('!>'.red, usernameText, ...args);

    // rpc connection
    const rpcServer = new JSONRPCServer();
    const rpcClient = new JSONRPCClient(async (data: any) => {
      socket.emit('rpc', data);
    });
    const rpc = new JSONRPCServerAndClient(rpcServer, rpcClient);
    socket.on('rpc', data => {
      if (data && typeof data === 'object') {
        try {
          rpc.receiveAndSend(data);
        } catch (e) {
          // silently discard broken rpc requests
        }
      }
    });

    // send chat message from web ui
    // TODO: check if this user has a role with permission to chat
    rpc.addMethod('chat', async ([message]: [string]) => {
      if (typeof message !== 'string') return;
      if (message.length > 140) message = message.slice(0, 140);

      // create fake user
      const user = {
        name: socket.data.user.username || 'Admin',
        id: socket.data.user.playerId,
        color: 'ff00ff',
        web: true,
      };

      // create database entry, send to web ui
      io.to('chat').emit(
        'chat',
        await database.addChatLog('msg', user, message)
      );

      // broadcast to chat
      server.omegga.broadcast(
        `"[<b><color=\\"ff00ff\\">${user.name}</></>]: ${parseLinks(
          sanitize(message)
        )}"`
      );

      // broadcast to terminal
      Omegga.log(`[${user.name.brightMagenta.underline}]: ${message}`);

      return 'ok';
    });

    // read recent chat messages
    // TODO: add permission check
    rpc.addMethod('chat.recent', () => {
      return database.getChats({ sameServer: true });
    });

    // find chat messages after a certain time
    // TODO: add permission check
    rpc.addMethod(
      'chat.history',
      ([{ after, before }]: [{ after?: number; before?: number }]) => {
        return database.getChats({ after, before });
      }
    );

    // see what days chat messages were sent
    // TODO: add permission check
    rpc.addMethod('chat.calendar', () => {
      return database.calendar.years;
    });

    // get the list of plugins
    // TODO: add permission check
    rpc.addMethod('plugins.list', () => {
      return _.sortBy(
        omegga.pluginLoader.plugins.map(p => ({
          name: p.getName(),
          documentation: p.getDocumentation(),
          path: p.shortPath,
          isLoaded: p.isLoaded(),
          isEnabled: p.isEnabled(),
        })),
        p => p.name.toLowerCase()
      );
    });

    // get information on a specific plugin
    // TODO: add permission check
    rpc.addMethod('plugin.get', async ([shortPath]: [string]) => {
      const plugin = omegga.pluginLoader.plugins.find(
        p => p.shortPath === shortPath
      );
      if (!plugin) return null;

      // get the plugin configs
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
    });

    // get a paginated list of players
    // TODO: add permission check
    rpc.addMethod(
      'players.list',
      async ([
        {
          page = 0,
          search = '',
          sort = 'name',
          direction = '1',
          filter = '',
        } = {},
      ]: [
        {
          page?: number;
          search?: string;
          sort?: string;
          direction?: string;
          filter?: string;
        }
      ]) => {
        const banList = (omegga.getBanList() || { banList: {} }).banList;

        // get the ban list
        const now = Date.now();

        let limitId;

        // if the filter is set to banned players only, limit player results by ids in the current ban list
        if (filter === 'banned') {
          limitId = Object.keys(banList).filter(
            b =>
              banList[b].expires <= banList[b].created ||
              parseBrickadiaTime(banList[b].expires) > Date.now()
          );
        }

        const resp: {
          pages: number;
          total: number;
          players: (IUserHistory & IUserAgo & { ban?: IFrontendBanEntry })[];
        } = await database.getPlayers({
          page,
          search,
          sort,
          direction,
          limitId,
        });

        for (const player of resp.players) {
          player.seenAgo = now - player.lastSeen;
          player.createdAgo = now - player.created;

          const foundBan = banList[player.id];
          if (foundBan) {
            const created = parseBrickadiaTime(foundBan.created);
            const expires = parseBrickadiaTime(foundBan.expires);

            // create a clone of the object
            let currentBan: IFrontendBanEntry = {
              ...foundBan,
              // parse the times in the current ban
              created,
              expires,
              duration: expires - created,
              remainingTime: expires - now,

              // lookup banner name
              bannerName: _.get(
                omegga.getNameCache(),
                ['savedPlayerNames', foundBan.bannerId],
                ''
              ),
            };

            // if the ban is expired, it should not be listed
            if (currentBan.expires < now && currentBan.duration > 0)
              currentBan = null;
            player.ban = currentBan;
          }
        }
        return resp;
      }
    );

    // get a specific player's info
    // TODO: add permission check
    rpc.addMethod('player.get', async ([id]: [string]) => {
      const entry: Omit<IUserHistory, 'nameHistory'> & {
        banHistory: (IStoreBanHistory & {
          duration?: number;
          bannerName?: string;
        })[];
        kickHistory: (IStoreKickHistory & { kickerName?: string })[];
        notes: IUserNote[];
        nameHistory: { name: string; date: number; ago?: number }[];
      } & IUserAgo = await database.getPlayer(id);
      if (!entry) return null;
      const now = Date.now();

      entry.seenAgo = now - entry.lastSeen;
      entry.createdAgo = now - entry.created;
      for (const n of entry.nameHistory) n.ago = now - n.date;

      // combine player roles with server roles
      const playerRoles = Player.getRoles(omegga, id) || [];
      const { roles: serverRoles } = omegga.getRoleSetup();

      // Get banner name and duration from list of bans
      for (const b of entry.banHistory) {
        b.duration = b.expires - b.created;
        // lookup banner name
        b.bannerName = _.get(
          omegga.getNameCache(),
          ['savedPlayerNames', b.bannerId],
          ''
        );
      }

      // Get kicker name from list of kicks
      for (const b of entry.kickHistory) {
        // lookup banner name
        b.kickerName = _.get(
          omegga.getNameCache(),
          ['savedPlayerNames', b.kickerId],
          ''
        );
      }

      const foundBan = (omegga.getBanList() || { banList: {} }).banList[id];
      let currentBan: IFrontendBanEntry = null;

      if (foundBan) {
        // parse the times in the current ban
        const created = parseBrickadiaTime(foundBan.created);
        const expires = parseBrickadiaTime(foundBan.expires);
        // create a clone of the object
        currentBan = {
          ...foundBan,
          created,
          expires,
          duration: expires - created,
          remainingTime: expires - now,
          // lookup banner name
          bannerName: _.get(
            omegga.getNameCache(),
            ['savedPlayerNames', foundBan.bannerId],
            ''
          ),
        };

        // if the ban is expired, it should not be listed
        if (currentBan.expires < now && currentBan.duration > 0)
          currentBan = null;
      }

      return {
        // database results
        ...entry,

        // player is host
        isHost: omegga.getHostId() === id,

        isOnline: omegga.players.some(p => p.id === id),

        // player's current ban state
        currentBan,

        // all player's roles  w/ colors
        roles: playerRoles.map(r => {
          // default role color is white
          let color = 'ffffff';

          // find the role (if it exists) and get the color
          const role = serverRoles.find(
            sr => sr.name.toLowerCase() === r.toLowerCase()
          );
          if (role && role.bHasColor) color = rgbToHex(role.color);

          return {
            name: r,
            color: color,
          };
        }),
      };
    });

    rpc.addMethod(
      'player.ban',
      async ([id, duration = -1, reason = 'No Reason']: [
        id: string,
        duration: number,
        reason: string
      ]) => {
        // validate inputs
        if (typeof duration !== 'number') return false;
        if (typeof id !== 'string' || !uuid.match(id)) return false;
        if (typeof reason !== 'string' || reason.length > 128) return false;
        reason = reason.replace(/\n/g, ' ').replace(/"/g, "'");
        log(
          'Banning player',
          omegga.getNameCache()?.savedPlayerNames?.[id].yellow ??
            'with id ' + id.yellow
        );
        // ban the user
        omegga.writeln(`Chat.Command /Ban "${id}" ${duration} "${reason}"`);
        let listener;

        // wait for the ban to update
        const ok = await Promise.race([
          new Promise(resolve => {
            database.on(
              'update.bans',
              (listener = () => {
                const banList = (omegga.getBanList() || { banList: {} })
                  .banList;
                if (banList[id]) {
                  const entry: IStoreBanHistory = {
                    type: 'banHistory',
                    banned: id,
                    bannerId: null,
                    created: parseBrickadiaTime(banList[id].created),
                    expires: parseBrickadiaTime(banList[id].expires),
                    reason: banList[id].reason,
                  };

                  database.stores.players.update(
                    entry,
                    { $set: entry },
                    { upsert: true }
                  );

                  resolve(true);
                }
              })
            );
          }),
          new Promise(resolve => setTimeout(() => resolve(false), 5000)),
        ]);
        database.off('update.bans', listener);
        return ok;
      }
    );

    rpc.addMethod(
      'player.kick',
      async ([id, reason = 'No Reason']: [id: string, reason: string]) => {
        // validate inputs
        if (typeof id !== 'string' || !uuid.match(id)) return false;
        if (typeof reason !== 'string' || reason.length > 128) return false;
        reason = reason.replace(/\n/g, ' ').replace(/"/g, "'");

        // ensure player exists
        const player = omegga.players.find(p => p.id === id);
        if (!player) return false;

        log('Kicking player', player.name.yellow);

        // kick the user
        omegga.writeln(`Chat.Command /Kick "${id}" "${reason}"`);

        // wait for the player to disconnect
        const ok = await Promise.race([
          new Promise(resolve => {
            this.omegga.once('leave', async (leavingPlayer: IPlayer) => {
              if (leavingPlayer.id === id) {
                resolve(true);

                // add kick to database
                const entry: IStoreKickHistory = {
                  type: 'kickHistory',
                  kicked: id,
                  kickerId: null,
                  created: Date.now(),
                  reason,
                };

                await database.stores.players.update(
                  entry,
                  { $set: entry },
                  { upsert: true }
                );
              }
            });
          }),
          new Promise(resolve => setTimeout(() => resolve(false), 5000)),
        ]);

        return ok;
      }
    );

    rpc.addMethod('player.unban', async ([id]: [id: string]) => {
      // validate inputs
      if (typeof id !== 'string' || !uuid.match(id)) return false;

      // check if user is banned
      const banList = (omegga.getBanList() || { banList: {} }).banList;
      if (!banList[id] || parseBrickadiaTime(banList[id].expires) < Date.now())
        return false;

      log(
        'Unbanning player',
        omegga.getNameCache()?.savedPlayerNames?.[id].yellow ??
          'with id ' + id.yellow
      );

      // unban the user
      omegga.writeln(`Chat.Command /Unban "${id}"`);
      let listener;

      // wait for the ban to update
      const ok = await Promise.race([
        new Promise(resolve => {
          database.on(
            'update.bans',
            (listener = () => {
              const banList = (omegga.getBanList() || { banList: {} }).banList;
              if (
                !banList[id] ||
                parseBrickadiaTime(banList[id].expires) < Date.now()
              )
                resolve(true);
            })
          );
        }),
        new Promise(resolve => setTimeout(() => resolve(false), 5000)),
      ]);
      database.off('update.bans', listener);
      return ok;
    });

    rpc.addMethod('player.clearbricks', async ([id]: [id: string]) => {
      // validate inputs
      if (typeof id !== 'string' || !uuid.match(id)) return false;

      log(
        'Clearing bricks for player',
        omegga.getNameCache()?.savedPlayerNames?.[id]?.yellow ??
          'with id ' + id.yellow
      );

      // unban the user
      omegga.writeln(`Bricks.Clear "${id}"`);
      return true;
    });

    // set plugin config
    // TODO: add permission check
    rpc.addMethod(
      'plugin.config',
      async ([shortPath, config]: [string, Record<string, unknown>]) => {
        const plugin = omegga.pluginLoader.plugins.find(
          p => p.shortPath === shortPath
        );
        if (!plugin) return null;

        await plugin.storage.setConfig(config);
        // TODO: validate configs
        return true;
      }
    );

    // reload all plugins (and scan for new ones)
    // TODO: add permission check
    rpc.addMethod('plugins.reload', async () => {
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
    });

    // unload a plugin
    // TODO: add permission check
    rpc.addMethod('plugin.unload', async ([shortPath]: [string]) => {
      const plugin = omegga.pluginLoader.plugins.find(
        p => p.shortPath === shortPath
      );
      if (!plugin) return false;
      if (!plugin.isLoaded()) return false;
      log('Unloading'.red, 'plugin', plugin.getName().yellow);
      return await plugin.unload();
    });

    // load a plugin
    // TODO: add permission check
    rpc.addMethod('plugin.load', async ([shortPath]: [string]) => {
      const plugin = omegga.pluginLoader.plugins.find(
        p => p.shortPath === shortPath
      );
      if (!plugin) return false;
      if (plugin.isLoaded() || !plugin.isEnabled()) return false;
      log('Loading'.green, 'plugin', plugin.getName().yellow);
      return await plugin.load();
    });

    // enable/disable a plugin
    // TODO: add permission check
    rpc.addMethod(
      'plugin.toggle',
      ([shortPath, enabled]: [string, boolean]) => {
        if (typeof enabled !== 'boolean') return;
        const plugin = omegga.pluginLoader.plugins.find(
          p => p.shortPath === shortPath
        );
        if (!plugin) return false;
        try {
          plugin.setEnabled(enabled);
          log(
            enabled ? 'Enabled'.green : 'Disabled'.red,
            'plugin',
            plugin.getName().yellow
          );
          return true;
        } catch (e) {
          error(
            'Error',
            enabled ? 'enabling'.green : 'disabling'.red,
            'plugin',
            plugin.getName().yellow
          );
          return false;
        }
      }
    );

    // get a list of roles
    // TODO: add permission check
    rpc.addMethod('roles.list', () => {
      return _.sortBy(omegga.getRoleSetup().roles, p => p.name.toLowerCase());
    });

    // get a paginated list of users
    // TODO: add permission check
    rpc.addMethod(
      'users.list',
      async ([{ page = 0, search = '', sort = 'name', direction = '1' } = {}]: [
        {
          page?: number;
          search?: string;
          sort?: string;
          direction?: string;
        }
      ]) => {
        const resp: {
          pages: number;
          total: number;
          users: (IStoreUser & IUserAgo)[];
        } = await database.getUsers({ page, search, sort, direction });
        const now = Date.now();
        resp.users = resp.users.map(user => ({
          ...user,
          seenAgo: user.lastOnline ? now - user.lastOnline : Infinity,
          createdAgo: now - user.created,
        }));
        return resp;
      }
    );

    // create a new user (host only at the moment)
    // TODO: add permission check
    rpc.addMethod(
      'users.create',
      async ([username, password]: [string, string]) => {
        if (!socket.data.user.isOwner) return 'missing permission';

        // body is username and password
        if (typeof username !== 'string' || typeof password !== 'string')
          return 'username/password not a string';

        // validate username
        if (!username.match(/^\w{0,32}$/)) return 'username is not allowed';

        // this validation is here for _those_ people
        if (password.length === 0 || password.length > 128)
          return 'invalid password size';

        // set owner's credential as the first user
        if (socket.data.user.isOwner && socket.data.user.username === '') {
          // set the owner's username and password
          try {
            await database.stores.users.update(
              { _id: socket.data.user._id },
              {
                username,
                hash: await database.hash(password),
              }
            );
          } catch (e) {
            error('error setting owner password', e);
            return 'error setting owner password';
          }

          log(`created account as "${username.yellow}"`);

          // update
          return '';
        }

        // check if user exists
        if (await database.userExists(username)) return 'user already exists';

        try {
          await database.createUser(username, password);
        } catch (e) {
          error('error creating new user', e);
          return 'error creating new user';
        }

        log(`created new user "${username.yellow}"`);

        return '';
      }
    );

    // change a user's password
    // TODO: add permission check
    rpc.addMethod(
      'users.passwd',
      async ([username, password]: [string, string]) => {
        // the owner can change names and the user can change their own name
        if (!socket.data.user.isOwner && username !== socket.data.user.username)
          return 'missing permission';

        // body is username and password
        if (typeof username !== 'string' || typeof password !== 'string')
          return 'username/password not a string';

        // validate username
        if (!username.match(/^\w{0,32}$/)) return 'username is not allowed';

        // check if user exists
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
      }
    );

    // send server status at request
    // TODO: server status permission check
    rpc.addMethod('server.status', () => {
      return server.lastReportedStatus;
    });

    // get server run status
    // TODO: server status permission check
    rpc.addMethod('server.started', () => {
      return {
        started: omegga.started,
        starting: omegga.starting,
        stopping: omegga.stopping,
      };
    });

    // start the server if it's not already started
    // TODO: server status permission check
    rpc.addMethod('server.start', async () => {
      if (omegga.starting || omegga.stopping || omegga.started) return;
      log('Starting server...');
      await omegga.start();
    });

    // stop the server if it's not already stopped
    // TODO: server status permission check
    rpc.addMethod('server.stop', async () => {
      if (omegga.starting || omegga.stopping || !omegga.started) return;
      log('Stopping server...');
      await omegga.stop();
    });

    // restart the server if it's running, start the server if it's stopped
    // TODO: server status permission check
    rpc.addMethod('server.restart', async () => {
      if (omegga.starting || omegga.stopping) return;
      log('Restarting server...');
      if (omegga.started) await omegga.stop();
      await omegga.start();
    });

    // subscribe and unsubscribe to events
    socket.on('subscribe', room => {
      // TODO: permission check for certain rooms
      if (server.rooms.includes(room)) {
        socket.join(room);
      }
    });
    socket.on('unsubscribe', room => {
      if (server.rooms.includes(room)) socket.leave(room);
    });

    socket.on('disconnect', () => {});
  });

  // register routes
  server.app.use('/api/v1', openApi);
  server.app.use('/api/v1', api);
}
