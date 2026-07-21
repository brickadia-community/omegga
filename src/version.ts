import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- resolved relative to the build output at runtime
export const PKG = require(path.join(__dirname, '../package.json'));
export const VERSION = PKG.version;
