import type Logger from './logger';
import type Player from './omegga/player';
import type * as util from './util';

type LoggerType = typeof Logger;
type PlayerType = typeof Player;
declare global {
  var Logger: LoggerType;
  var Player: PlayerType;
  var OMEGGA_UTIL: typeof util;
}
export default global;
