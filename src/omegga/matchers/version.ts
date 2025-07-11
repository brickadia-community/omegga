import fs from 'fs';
import path from 'path';
import softconfig from '@/softconfig';
import { MatchGenerator } from './types';
import Logger from '@/logger';

// LogBrickadia: Using network version 11578.

const version: MatchGenerator<number> = omegga => {
  const versionRegExp = /^Using network version (?<version>\d+)\.$/;
  let version: number;

  return {
    pattern(_line, logMatch) {
      // if the version has already been found - ignore this matcher
      if (version || !logMatch) return;

      const { generator, data } = logMatch.groups;

      // check if log is a command log
      if (generator !== 'LogBrickadia') return;

      const match = data.match(versionRegExp);
      if (!match) return;
      return Number(match.groups?.version);
    },
    // when there's a match, emit the chat message event
    callback(version) {
      if (!omegga.version) {
        omegga.emit('version', version);
        Logger.verbose('Brickadia Version', version);
        omegga.version = version;
      }
    },
  };
};

export default version;
