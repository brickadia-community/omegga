module.exports = omegga => {
  return {
    // listen for auth messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;
      // check if log is an auth log
      return generator === 'LogServerList' && data === 'Deleting server.';
    },
    // when there's a match, emit the chat message event
    callback(exit) {
      omegga.emit('exit');
    },
  };
};