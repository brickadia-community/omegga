import Logger from '@/logger';
import { MatchGenerator } from './types';

const init: MatchGenerator<void> = _omegga => {
  return {
    // listen for auth messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;

      if (!generator.match(/^LogInit$/)) return;

      // check if log is the kill server log
      if (data.match(/we are not the first instance of this executable/)) {
        Logger.warn(
          'W> WARNING'.yellow,
          'You are running multiple brickadia instances, this better be intentional',
        );
      }
    },

    callback() {},
  };
};

export default init;
