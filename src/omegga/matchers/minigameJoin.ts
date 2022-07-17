import { MatchGenerator } from './types';

// LogBrickadia: Ruleset My Minigame no saved checkpoint for player BrickadiaPlayer (00000000-0000-0000-0000-000000000000)
// LogBrickadia: Ruleset My Minigame loading saved checkpoint for player BrickadiaPlayer (00000000-0000-0000-0000-000000000000)
const minigameJoinRegExp =
  /^Ruleset (?<minigame>.+?) (loading|no) saved checkpoint for player (?<name>.+) \((?<id>.+)\)$/;

const minigameJoin: MatchGenerator<{
  player: { name: string; id: string };
  minigameName: string;
}> = omegga => {
  return {
    // listen for commands messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;
      // check if log is a world log
      if (generator !== 'LogBrickadia') return;

      // match the log to the map change finish pattern
      const matchChange = data.match(minigameJoinRegExp);
      if (matchChange) {
        const { minigame, name, id } = matchChange.groups;

        return {
          player: { name, id },
          minigameName: minigame === 'GLOBAL' ? null : minigame,
        };
      }

      return null;
    },
    // when there's a match, emit the event
    callback(result) {
      omegga.emit('minigamejoin', result);
    },
  };
};

export default minigameJoin;
