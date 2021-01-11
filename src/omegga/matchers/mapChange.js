const { map: mapUtils } = require('../../util/index.js');
module.exports = omegga => {
  // LogLoad: Took 0.396473 seconds to LoadMap(/Game/Maps/Plate/Plate)
  const mapChangeRegExp = /^Took .+ seconds to LoadMap\((?<map>.+)\)$/;

  return {
    // listen for commands messages
    pattern(_line, logMatch) {
      // line is not generic console log
      if (!logMatch) return;

      const { generator, data } = logMatch.groups;
      // check if log is a world log
      if (generator !== 'LogLoad') return;

      // match the log to the map change finish pattern
      const matchChange = data.match(mapChangeRegExp);
      if (matchChange && matchChange.groups && matchChange.groups.map) {
        return mapUtils.brn2n(matchChange.groups.map);
      }

      return null;
    },
    // when there's a match, emit the comand event
    callback(map) {
      // if the only argument is an empty string, ignore it
      if (map) {
        // dont emit on startup or when there is no current map
        if (omegga.started && omegga.currentMap)
          omegga.emit('mapchange', { map });

        // set omegga's current map
        omegga.currentMap = map;
      }
    },
  };
};