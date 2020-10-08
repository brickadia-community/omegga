module.exports = omegga => {
  // pattern to get PlayerController from a leave message
  const ownerRegExp = /Owner: (BP_PlayerController_C_\d+)/;

  return {
    // listen for leave events and wait for PlayerController info
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;
      // check if log is a disconnect log
      if (generator !== 'LogNet' || !data.startsWith('UChannel::Close:'))
        return;

      // get the PlayerController from the leave message if there is one (there should be)
      const match = data.match(ownerRegExp);
      if (!match) return null;

      // helper func for finding player with this controller
      const getLeavingPlayer = () => omegga.players.find(p => p.controller === match[1]);

      let found = getLeavingPlayer();

      // attempt to find the player over the course of 2 seconds
      // this is because a player can join before all their data is collected
      return new Promise((resolve, reject) => {
        let tries = 50;
        function attempt() {
          found = getLeavingPlayer();

          if (found) return resolve(found);
          if (tries-- < 0) return reject('ghost player ' + match[1]);

          setTimeout(attempt, 50);
        }
        attempt();
      });
    },
    // when there's a match, remove the player from the player list, emit a leave event
    async callback(res) {
      if (!(res instanceof Promise)) return;

      try {
        const player = await res;
        omegga.players.splice(omegga.players.indexOf(player), 1);
        omegga.emit('leave', player);
        omegga.emit('plugin:players:raw', omegga.players.map(p => p.raw()));

      } catch (e) {
        Omegga.error('error getting player leave', e);
      }
    },
  };
};