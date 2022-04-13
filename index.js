// if this module has a parent, return the lib, otherwise run the cli
if (module.parent) {
  module.exports = require('./dist/lib.js');
} else {
  require('source-map-support').install({
    hookRequire: true,
  });

  // process.on('unhandledRejection', (error, p) => {
  //   console.log(error, error.stack);
  // });

  require('./dist/main.js');
}
