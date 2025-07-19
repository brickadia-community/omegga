import Logger from '@/logger';
import soft from '@/softconfig';
import { IServerConfig } from '@config/types';
import type Omegga from '@omegga/server';
import { IServerStatus } from '@omegga/types';
import bodyParser from 'body-parser';
import express from 'express';
import expressSession from 'express-session';
import hasbin from 'hasbin';
import http from 'http';
import https from 'https';
import NedbStore from 'nedb-promises-session-store';
import path from 'path';
import { Server as SocketIo } from 'socket.io';
import setupApi from './api';
import Database from './database';
import setupMetrics from './metrics';
import { IStoreUser, OmeggaSocketIo } from './types';
import * as util from './util';

// path to vite-built data
const PUBLIC_PATH = path.join(__dirname, '../../../public');
const ASSETS_PATH = path.join(__dirname, '../../../public/assets');

const log = (...args: any[]) => Logger.log(...args);
const error = (...args: any[]) => Logger.error(...args);

// the webserver servers an authenticated
export default class Webserver {
  database: Database;
  port: number;
  omegga: Omegga;

  app: express.Express;
  server: http.Server | https.Server;
  io: OmeggaSocketIo;

  options: IServerConfig;
  https: boolean;
  started: boolean;
  created: Promise<boolean>;

  serverStatusInterval: ReturnType<typeof setInterval>;
  lastReportedStatus: IServerStatus;

  rooms: string[];

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
      store: NedbStore({
        filename: path.join(this.dataPath, soft.SESSION_STORE),
        connect: expressSession,
      }),
    });
    this.app.use(session);

    // setup routes and webserver
    await this.initWebUI(session);
    return true;
  }

  // setup the web ui routes
  async initWebUI(session: ReturnType<typeof expressSession>) {
    this.io = new SocketIo(this.server);

    await this.database.getInstanceId();

    // use the session middleware
    this.io.use((socket, next) => {
      const req = socket.request as express.Request;
      const res = (req.res || {}) as express.Response<any, { userId: string }>;

      session(req, res, async () => {
        // check if user is authenticated
        const user = await this.database.findUserById(
          req.session.userId as string,
        );
        if (user && !user.isBanned) {
          socket.data.user = user;
          await this.database.stores.users.update<IStoreUser>(
            { _id: user._id },
            { $set: { lastOnline: Date.now() } },
          );
          next();
        } else {
          next(new Error('unauthorized'));
        }
      });
    });

    // provide assets in the /public path
    this.app.use('/assets', express.static(ASSETS_PATH));
    this.app.use(bodyParser.json());

    this.rooms = ['chat', 'status', 'plugins', 'server'];

    // setup the api
    setupApi(this, this.io);

    // setup metrics and tracking
    setupMetrics(this, this.io);

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
