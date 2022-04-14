import { MatchGenerator } from './types';
import { BrickInteraction } from '@/plugin';

const interactRegExp =
  /^Player "(?<name>[^"]+)" \((?<id>[^,]+), (?<pawn>[^,]+), (?<controller>[^)]+)\) interacted with brick "(?<brick>[^\"]+)" at (?<x>-?\d+) (?<y>-?\d+) (?<z>-?\d+).$/;

const interact: MatchGenerator<BrickInteraction> = omegga => {
  return {
    // listen for auth messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;

      if (generator !== 'LogBrickadia') return;

      const match = data.match(interactRegExp);

      // check if log is the kill server log
      if (match) {
        return {
          player: {
            id: match.groups.id,
            name: match.groups.name,
            controller: match.groups.controller,
            pawn: match.groups.pawn,
          },
          brick_name: match.groups.brick,
          position: [
            Number(match.groups.x),
            Number(match.groups.y),
            Number(match.groups.z),
          ],
        } as BrickInteraction;
      }
    },

    callback(interaction) {
      omegga.emit('interact', interaction);
    },
  };
};

export default interact;
