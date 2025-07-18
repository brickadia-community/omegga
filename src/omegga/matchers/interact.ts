import { MatchGenerator } from './types';
import { BrickInteraction } from '@/plugin';
import Logger from '@/logger';
import { convertDisplayName } from '@util/brick';

const interactRegExp =
  /^Player "(?<name>[^"]+)" \((?<id>[^,]+), (?<pawn>[^,]+), (?<controller>[^)]+)\) interacted with brick "(?<brick>[^\"]+)" at (?<x>-?\d+) (?<y>-?\d+) (?<z>-?\d+), message: "(?<message>.*)".$/;

const customEventRegExp = /^event:(?<name>[^:]+)(:(?<args>.*))?$/;

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
        let blob: any = null,
          error = false,
          json = false;
        if (match.groups.message?.startsWith('json:')) {
          json = true;
          try {
            blob = JSON.parse(match.groups.message.slice(5));
          } catch (err) {
            Logger.verbose('Error parsing interact event json', data, err);
            error = true;
          }
        }

        const convertedBrick = convertDisplayName(match.groups.brick) ?? [];

        return {
          player: {
            id: match.groups.id,
            name: match.groups.name,
            controller: match.groups.controller,
            pawn: match.groups.pawn,
          },
          brick_name: match.groups.brick,
          brick_asset: convertedBrick[0],
          brick_size: convertedBrick[1],
          position: [
            Number(match.groups.x),
            Number(match.groups.y),
            Number(match.groups.z),
          ],
          message: match.groups.message,
          json,
          error,
          data: blob,
        };
      }
    },

    callback(interaction) {
      const match = interaction.message.match(customEventRegExp);
      if (match) {
        omegga.emit(
          `event:${match.groups.name}`,
          interaction.player,
          ...(match.groups.args
            ?.replace(/\\,/g, '{ESCAPED_COMMA}')
            .split(',')
            .filter(v => typeof v !== 'undefined')
            .map(v => v.replace(/\{ESCAPED_COMMA\}/g, ',')) ?? []),
        );
      }

      omegga.emit('interact', interaction);
    },
  };
};

export default interact;
