module.exports = omegga => {
  // pattern to get PlayerController from a leave message
  const commandRegExp = /^Player (?<name>.+?) is trying to call command "\/(?<command>.+?)" with arg string "(?<args>.*?)".$/;
  const a4missingCommandRegExp = /(?<name>.+?) tried to call nonexistent command "(?<command>.*?)".$/;
  const a4commandRegExp = /(?<name>.+?) called command "(?<command>.+?)" with parameters "(?<args>.*?)".$/;

  return {
    // listen for commands messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;
      // check if log is a command log
      if (generator !== 'LogChatCommands') return;

      // match log to argument-less a4 commands
      const a4match = data.match(a4missingCommandRegExp);
      if (a4match) {
        const { name, command } = a4match.groups;

        // no player has this name. probably a bug
        if (!omegga.players.some(p => p.name === name))
          return;

        // return the player and the command
        return { name, command, args: [] };
      }

      // match the log to the command pattern
      const match = data.match(commandRegExp) || data.match(a4commandRegExp);
      if (match) {
        const { name, command, args } = match.groups;

        // no player has this name. probably a bug
        if (!omegga.players.some(p => p.name === name))
          return;

        // return the player and the command
        return { name, command, args: args.split(' ') };
      }

      return null;
    },
    // when there's a match, emit the comand event
    callback({ name, command, args }) {
      omegga.emit('cmd:'+command.toLowerCase(), name, ...args);
      omegga.emit('cmd', command.toLowerCase(), name, ...args);
    },
  };
};