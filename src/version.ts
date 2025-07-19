import path from 'path';

export const PKG = require(path.join(__dirname, '../package.json'));
export const VERSION = PKG.version;
