module.exports = omegga => {
  const versionRegExp = /^Using libcurl (?<curlversion>.+)$/;
  let foundVersion;
  return {
    pattern(_line, logMatch) {
      // if the version has already been found - ignore this matcher
      if (foundVersion || !logMatch) return;

      const { generator, data } = logMatch.groups;

      // check if log is a command log
      if (generator !== 'LogInit') return;

      const match = data.match(versionRegExp);

      // base game version on curl version
      if (match) {
        foundVersion = match.groups.curlversion === '7.48.0-DEV' ? 'a4' : 'a5';
        return foundVersion;
      }
    },
    // when there's a match, emit the chat message event
    callback(version) {
      omegga.version = version;
    },
  };
};