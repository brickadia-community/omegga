import Logger from '@/logger';
import soft from '@/softconfig';
import { IServerConfig } from '@config/types';
import type Omegga from '@omegga/server';
import { IServerStatus } from '@omegga/types';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import bodyParser from 'body-parser';
import express from 'express';
import expressSession from 'express-session';
import hasbin from 'hasbin';
import http from 'http';
import https from 'https';
import NedbStore from 'nedb-promises-session-store';
import path from 'path';
import Database from './database';
import setupMetrics from './metrics';
import { appRouter } from './router';
import { setWebserver } from './router/server';
import { createContext, setContextDeps } from './trpc';
import * as util from './util';

// path to vite-built data
const PUBLIC_PATH = path.join(__dirname, '../../../public');
const ASSETS_PATH = path.join(__dirname, '../../../public/assets');

const log = (...args: any[]) => Logger.log(...args);
const error = (...args: any[]) => Logger.error(...args);

// the webserver serves an authenticated web UI
export default class Webserver {
  database: Database;
  port: number;
  omegga: Omegga;

  app: express.Express;
  server: http.Server | https.Server;

  options: IServerConfig;
  https: boolean;
  started: boolean;
  created: Promise<boolean>;

  serverStatusInterval: ReturnType<typeof setInterval>;
  lastReportedStatus: IServerStatus;

  dataPath: string;

  // create a webserver
  constructor(options: IServerConfig, omegga: Omegga) {
    this.port = Number(
      options.port || process.env.OMEGGA_PORT || soft.DEFAULT_PORT,
    );
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
    const hasOpenSSL = hasbin.sync('openssl');

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
            if (certFile.new) log('>>'.green, 'Generated new SSL certificate');

            this.https = true;
            return https.createServer(
              {
                key: certFile.keys.serviceKey,
                cert: certFile.keys.certificate,
              },
              this.app,
            );
          } else {
            error(
              '!>'.red,
              'Error generating SSL certificate - falling back to http',
            );
          }
        }

        // warn the user
        log(
          ':>'.yellow,
          'Running web server with http - install',
          'openssl'.yellow.underline,
          'for https (more secure)',
        );
      }

      // fallback to http
      return new http.Server(this.app);
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
      // For some reason vite is not importing the default export properly without this...
      store: (NedbStore['default'] as typeof NedbStore)({
        filename: path.join(this.dataPath, soft.SESSION_STORE),
        connect: expressSession,
      }),
    });
    this.app.use(session);

    // setup routes and webserver
    await this.initWebUI();
    return true;
  }

  // setup the web ui routes
  async initWebUI() {
    await this.database.getInstanceId();

    // Initialize tRPC context deps
    setContextDeps({
      database: this.database,
      omegga: this.omegga,
    });
    setWebserver(this);

    // provide assets in the /public path
    this.app.use('/assets', express.static(ASSETS_PATH));
    this.app.use(bodyParser.json());

    // --- Auth routes (outside tRPC) ---
    const openApi = express.Router();
    const api = express.Router();

    // check if this is the first user in the database
    openApi.get('/first', async (req, res) =>
      res.json(await this.database.isFirstUser()),
    );

    // login / create admin user route
    openApi.post('/auth', async (req, res) => {
      if (
        typeof req.body !== 'object' ||
        typeof req.body.username !== 'string' ||
        typeof req.body.password !== 'string'
      ) {
        return res.status(422).json({ message: 'invalid body' });
      }
      const { username, password } = req.body;

      if (!username.match(/^\w{0,32}$/)) {
        return res.status(422).json({ message: 'invalid body' });
      }

      const isFirst = await this.database.isFirstUser();
      let user;
      if (isFirst) {
        user = await this.database.createAdminUser(
          username,
          username === '' ? '' : password,
        );
      } else {
        user = await this.database.authUser(username, password);
      }

      if (user) {
        req.session.userId = user._id;
        req.session.save();
        res.status(200).json({});
      } else {
        res.status(404).json({ message: 'no user found' });
      }
    });

    // authentication middleware for protected api routes
    api.all('*', (req, _res, next) => {
      (async () => {
        const user = await this.database.findUserById(req.session.userId);
        if (!user || user.isBanned) return next(new Error('unauthorized'));
        next();
      })();
    });

    // kill a session
    api.get('/logout', (req, res) => {
      req.session.destroy(e => {
        res.status(e ? 500 : 200).json({});
      });
    });

    this.app.use('/api/v1', openApi);
    this.app.use('/api/v1', api);

    // --- tRPC ---
    this.app.use(
      '/trpc',
      createExpressMiddleware({
        router: appRouter,
        createContext,
      }),
    );

    // setup metrics and tracking
    setupMetrics(this);

    // every request goes through the index file (frontend handles 404s)
    this.app.use(async (req, res) => {
      const user = await this.database.findUserById(req.session.userId);
      const isAuth = user && !user.isBanned;
      if (isAuth) {
        res.sendFile(path.join(PUBLIC_PATH, 'app.html'));
      } else {
        res.sendFile(path.join(PUBLIC_PATH, 'auth.html'));
      }
    });
  }

  // start the webserver
  async start() {
    if (this.started) return;
    await this.created;
    return await new Promise<void>(resolve => {
      this.server.listen(this.port, () => {
        log(
          `${'>>'.green} Web UI available at`,
          `http${this.https ? 's' : ''}://127.0.0.1:${this.port}`.green,
        );
        this.started = true;
        this.database.addChatLog('server', {}, 'Server started');
        resolve();
      });
    });
  }

  // stop the webserver
  stop() {
    this.database.addChatLog('server', {}, 'Server stopped');
    this.server.close();
    this.started = false;
    clearInterval(this.serverStatusInterval);
  }
}
