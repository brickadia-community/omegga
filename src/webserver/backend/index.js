const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const querystring = require('querystring');

const express = require('express');
const WebSocketServer = require('ws').Server;
const SocketIo = require('socket.io');
const bodyParser = require('body-parser');

const soft = require('../../softconfig.js');

// path to assets folder
const ASSET_PATH = path.join(__dirname, '../frontend/assets');
// path to webpacked data
const PUBLIC_PATH = path.join(__dirname, '../public');

// the webserver servers an authenticated
class Webserver {
  // create a webserver
  constructor(options, database, omegga) {
    this.port = options.port || process.env.PORT || soft.DEFAULT_PORT;
    this.database = database;
    this.omegga = omegga;

    // create socket.io & express app
    this.app = express();
    this.server = http.Server(this.app);

    // setup routes and webserver
    this.initPluginWebsocket();
    this.initWebUI();
  }

  // setup websocket route and server server
  initPluginWebsocket() {
    // setup websocket server
    this.ws = new WebSocketServer({noServer: true});

    // authorize on upgrade requests
    this.server.on('upgrade', (request, socket, head) => {
      const { pathname, query: queryRaw } = url.parse(request.url, true);
      const { token } = querystring.parse(queryRaw);

      if (pathname !== soft.WEB_PLUGIN_API_ROUTE) return;

      const plugin = this.omegga.pluginLoader.plugins.find(p => p)

      const isAuth = true;

      if (!isAuth) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      // finish the
      this.ws.handleUpgrade(request, socket, head, ws => {
        this.ws.emit('connection', ws, request, client);
      });
    });

    // handle incoming connections
    this.ws.on('connection', this.handlePluginConn.bind(this));
  }

  // setup the web ui routes
  initWebUI() {
    const io = SocketIo(this.server);
    io.use((socket, next) => {
        if (!socket.handshake.query.token) {
          console.log('has token');
          next('unauthorized');
        }

        // ok
        next();
    });

    // provide assets in the /public path
    this.app.use('/public', express.static(PUBLIC_PATH));
    this.app.use('/public', express.static(ASSET_PATH));
    this.app.use(bodyParser.urlencoded({ extended: false }));

    // every request goes through the index file (frontend handles 404s)
    this.app.use((req, res) => {
      // TODO: send auth webpage instead
      res.sendFile(path.join(ASSET_PATH, 'index.html'));
    });
  }

  // handle successful websocket connections
  handlePluginConn(ws, req, plugin) {
    console.log('ws conn', ws);
    ws.on('message', message => {
      console.log(`ws message: ${message}`);
    });
    ws.send('ping');
  }

  // start the webserver
  start() {
    return new Promise(resolve => {
      this.server.listen(this.port, () => {
        console.log(`${'>>'.green} Started webserver at http://127.0.0.1:${this.port}`)
        resolve();
      });
    });
  }

  // stop the webserver
  stop() {
    this.server.close();
  }

}

module.exports = Webserver;