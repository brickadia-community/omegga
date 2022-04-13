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
