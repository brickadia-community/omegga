// if this module has a parent, return the lib, otherwise run the cli
if (module.parent) {
  module.exports = require('./src/lib.js');
} else {
  require('./src/main.js');
}
