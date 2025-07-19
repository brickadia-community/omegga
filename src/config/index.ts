import soft from '@/softconfig';
import Configstore from 'configstore';
import fs from 'fs';
import path from 'path';
import format_js from './formats/format_js';
import format_yaml from './formats/format_yml';
import reader from './reader';
import { IConfig, IConfigFormat } from './types';
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

export default { store, write, read, find, defaultConfig, formats };
