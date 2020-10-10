const express = require('express');

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

  // register routes
  server.app.use('/api/v1', openApi);
  server.app.use('/api/v1', api);
};