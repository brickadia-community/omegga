// if this module has a parent, return the lib, otherwise run the cli
if (module.parent) {
  module.exports = require('./dist/index.js');
} else {
  require('./dist/main.js');
}
