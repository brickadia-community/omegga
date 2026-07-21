import { type MatchGenerator } from './types';
import { type BrickInteraction } from '@/plugin';
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
      if (!logMatch?.groups) return;

      const { generator, data } = logMatch.groups;

      if (generator !== 'LogBrickadia') return;

      const groups = data.match(interactRegExp)?.groups;

      // check if log is the kill server log
      if (groups) {
        let blob: any = null,
          error = false,
          json = false;
        if (groups.message?.startsWith('json:')) {
          json = true;
          try {
            blob = JSON.parse(groups.message.slice(5));
          } catch (err) {
            Logger.verbose('Error parsing interact event json', data, err);
            error = true;
          }
        }

        const convertedBrick = convertDisplayName(groups.brick);

        return {
          player: {
            id: groups.id,
            name: groups.name,
            controller: groups.controller,
            pawn: groups.pawn,
          },
          brick_name: groups.brick,
          brick_asset: convertedBrick?.[0] ?? null,
          brick_size: convertedBrick?.[1] ?? null,
          position: [Number(groups.x), Number(groups.y), Number(groups.z)],
          message: groups.message,
          json,
          error,
          data: blob,
        };
      }
    },

    callback(interaction) {
      const match = interaction.message.match(customEventRegExp);
      if (match?.groups) {
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
