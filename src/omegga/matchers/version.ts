import Logger from '@/logger';
import { MatchGenerator } from './types';
import path from 'path';
import { createReadStream, existsSync } from 'node:fs';

const versionRegExp =
  /Brickadia (?<branchName>.+?) \(.+-CL(?<version>\d+)\), Engine (?<engineVersion>.+)/;

const version: MatchGenerator<number> = omegga => {
  const LOG_PATH = path.join(omegga.dataPath, 'Saved/Logs/Brickadia.log');

  return {
    pattern(line, _logMatch) {
      if (!line.startsWith('LogPakFile')) return;
      if (line !== 'LogPakFile: Initializing PakPlatformFile') return;

      // The version line
      // Brickadia Release-EA1 (PC-Shipping-CL11633), Engine 444a09f18f48
      // is not printed in the game logs.. only the log file...

      if (!existsSync(LOG_PATH)) {
        Logger.warnp(
          'Log file not found',
          LOG_PATH.yellow + '. Cannot check version.',
        );
        return;
      }

      // Read the first 100 characters of the log file to find the version
      const stream = createReadStream(LOG_PATH, {
        encoding: 'utf8',
        start: 0,
        end: 100,
      });

      (async () => {
        let data = '';
        for await (const chunk of stream) {
          data += chunk;
        }

        for (const line of data.split('\n')) {
          const match = line.match(versionRegExp);
          if (!match) continue;

          const version = Number(match.groups?.version);

          omegga.emit('version', version);
          Logger.verbose('Brickadia Version', version);
          omegga.version = version;
        }
      })();

      return 1;
    },
    callback(_version) {},
  };
};

export default version;
