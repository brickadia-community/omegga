/*
  Library module, includes all available resources
*/

/** BrickadiaServer - manages the server child process */
import * as Server from '@brickadia/server';
/** config writer for brickadia */
import * as brConfig from '@brickadia/config';

export const brickadia = { Server, config: brConfig };

/** the actual object can be required too */
import Omegga from '@omegga/server';
export default Omegga;

/** brickadia server wrapper, log parser, and plugin runner */
export * as omegga from './omegga';

/** utility functions */
export * as util from '@util';

/** config */
export * as config from '@config';
