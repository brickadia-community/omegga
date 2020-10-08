const fs = require('fs');
const path = require('path');

const { store } = require('../config/index.js');

const err = (...args) => console.error('!>'.red, ...args);
const log = (...args) => console.log('>>'.green, ...args);

const fields = {
  default: {
    desc: 'default omegga project directory when running omegga in a non-configured folder',
    example: 'omegga config default $(pwd)',
    default: '.',
    get() {
      let val = store.get('defaultOmegga') || '.';
      if (val === '.') val += ' [current working dir]'.grey;
      return val;
    },
    set(val) {
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
  legacy: {
    desc: 'path to a4 binary for users without access to the brickadia launcher',
    example: 'omegga config legacy path/to/Brickadia/Binaries/Linux/BrickadiaServer-Linux-Shipping',
    default: '[not set]'.grey,
    get() {
      let val = store.get('legacyBin') || '';
      if (val === '') val += 'disabled'.green;
      return val;
    },
    set(val) {
      if (!val || val === 'disabled') {
        val = '';
      } else {
        // check if the path is valid
        if (!path.isAbsolute(val)) {
          err('setting must be an absolute path or "."');
          process.exit(1);
          return;
        }
        if (!fs.existsSync(val)) {
          err('given path does not exist');
          process.exit(1);
          return;
        }
        if (!fs.statSync(val).isFile) {
          err('given path is not for a file');
          process.exit(1);
          return;
        }
      }


      // update the setting
      store.set('legacyBin', val);
      log('Set', 'legacy'.green, 'to', (val || 'disabled').green);
    },
  },
};

module.exports = (field, value, _opts={}) => {
  // list command lists all fields, current setting, and description
  if (field === 'list') {
    log('Configurable fields:');
    const maxLen = Math.max(...Object.keys(fields).map(f => f.length));
    for (const key in fields) {
      const field = fields[key];
      console.log('\n  ' + key.yellow.underline,
        '-'.padStart(maxLen - key.length + 1),
        field.desc,
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
    err('invalid field, run', 'omegga config list'.yellow.underline, 'for a list of available fields');
    process.exit(1);
  }
};