import { MatchGenerator } from './types';

const chat: MatchGenerator<{
  type: string;
  name: string;
  id?: string;
  kicker?: string;
  reason?: string;
  message?: string;
}> = omegga => {
  // pattern to get PlayerController from a leave message
  const chatRegExp =
    /^\[SenderId: (?<userId>[^\]]+)\] (?<name>.+?): (?<message>.+)$/;
  const kickRegExp =
    /^(?<name>.+?) was kicked by (?<kicker>.+?) \((?<reason>.+?)\)$/;

  const exists = (name: string, id?: string) =>
    id
      ? omegga.players.some(p => p.id === id)
      : omegga.players.some(p => p.displayName === name);

  const sanitizeMsg = (msg: string) =>
    msg
      .toString()
      .replace(/&gt;/g, '>')
      .replace(/&und;/g, '_')
      .replace(/&lt;/g, '<')
      .replace(/&scl;/g, ';');

  const sanitizeName = (name: string) =>
    name.toString().replace(/&und;/g, '_').replace(/&scl;/g, ';');

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
        let { userId: id, name, message } = chatMatch.groups;

        name = sanitizeName(name);
        message = sanitizeMsg(message);

        // no player has this name. probably a bug
        if (!exists(name, id)) return;

        // return the player with the corresponding controller
        return { type: 'chat', id, name, message };
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
    callback({ type, id, name, kicker, message, reason }) {
      if (type === 'chat') {
        const player = omegga.players.find(p => p.id === id);
        // Use the player's non-display-name if available
        if (player) name = player.name;
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
