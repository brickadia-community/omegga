module.exports = omegga => {
  // pattern to get PlayerController from a leave message
  const chatRegExp = /^(?<name>.+?): (?<message>.+)$/;
  return {
    // listen for chat messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;
      // check if log is a chat log
      if (generator !== 'LogChat') return;

      // match the chat log to the chat message pattern
      const match = data.match(chatRegExp);
      if (!match) return null;

      let { name, message } = match.groups;

      if (omegga.version === 'a5') {
        message = message.toString()
          .replace(/&scl;/g, ';')
          .replace(/&gt;/g, '>')
          .replace(/&lt;/g, '<');
      }

      // no player has this name. probably a bug
      if (!omegga.players.some(p => p.name === name))
        return;

      // return the player with the corresponding controller
      return { name, message };
    },
    // when there's a match, emit the chat message event
    callback({ name, message }) {
      omegga.emit('chat', name, message);

      // chat command parsing, emit `chatcmd:test` when `!test` is sent in chat
      if (message.startsWith('!')) {
        const [cmd, ...args] = message.slice(1).split(' ');
        if (cmd.length > 0) {
          omegga.emit('chatcmd:' + cmd.toLowerCase(), name, ...args);
          omegga.emit('chatcmd', cmd.toLowerCase(), name, ...args);
        }
      }
    },
  };
};