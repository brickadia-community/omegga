import type Omegga from './omegga/server';
import type Player from './omegga/player';
import type * as util from './util';

type OmeggaType = typeof Omegga;
type PlayerType = typeof Player;
declare global {
  var Omegga: OmeggaType;
  var Player: PlayerType;
  var OMEGGA_UTIL: typeof util;
}
export default global;

declare global {
  interface String {
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  }
}
