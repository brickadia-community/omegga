module.exports = omegga => {
  return {
    // listen for auth messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;
      // check if log is the kill server log
      return generator === 'LogExit' && data === 'Shutting down Auth Manager.';
    },
    // when there's a match, emit the chat message event
    callback() {
      omegga.emit('exit');
    },
  };
};