import Logger from '@/logger';
import { type MatchGenerator } from './types';
import path from 'path';
import { createReadStream, existsSync, readFileSync } from 'node:fs';

const versionRegExp =
  /Brickadia (?<branchName>.+?) \(.+-CL(?<version>\d+)\), Engine (?<engineVersion>.+)/;

// UTF-16LE bytes for "-CL" (2D 00 43 00 4C 00). UE bakes the game version into
// the server binary as a UTF-16LE string literal of the form
// `<Branch> (<Platform>-<Config>-CL<changelist>)`, e.g. `Release-EA3 (PC-Shipping-CL14860)`.
const CL_NEEDLE = Buffer.from('-CL', 'utf16le');

// Low bytes of the UTF-16LE ')' terminator and '0'/'9' digit bounds (the high
// byte is 0 for ASCII, checked separately).
const PAREN_LO = ')'.charCodeAt(0);
const ZERO = '0'.charCodeAt(0);
const NINE = '9'.charCodeAt(0);

// Safety cap on needle scans so a corrupt/unexpected binary can never stall
// startup. Real binaries contain a single match; this is orders of magnitude
// above anything legitimate.
const MAX_BINARY_SCANS = 100_000;

/**
 * Extract the Brickadia changelist (game version) directly from the server
 * binary, without launching it. This lets `omegga.version` be populated before
 * plugins hit `init` (e.g. calling `readSaveData`), instead of staying `-1`
 * until the game boots and writes its log.
 *
 * UE bakes the version in as a UTF-16LE literal like `Release-EA3 (PC-Shipping-CL14860)`
 * (`BRANCH_NAME`, platform/config, and `BUILT_FROM_CHANGELIST` concatenated at
 * preprocessor time). We scan the raw bytes for the `-CL<digits>)` needle.
 * Verified across pre-steam launcher installs and EA1-EA3+ steam builds, both
 * Shipping and Test configs.
 *
 * @param binPath absolute path to `BrickadiaServer-Linux-Shipping` (a null path,
 *   e.g. an unresolved launcher install, simply yields null)
 * @returns the changelist number, or null if it can't be determined (missing
 *   file, read error, no match, or an ambiguous multi-match)
 */
export function readBinaryVersion(binPath: string | null): number | null {
  try {
    if (!binPath || !existsSync(binPath)) return null;
    const buf = readFileSync(binPath);
    const found = new Set<number>();

    let i = buf.indexOf(CL_NEEDLE);
    let scans = 0;
    while (i !== -1 && scans++ < MAX_BINARY_SCANS) {
      // read the following UTF-16LE ASCII digits until a non-digit
      let p = i + CL_NEEDLE.length;
      let digits = '';
      while (
        p + 1 < buf.length &&
        buf[p + 1] === 0 &&
        buf[p] >= ZERO &&
        buf[p] <= NINE
      ) {
        digits += String.fromCharCode(buf[p]);
        p += 2;
      }
      // require the UTF-16LE ')' terminator so we skip the `%s-CL-%u` format
      // string (and any `-CL-` variant that isn't the parenthesized literal)
      if (digits && buf[p] === PAREN_LO && buf[p + 1] === 0) {
        found.add(Number(digits));
      }
      i = buf.indexOf(CL_NEEDLE, i + 2);
    }

    // only trust an unambiguous single match
    return found.size === 1 ? [...found][0] : null;
  } catch (err) {
    Logger.verbose('Failed to read version from binary', binPath, err);
    return null;
  }
}

const version: MatchGenerator<number> = omegga => {
  const LOG_PATH = path.join(omegga.dataPath, 'Saved/Logs/Brickadia.log');

  return {
    pattern(line, _logMatch) {
      if (!line.startsWith('LogPakFile')) return;
      if (line !== 'LogPakFile: Initializing PakPlatformFile') return;

      // The version is normally resolved up-front from the server binary
      // ({@link readBinaryVersion}, in Omegga.start). This log-file read is only
      // a fallback for when that fails (e.g. launcher installs whose binary path
      // isn't resolved, or an unreadable binary). If we already have it, skip.
      if (omegga.version > 0) return;

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
