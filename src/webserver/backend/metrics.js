const soft = require('../../softconfig.js');

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

  server.serverStatusInterval = setInterval(async () => {
    if (!omegga.started) return;
    try {
      // get the server status
      const status = await omegga.getServerStatus();
      if (!status) return;

      // get players by id
      const players = status.players.map(p => p.id);

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
      if (newPlayers > 0) {
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
    // tell web users a player joined
    io.to('chat').emit('chat',
      await database.addChatLog('join', {id, name}));

    // add the visit to the database
    database.addVisit({id, name});
  });
};
