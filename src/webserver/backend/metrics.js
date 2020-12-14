const soft = require('../../softconfig.js');

const error = (...args) => global.Omegga.error(...args);

module.exports = (server, io) => {
  const { database, omegga } = server;

  // server status is checked every minute
  clearInterval(server.serverStatusInterval);
  // heartbeat happens every 60 seconds
  let empties = 0;

  // last heartbeat hour
  let lastHour = -1;
  // players that have joined in the last hour
  let hourlyPlayers = [];

  server.lastReportedStatus = null;
  server.serverStatusInterval = setInterval(async () => {
    if (!omegga.started) return;
    try {
      // get the server status
      const status = await omegga.getServerStatus();
      if (!status) return;

      // get players by id
      const players = status.players.map(p => p.id);

      // send the unaltered status to the frontend
      server.lastReportedStatus = status;
      io.to('status').emit('server.status', status);
      try {
        omegga.emit('metrics:heartbeat', status);
      } catch (e) {
        // prevent the omegga callback handlers from crashing this
        error('Error in heartbeat emit', e);
      }

      // stop recording metrics after 3 empty server statuses
      if (players.length === 0 && ++empties > soft.METRIC_EMPTIES_BEFORE_PAUSE) {
        return;
      }

      const now = new Date();
      const hour = now.getUTCHours();
      // check if it's a new hour (for punchcard unique player tracking)
      if (hour !== lastHour) {
        lastHour = hour;
        hourlyPlayers = [];
      }

      // find all the players unique to this hour
      const newPlayers = players.filter(p => !hourlyPlayers.includes(p));
      if (newPlayers.length > 0) {
        // update the punchcard
        await database.updatePlayerPunchcard(newPlayers.length);
        // mark those players as previously joined players
        hourlyPlayers.push(...newPlayers);
      }

      // server is not empty, reset the counter
      empties = 0;

      const data = {
        // number of bricks
        bricks: status.bricks,
        // unique players by id
        players: players.filter((p, i) => players.indexOf(p) === i),
        // addresses by player id
        ips: Object.fromEntries(status.players.map(p => [p.id, p.address])),
      };

      // hand the server status off to the database
      await database.addHeartbeat(data);
    } catch (e) {
      // probably an issue getting server status
      error('Server Not Responding...');
    }

  }, soft.METRIC_HEARTBEAT_INTERVAL);

  // chat events
  omegga.on('chat', async (name, message) => {
    const p = omegga.getPlayer(name);
    const user = {
      id: p.id,
      name,
      color: p.getNameColor(),
    };

    // tell web users about a chat message
    io.to('chat').emit('chat',
      await database.addChatLog('msg', user, message));
  });

  // player leave events
  omegga.on('leave', async ({id, name}) => {
    // tell web users a player left
    io.to('chat').emit('chat',
      await database.addChatLog('leave', {id, name}));
  });

  // player join events
  omegga.on('join', async ({id, name}) => {
    // add the visit to the database
    const isFirst = await database.addVisit({id, name});

    // tell web users a player joined (and if it's their first time joining)
    io.to('chat').emit('chat',
      await database.addChatLog('join', {id, name, ...(isFirst ? {isFirst} : {})}));
  });

  // tell web users plugin status
  omegga.on('plugin:status', (shortPath, info) => {
    io.to('plugins').emit('plugin', shortPath, info);
  });

  // server status events
  omegga.on('start', () =>
    io.to('server').emit('status', {started: true, starting: false, stopping: false}));
  omegga.on('server:starting', () =>
    io.to('server').emit('status', {started: false, starting: true, stopping: false}));
  omegga.on('server:stopped', () =>
    io.to('server').emit('status', {started: false, starting: false, stopping: false}));
  omegga.on('server:stopping', () =>
    io.to('server').emit('status', {started: true, starting: false, stopping: true}));
};
