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

      // return the player with the corresponding controller
      return omegga.players.find(p => p.controller === match[1]);
    },
    // when there's a match, remove the player from the player list, emit a leave event
    callback(player) {
      omegga.players.splice(omegga.players.indexOf(player), 1);
      omegga.emit('leave', player);
    },
  };
};