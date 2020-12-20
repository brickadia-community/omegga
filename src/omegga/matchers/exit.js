module.exports = omegga => {
  return {
    // listen for exit messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;
      // check if log is the kill server log
      return generator.match(/^LogExit$/) && data.match(/^Game engine shut down$/);
    },
    // when there's a match, emit the exit message event
    callback() {
      omegga.emit('exit');
    },
  };
};