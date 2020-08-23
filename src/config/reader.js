const fs = require('fs');
const validate = require('./validator.js');

// given a list of formats, generate a function to write to any of those formats
module.exports = formats => path => {
  // find the config format that matches this extension
  const ext = path.split('.').pop().toLowerCase();
  const format = formats.find(f => f.extension === ext);
  if (!format)
    throw 'missing format';

  if (!fs.existsSync(path))
    throw 'missing file';

  // read the config file
  const data = fs.readFileSync(path);

  // parse the config file
  const blob = format.reader(format.encoding === 'string' ? data.toString() : data);

  // validate the config blob
  const result = validate(blob);
  if (!result.valid)
    throw result.errors;

  // return the parsed config
  return blob;
};