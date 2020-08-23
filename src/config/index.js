const fs = require('fs');
const path = require('path');

// find all format_EXT.js files in the formats path
const formats = fs.readdirSync(path.join(__dirname, 'formats'))
  // all formats match the format_EXT.js pattern
  .filter(file => file.match(/format_[a-z]+\.js/))
  // require all the formats
  .map(file => require('./formats/' + file))
  // format has a valid extension, reader, and writer
  .filter(format =>
    format.extension && format.extension.match(/^[a-z]+$/) &&
    format.encoding && format.encoding.match(/^(string|buffer)$/) &&
    format.reader && typeof format.reader === 'function' &&
    format.writer && typeof format.writer === 'function'
  );

// create read/write funcs for the provided formats
module.exports = {
  // Writes save data to a file
  // function(path, blob) -> void
  write: require('./writer.js')(formats),

  // reads save data from a file
  // function(path) -> config
  read: require('./reader.js')(formats),
};
