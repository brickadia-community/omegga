import { type MatchGenerator } from './types';

const wire: MatchGenerator<{ raw: string }> = omegga => {
  // pattern to match wire graph log messages
  // e.g. `LogBrickadia: [Wire Graph] test`
  const wireRegExp = /^\[Wire Graph\] (?<raw>.*)$/;

  return {
    // listen for wire graph messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch?.groups) return;

      const { generator, data } = logMatch.groups;
      // check if log is a brickadia log
      if (generator !== 'LogBrickadia') return;

      // match the wire graph log pattern
      const match = data.match(wireRegExp);
      if (!match?.groups) return;

      return { raw: match.groups.raw };
    },
    // when there's a match, emit the wire log event
    callback({ raw }) {
      omegga.emit('wirelog', raw);

      // wire command parsing, emit `wirecmd:test` when `test ...` is logged
      const [cmd, ...args] = raw.split(' ');
      if (cmd.length > 0) {
        omegga.emit('wirecmd:' + cmd.toLowerCase(), ...args);
        omegga.emit('wirecmd', cmd.toLowerCase(), ...args);
      }
    },
  };
};

export default wire;
