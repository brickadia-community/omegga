const yaml = require('js-yaml');

module.exports = {
  extension: 'yml',
  encoding: 'string',
  reader: str => yaml.safeLoad(str),
  writer: blob => yaml.safeDump(blob),
};
