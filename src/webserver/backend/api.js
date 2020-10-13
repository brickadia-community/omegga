const express = require('express');

const { JSONRPCServer, JSONRPCClient, JSONRPCServerAndClient } = require('json-rpc-2.0');

const { chat: { sanitize } } = require('../../util/index.js');

module.exports = (server, io) => {
  const { database } = server;

  // open API is accessible without auth
  const openApi = express.Router();
  const api = express.Router();

  // check if this is the first user in the database
  openApi.get('/first', async (req, res) =>
    res.json(await database.isFirstUser()));

  // login / create admin user route
  openApi.post('/auth', async (req, res) => {
    // body is username and password
    if (typeof req.body !== 'object' ||
      typeof req.body.username !== 'string' || typeof req.body.password !== 'string') {
      return res
        .status(422)
        .json({message: 'invalid body'});
    }
    const { username, password } = req.body;

    // username regex
    if (!username.match(/^\w{0,32}$/)) {
      return res
        .status(422)
        .json({message: 'invalid body'});
    }

    // if this is the first user, create it as the admin user
    const isFirst = await database.isFirstUser();
    let user;
    if (isFirst) {
      user = await database.createAdminUser(username, username === '' ? '' : password);
    } else {
      user = await database.authUser(username, password);
    }

    if (user) {
      req.session.userId = user._id;
      req.session.save();
      res.status(200).json({});
    } else {
      res.status(404).json({message: 'no user found'});
    }
  });

  // kill a session
  api.get('/logout', (req, res) => {
    req.session.destroy(e => {
      res.status(e ? 500 : 200).json({});
    });
  });

  // authentication middleware for api
  api.all(async (req, res, next) => {
    const user = await database.findUserById(req.session.userId);
    if (!user || user.isBanned)
      return next(new Error('unauthorized'));
    req.user = user;
    next();
  });

  // websocket data
  io.on('connection', socket => {
    // let this user receive messages directed to this user
    socket.join('user:' + socket.user._id);

    database.getRoles().then(roles => {
      socket.emit('data', {
        roles,
        canLogOut: socket.user.username !== '',
        now: Date.now(), // this can be used for the frontend to anticipate drift
        user: {
          username: socket.user.username || 'Admin',
          isOwner: socket.user.isOwner,
          roles: socket.user.roles,
        },
      });
    });

    // rpc connection
    const rpcServer = new JSONRPCServer();
    const rpcClient = new JSONRPCClient(async data =>
      socket.emit('rpc', data));
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
    rpc.addMethod('chat', async ([message]) => {
      if (typeof message !== 'string') return;
      if (message.length > 140)
        message = message.slice(0, 140);

      // create fake user
      const user = {
        name: socket.user.username || 'Admin',
        id: socket.user.playerId,
        color: 'ff00ff',
        web: true,
      };

      // create database entry, send to web ui
      io.to('chat').emit('chat', await database.addChatLog('msg', user, message));

      // broadcast to chat
      server.omegga.broadcast(`"[<b><color=\\"ff00ff\\">${user.name}</></>]: ${sanitize(message)}"`);

      // broadcast to terminal
      Omegga.log(`[${user.name.brightMagenta.underline}]: ${message}`);

      return 'ok';
    });

    // send recent chat messages
    // TODO: add permission check
    rpc.addMethod('chat.recent', () => {
      return database.getRecentChats();
    });

    // subscribe and unsubscribe to events
    socket.on('subscribe', room => {
      // TODO: permission check for certain rooms
      if(server.rooms.includes(room)) {
        socket.join(room);
      }
    });
    socket.on('unsubscribe', room => {
      if(server.rooms.includes(room))
        socket.leave(room);
    });

    socket.on('disconnect', () => {
    });
  });

  // register routes
  server.app.use('/api/v1', openApi);
  server.app.use('/api/v1', api);
};