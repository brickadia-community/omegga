import { MatchGenerator } from './types';

const chat: MatchGenerator<{
  type: string;
  name: string;
  kicker?: string;
  reason?: string;
  message?: string;
}> = omegga => {
  // pattern to get PlayerController from a leave message
  const chatRegExp = /^(?<name>.+?): (?<message>.+)$/;
  const kickRegExp =
    /^(?<name>.+?) was kicked by (?<kicker>.+?) \((?<reason>.+?)\)$/;

  const exists = (name: string) => omegga.players.some(p => p.name === name);

  const sanitizeMsg = (msg: string) =>
    msg
      .toString()
      .replace(/&gt;/g, '>')
      .replace(/&und;/g, '_')
      .replace(/&lt;/g, '<')
      .replace(/&scl;/g, ';');

  const sanitizeName = (name: string) => name.toString().replace(/&und;/g, '_');

  return {
    // listen for chat messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;
      // check if log is a chat log
      if (generator !== 'LogChat') return;

      // match the chat log to the chat message pattern
      const chatMatch = data.match(chatRegExp);
      const kickMatch = data.match(kickRegExp);

      if (chatMatch) {
        let { name, message } = chatMatch.groups;

        name = sanitizeName(name);
        message = sanitizeMsg(message);

        // no player has this name. probably a bug
        if (!exists(name)) return;

        // return the player with the corresponding controller
        return { type: 'chat', name, message };
      } else if (kickMatch) {
        let { name, kicker, reason } = kickMatch.groups;
        name = sanitizeName(name);
        kicker = sanitizeName(kicker);
        reason = sanitizeMsg(reason);

        if (!exists(name) || !exists(kicker)) return;

        return { type: 'kick', name, kicker, reason };
      }
    },
    // when there's a match, emit the chat message event
    callback({ type, name, kicker, message, reason }) {
      if (type === 'chat') {
        omegga.emit('chat', name, message);

        // chat command parsing, emit `chatcmd:test` when `!test` is sent in chat
        if (message.startsWith('!')) {
          const [cmd, ...args] = message.slice(1).split(' ');
          if (cmd.length > 0) {
            omegga.emit('chatcmd:' + cmd.toLowerCase(), name, ...args);
            omegga.emit('chatcmd', cmd.toLowerCase(), name, ...args);
          }
        }
      } else if (type === 'kick') {
        omegga.emit('kick', name, kicker, reason);
      }
    },
  };
};

export default chat;
