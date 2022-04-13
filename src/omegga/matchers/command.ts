import { MatchGenerator } from './types';

const command: MatchGenerator<{
  name: string;
  command: string;
  args: string[];
}> = omegga => {
  // pattern to get PlayerController from a leave message
  const commandRegExp =
    /^Player (?<name>.+?) is trying to call command "\/(?<command>.+?)" with arg string "(?<args>.*?)".$/;

  return {
    // listen for commands messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;
      // check if log is a command log
      if (generator !== 'LogChatCommands') return;

      // match the log to the command pattern
      const match = data.match(commandRegExp);
      if (match) {
        const { name, command, args } = match.groups;

        // no player has this name. probably a bug
        if (!omegga.players.some(p => p.name === name)) return;

        // return the player and the command
        return { name, command, args: args.split(' ') };
      }

      return null;
    },
    // when there's a match, emit the comand event
    callback({ name, command, args }) {
      // if the only argument is an empty string, ignore it
      if (args.length === 1 && args[0].length === 0) args.pop();

      omegga.emit('cmd:' + command.toLowerCase(), name, ...args);
      omegga.emit('cmd', command.toLowerCase(), name, ...args);
    },
  };
};

export default command;
