/*
  The wrapper combines the things looking at or waiting for logs with the actual server logs
*/

import soft from '@/softconfig';
import BrickadiaServer from '@brickadia/server';
import { IConfig } from '@config/types';
import EventEmitter from 'events';
import path from 'path';
import LogWrangler from './logWrangler';
import type Omegga from './server';

class OmeggaWrapper extends EventEmitter {
  #server: BrickadiaServer;
  dataPath: string;
  path: string;

  logWrangler: LogWrangler;
  addMatcher: LogWrangler['addMatcher'];
  addWatcher: LogWrangler['addWatcher'];
  watchLogArray: LogWrangler['watchLogArray'];
  watchLogChunk: LogWrangler['watchLogChunk'];

  config: IConfig;

  constructor(serverPath: string, cfg: IConfig) {
    super();
    this.setMaxListeners(Infinity);

    this.config = cfg;
    this.path =
      path.isAbsolute(serverPath) || serverPath.startsWith('/')
        ? serverPath
        : path.join(process.cwd(), serverPath);
    this.dataPath = path.join(this.path, soft.DATA_PATH);
    this.#server = new BrickadiaServer(this.dataPath, cfg);

    // log wrangler wrangles logs... it reads brickadia logs and clumps them together
    // this is cursed but the OmeggaWrapper will never be used without omegga...
    this.logWrangler = new LogWrangler(this as unknown as Omegga);
    this.#server.on('line', this.logWrangler.callback);
    this.#server.on('line', (line: string) => this.emit('line', line));
    this.#server.on('closed', () => this.emit('closed'));
    this.addMatcher = this.logWrangler.addMatcher;
    this.addWatcher = this.logWrangler.addWatcher;
    this.watchLogArray = this.logWrangler.watchLogArray;
    this.watchLogChunk = this.logWrangler.watchLogChunk;
  }

  // passthrough to server
  write(str: string) {
    this.#server.write(str);
  }
  writeln(str: string) {
    this.#server.writeln(str);
  }
  start() {
    return this.#server.start();
  }
  stop() {
    return this.#server.stop();
  }

  // event emitter to catch everything
  emit(type: string, ...args: any[]) {
    try {
      super.emit('*', type, ...args);
    } catch (e) {
      // error emitting
    }
    return super.emit(type, ...args);
  }
}

export default OmeggaWrapper;
