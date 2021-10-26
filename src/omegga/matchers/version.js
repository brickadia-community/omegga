const fs = require('fs');
const path = require('path');
const softconfig = require('../../softconfig');

module.exports = omegga => {
  const versionRegExp = /^Using libcurl (?<curlversion>.+)$/;
  let version;
  return {
    pattern(_line, logMatch) {
      // if the version has already been found - ignore this matcher
      if (version || !logMatch) return;

      const { generator, data } = logMatch.groups;

      // check if log is a command log
      if (generator !== 'LogInit') return;

      const match = data.match(versionRegExp);

      const branch = omegga.config.server.branch ?? 'main-server';
      const configPath = path.join(
        softconfig.BRICKADIA_INSTALLS,
        branch.split(':')[0] + '.json'
      );

      // base game version on curl version
      if (match) {
        try {
          version = Number(
            JSON.parse(fs.readFileSync(configPath)).version.substring(2)
          );
        } catch (e) {
          console.error('!>'.red, 'Unable to read branch config file: ', e);
          version = -1;
        }
        return version;
      }
    },
    // when there's a match, emit the chat message event
    callback(version) {
      omegga.emit('version', version);
      omegga.version = version;
    },
  };
};
