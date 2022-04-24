import { MatchGenerator } from './types';
import { BrickClick, BrickInteraction } from '@/plugin';
import Logger from '@/logger';

const interactRegExp =
  /^Player "(?<name>[^"]+)" \((?<id>[^,]+), (?<pawn>[^,]+), (?<controller>[^)]+)\) interacted with brick "(?<brick>[^\"]+)" at (?<x>-?\d+) (?<y>-?\d+) (?<z>-?\d+).$/;

const customEventRegExp = /^event:(?<name>[^:]+):(?<args>.+)$/;

let lastInteract: BrickInteraction;
let lastCounter: string;

const interact: MatchGenerator<BrickInteraction | BrickClick> = omegga => {
  return {
    // listen for auth messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data, counter } = logMatch.groups;

      if (generator !== 'LogBrickadia') return;

      const match = data.match(interactRegExp);

      // check if log is the kill server log
      if (match) {
        return (lastInteract = {
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
        } as BrickInteraction);
        // if the counter is the same, it's safe to assunme
      } else if (counter === lastCounter) {
        let blob: any = null,
          error = false,
          json = false;
        if (data.startsWith('json:')) {
          json = true;
          try {
            blob = JSON.parse(data.slice(5));
          } catch (err) {
            Logger.verbose('Error parsing interact event json', data, err);
            error = true;
          }
        }

        const click: BrickClick = {
          ...lastInteract,
          line: data,
          json,
          error,
          data: blob,
        };
        lastInteract = null;
        lastCounter = '';
        return click;
      } else {
        lastCounter = '';
        lastInteract = null;
      }
    },

    callback(interaction) {
      if ('line' in interaction) {
        omegga.emit('click', interaction);
        const match = interaction.line.match(customEventRegExp);
        if (match) {
          omegga.emit(
            `event:${match.groups.name}`,
            interaction.player,
            ...match.groups.params
              .replace(/\\,/g, '{ESCAPED_COMMA}')
              .split(',')
              .map(v => v.replace(/\{ESCAPED_COMMA\}/g, ','))
          );
        }
      } else omegga.emit('interact', interaction);
    },
  };
};

export default interact;
