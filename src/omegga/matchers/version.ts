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

      // The version line lives only in the log file (not stdout), near the very
      // top. We trigger off a stdout line, but the file may not be flushed to
      // disk that exact instant - so read the first 100 chars and, if the
      // version line isn't there yet, retry a couple times to win that race.
      const tryReadVersion = async (): Promise<number | null> => {
        const stream = createReadStream(LOG_PATH, {
          encoding: 'utf8',
          start: 0,
          end: 100,
        });

        let data = '';
        try {
          for await (const chunk of stream) {
            data += chunk;
          }
        } catch {
          return null;
        }

        for (const line of data.split('\n')) {
          const match = line.match(versionRegExp);
          if (match) return Number(match.groups?.version);
        }
        return null;
      };

      (async () => {
        // initial attempt + 2 retries; the version is at the start of the log
        for (let attempt = 0; attempt < 3; attempt++) {
          const version = await tryReadVersion();
          if (version != null) {
            omegga.emit('version', version);
            Logger.verbose('Brickadia Version', version);
            omegga.version = version;
            return;
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        Logger.warnp(
          'Could not determine Brickadia version from',
          LOG_PATH.yellow,
        );
      })();

      return 1;
    },
    callback(_version) {},
  };
};

export default version;
