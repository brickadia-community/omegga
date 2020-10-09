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
    io.use(function(socket, next) {
      session(socket.request, socket.request.res || {}, () => {
        // TODO: check auth and reject
        // next(new Error('unauth'));
        next();
      });
    });

    // provide assets in the /public path
    this.app.use('/public', express.static(PUBLIC_PATH));
    this.app.use('/public', express.static(ASSET_PATH));
    this.app.use(bodyParser.urlencoded({ extended: false }));

    // every request goes through the index file (frontend handles 404s)
    this.app.use((req, res) => {
      // TODO: send auth webpage instead
      // TODO: get user from req.session
      /*
        socket.request.session.save(e => {
          error(e);
        });
      */
      res.sendFile(path.join(ASSET_PATH, 'index.html'));
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