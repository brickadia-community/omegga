const path = require('path');
const http = require('http');

const express = require('express');
const SocketIo = require('socket.io');
const bodyParser = require('body-parser');

const soft = require('../../softconfig.js');

// path to assets folder
const ASSET_PATH = path.join(__dirname, '../frontend/assets');
// path to webpacked data
const PUBLIC_PATH = path.join(__dirname, '../../../public');

let log;

// the webserver servers an authenticated
class Webserver {
  // create a webserver
  constructor(options, database, omegga) {
    this.port = options.port || process.env.PORT || soft.DEFAULT_PORT;
    this.database = database;
    this.omegga = omegga;
    log = this.omegga.log;

    // create socket.io & express app
    this.app = express();
    this.server = http.Server(this.app);

    // setup routes and webserver
    this.initWebUI();
  }

  // setup the web ui routes
  initWebUI() {
    const io = SocketIo(this.server);
    io.use((socket, next) => {
      if (!socket.handshake.query.token) {
        log('has token');
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

  // start the webserver
  start() {
    return new Promise(resolve => {
      this.server.listen(this.port, () => {
        log(`${'>>'.green} Started webserver at http://127.0.0.1:${this.port}`);
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