const path = require('path');
const http = require('http');
const https = require('https');

const express = require('express');
const expressSession = require('express-session');
const NedbStore = require('nedb-session-store')(expressSession);
const SocketIo = require('socket.io');
const bodyParser = require('body-parser');

const util = require('./util.js');
const setupApi = require('./api.js');
const setupMetrics = require('./metrics.js');
const Database = require('./database.js');

const soft = require('../../softconfig.js');

// path to assets folder
const ASSET_PATH = path.join(__dirname, '../frontend/assets');

// path to frontend directory
const FRONTEND_PATH = path.join(__dirname, '../frontend');

// path to webpacked data
const PUBLIC_PATH = path.join(__dirname, '../../../public');

const log = (...args) => global.Omegga.log(...args);
const error = (...args) => global.Omegga.error(...args);

// the webserver servers an authenticated
class Webserver {
  #database = undefined;

  // create a webserver
  constructor(options, omegga) {
    this.port = options.port || process.env.PORT || soft.DEFAULT_PORT;
    this.options = options;
    this.omegga = omegga;
    this.dataPath = path.join(omegga.path, soft.DATA_PATH);

    // the database provides omegga with metrics, chat logs, and more
    // to help administrators keep track of their users and server
    this.database = new Database(options, omegga);

    // https status of the server
    this.https = false;
    // started status of the server
    this.started = false;
    this.created = this.createServer();
  }

  // create the webserver
  async createServer() {
    const hasOpenSSL = require('hasbin').sync('openssl');

    // let the database do migrations
    await this.database.doMigrations();

    // create express app
    this.app = express();

    // create a server with https if applicable
    const pickProtocol = async () => {
      if (this.options.https) {
        if (hasOpenSSL) {
          const certFile = await util.getSSLKeys(this.dataPath);
          if (certFile) {
            // handy notification of generated ssl certs
            if (certFile.new)
              log('>>'.green, 'Generated new SSL certificate');

            this.https = true;
            return https.createServer({
              key: certFile.keys.serviceKey,
              cert: certFile.keys.certificate,
            }, this.app);
          } else {
            error('!>'.red, 'Error generating SSL certificate - falling back to http');
          }
        }

        // warn the user
        log(':>'.yellow, 'Running web server with http - install ', 'openssl'.yellow.underline, ' for https (more secure)');
      }

      // fallback to http
      return http.Server(this.app);
    };

    // create http(s) server based on openssl availability
    this.server = await pickProtocol();

    this.app.set('trust proxy', 1);
    const session = expressSession({
      secret: util.getSessionSecret(this.dataPath),
      resave: false,
      saveUninitialized: false,
      cookie: {
        path: '/',
        secure: this.https,
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
      },
      // use a nedb database for session store
      store: new NedbStore({
        filename: path.join(this.dataPath, soft.SESSION_STORE)
      }),
    });
    this.app.use(session);

    // setup routes and webserver
    await this.initWebUI(session);
    return true;
  }

  // setup the web ui routes
  async initWebUI(session) {
    const io = SocketIo(this.server);
    this.io = io;

    await this.database.getInstanceId();

    // use the session middleware
    io.use((socket, next) => {
      session(socket.request, socket.request.res || {}, async () => {
        // check if user is authenticated
        const user = await this.database.findUserById(socket.request.session.userId);
        if (user && !user.isBanned) {
          // TODO: check if user is banned while connected to disconnect websocket
          socket.user = user;
          next();
        } else {
          next(new Error('unauthorized'));
        }
      });
    });

    // provide assets in the /public path
    this.app.use('/public', express.static(PUBLIC_PATH));
    this.app.use('/public', express.static(ASSET_PATH));
    this.app.use(bodyParser.json());

    this.rooms = ['chat'];

    // setup the api
    setupApi(this, io);

    // setup metrics and tracking
    setupMetrics(this, io);

    // every request goes through the index file (frontend handles 404s)
    this.app.use(async (req, res) => {
      const user = await this.database.findUserById(req.session.userId);
      const isAuth = user && !user.isBanned;

      if (isAuth) {
        res.sendFile(path.join(FRONTEND_PATH, 'app.html'));
      } else {
        res.sendFile(path.join(FRONTEND_PATH, 'auth.html'));
      }
    });
  }

  // start the webserver
  async start() {
    if (this.started) return;
    await this.created;
    return await new Promise(resolve => {
      this.server.listen(this.port, () => {
        log(`${'>>'.green} Started webserver at`, `http${this.https ? 's' : ''}://127.0.0.1:${this.port}`.green);
        this.started = true;
        resolve();
      });
    });
  }

  // stop the webserver
  stop() {
    this.server.close();
    this.started = false;
    clearInterval(this.serverStatusInterval);
  }
}

module.exports = Webserver;