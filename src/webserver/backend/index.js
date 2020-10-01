const fs = require('fs');
const path = require('path');
const http = require('http');

const express = require('express');
const SocketIo = require('socket.io');
const bodyParser = require('body-parser');

const ASSET_PATH = path.join(__dirname, '../public');

// the webserver servers an authenticated
class Webserver {
  // create a webserver
  constructor(port, database, omegga) {
    this.port = port || process.env.PORT || 8080;
    this.database = database;
    this.omegga = omegga;

    // create socket.io & express app
    const app = express();
    this.app = app;
    this.server = https.Server(app);
    const io = SocketIo(this.server);

    // provide assets in the /public path
    app.use('/public', express.static(ASSET_PATH));
    app.use(bodyParser.urlencoded({ extended: false }));

    // every request goes through the index file (frontend handles 404s)
    app.use((req, res) => {
      // TODO: send auth webpage instead
      res.sendFile(path.join(ASSET_PATH, 'index.html'));
    });
  }

  // stop the webserver
  stop() {
    this.server.close();
  }

  // start the webserver
  start() {
    this.server.listen(this.port, () => console.log(`Started server on :${this.port}!`));
  }
}

module.exports = Webserver;