import type Logger from './logger';

type LoggerType = typeof Logger;
declare global {
  var Logger: LoggerType;
}

export default global;
