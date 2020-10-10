const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

const express = require('express');
const expressSession = require('express-session');
const NedbStore = require('nedb-session-store')(expressSession);
const SocketIo = require('socket.io');
const bodyParser = require('body-parser');
const pem = require('pem').promisified;

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
  constructor(options, database, omegga) {
    this.port = options.port || process.env.PORT || soft.DEFAULT_PORT;
    this.options = options;
    this.database = database;
    this.omegga = omegga;
    this.dataPath = path.join(omegga.path, soft.DATA_PATH);

    this.https = false;
    this.created = this.createServer();
    this.started = false;
  }

  // create the webserver
  async createServer() {
    const hasOpenSSL = require('hasbin').sync('openssl');

    // create express app
    this.app = express();

    // create a server with https if applicable
    const pickProtocol = async () => {
      if (this.options.https) {
        if (hasOpenSSL) {
          const certFile = await this.getSSLKeys();
          if (certFile) {
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
      secret: this.getSessionSecret(),
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
    this.initWebUI(session);
    return true;
  }

  // generate SSL certs for the https server
  async getSSLKeys() {
    const certsPath = path.join(this.dataPath, soft.WEB_CERTS_DATA);
    let certData;
    const now = Date.now();

    // read cert data from json file
    if (fs.existsSync(certsPath)) {
      try {
        certData = JSON.parse(fs.readFileSync(certsPath, 'utf8'));

        // make sure the cert is not expired
        if (certData.expires < now)
          certData = undefined;
      } catch (e) {
        // nothing to do here - probably bad json
      }
    }

    // otherwise generate it
    if (!certData) {
      // expires in half the real duration time
      const days = 360;
      const expires = now + (days/2) * 24 * 60 * 60 * 1000;
      try {
        const keys = await pem.createCertificate({ days, selfSigned: true });
        certData = { keys, expires };

        fs.writeFileSync(certsPath, JSON.stringify(certData));
        log('>>'.green, 'Generated new SSL certificate');
      } catch (e) {
        // probably missing openssl or something
      }
    }

    return certData;
  }

  // generate a session secret for the cookies
  getSessionSecret() {
    const tokenPath = path.join(this.dataPath, soft.WEB_SESSION_TOKEN);
    const secretSize = 64;
    let secret;
    // read secret from file
    if (fs.existsSync(tokenPath)) {
      try {
        secret = fs.readFileSync(tokenPath, 'utf8');
      } catch (e) {
        // nothing to do here - probably file is a folder or something
      }
    }

    if (!secret) {
      // generate a new secret
      const buf = Buffer.alloc(secretSize);
      secret = crypto.randomFillSync(buf).toString('hex');
      try {
        // write secret to file
        fs.writeFileSync(tokenPath, secret);
      } catch (e) {
        // nothing to do here - maybe missing perms?
      }
    }

    return secret;
  }

  // setup the web ui routes
  initWebUI(session) {
    const io = SocketIo(this.server);

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

    // open API is accessible without auth
    const openApi = express.Router();
    const api = express.Router();

    // check if this is the first user in the database
    openApi.get('/first', async (req, res) =>
      res.json(await this.database.isFirstUser()));

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
      const isFirst = await this.database.isFirstUser();
      let user;
      if (isFirst) {
        user = await this.database.createAdminUser(username, username === '' ? '' : password);
      } else {
        user = await this.database.authUser(username, password);
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
      const user = await this.database.findUserById(req.session.userId);
      if (!user || user.isBanned)
        return next(new Error('unauthorized'));
      req.user = user;
      next();
    });

    // register routes
    this.app.use('/api/v1', openApi);
    this.app.use('/api/v1', api);

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
  }

}

module.exports = Webserver;