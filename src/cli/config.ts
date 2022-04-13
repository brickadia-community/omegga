import fs from 'fs';
import path from 'path';

import { store } from '../config';

const err = (...args: any[]) => console.error('!>'.red, ...args);
const log = (...args: any[]) => console.log('>>'.green, ...args);

interface IConfigField {
  desc: string;
  example: string;
  default: string;
  get(): string;
  set(value: string): void;
}

const fields: Record<string, IConfigField> = {
  default: {
    desc: 'default omegga project directory when running omegga in a non-configured folder',
    example: 'omegga config default $(pwd)',
    default: '.',
    get() {
      let val = store.get('defaultOmegga') || '.';
      if (val === '.') val += ' [current working dir]'.grey;
      return val;
    },
    set(val: string) {
      if (!val) {
        val = '.';
      }

      // check if the path is valid
      if (val !== '.' && !path.isAbsolute(val)) {
        err('setting must be an absolute path or "."');
        process.exit(1);
        return;
      }
      if (!fs.existsSync(val)) {
        err('given path does not exist');
        process.exit(1);
        return;
      }
      if (!fs.statSync(val).isDirectory) {
        err('given path is not for a directory');
        process.exit(1);
        return;
      }

      // update the setting
      store.set('defaultOmegga', val);
      log('Set', 'default'.green, 'to', val.green);
    },
  },
};

export default (
  field: keyof typeof fields | 'list',
  value: string,
  _opts = {}
) => {
  // list command lists all fields, current setting, and description
  if (field === 'list') {
    log('Configurable fields:');
    const maxLen = Math.max(...Object.keys(fields).map(f => f.length));
    for (const key in fields) {
      const field = fields[key];
      console.log(
        '\n  ' + key.yellow.underline,
        '-'.padStart(maxLen - key.length + 1),
        field.desc
      );
      console.log('    current'.brightGreen + ':', field.get());
      console.log('    default:', field.default);
      console.log('    example'.brightBlue + ':', field.example);
    }
    console.log();
  } else if (fields[field]) {
    // a valid field was entered - run the set command
    fields[field].set(value);
  } else {
    // no valid field was entered
    err(
      'invalid field, run',
      'omegga config list'.yellow.underline,
      'for a list of available fields'
    );
    process.exit(1);
  }
};
