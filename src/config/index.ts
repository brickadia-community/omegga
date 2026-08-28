import Logger from '@/logger';
import soft from '@/softconfig';
import 'colors';
import Configstore from 'configstore';
import fs from 'node:fs';
import path from 'node:path';
import format_js from './formats/format_js';
import format_yaml from './formats/format_yml';
import reader from './reader';
import { type IConfig, type IConfigFormat } from './types';
import writer from './writer';
export * from './types';

export const store = new Configstore(
  soft.PROJECT_NAME,
  {
    defaultOmegga: '.',
    legacyBin: '',
  },
  {
    globalConfigPath: true,
  },
);

// find all format_EXT.js files in the formats path
const formats: IConfigFormat[] = [format_js, format_yaml];

// create read/write funcs for the provided formats
export const defaultConfig: IConfig = {
  omegga: {
    webui: true,
    port: process.env.OMEGGA_PORT
      ? Number(process.env.OMEGGA_PORT)
      : soft.DEFAULT_PORT,
    https: true,
  },
  server: {
    port: process.env.BRICKADIA_PORT
      ? Number(process.env.BRICKADIA_PORT)
      : 7777,
    map: 'Plate',
  },
};

/**
 * Apply `OMEGGA_PORT` and `BRICKADIA_PORT` on top of a loaded config. A
 * container's config file lives in a mounted volume that can't be templated,
 * so the environment has to be able to win.
 */
export function applyPortOverrides(conf: IConfig): IConfig {
  const parsePort = (name: string) => {
    const raw = process.env[name];
    if (!raw) return undefined;
    const port = Number(raw);
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
    Logger.warnp(`Ignoring ${name.yellow}: ${raw.yellow} is not a port`);
    return undefined;
  };

  const omeggaPort = parsePort('OMEGGA_PORT');
  if (omeggaPort) conf.omegga = { ...conf.omegga, port: omeggaPort };

  const serverPort = parsePort('BRICKADIA_PORT');
  if (serverPort) conf.server = { ...conf.server, port: serverPort };

  return conf;
}

// Writes save data to a file
export const write = writer(formats);

// reads save data from a file
export const read = reader(formats);

// open config at a specified path
export const find = (dir = '.') => {
  // find the first config file matching these config file names
  for (const f of soft.CONFIG_FILENAMES) {
    for (const { extension } of formats) {
      const file = path.join(dir, f + '.' + extension);
      if (fs.existsSync(file)) return file;
    }
  }

  return undefined;
};

export * from './types';

export default {
  store,
  write,
  read,
  find,
  defaultConfig,
  formats,
  applyPortOverrides,
};
