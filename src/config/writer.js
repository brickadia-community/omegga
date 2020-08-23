const fs = require('fs');
const validate = require('./validator.js');

// given a list of formats, generate a function for write to any of those formats
module.exports = formats => (path, blob) => {
  // find the config format that matches this extension
  const ext = path.split('.').pop().toLowerCase();
  const format = formats.find(f => f.extension === ext);
  if (!format)
    throw 'missing format';

  // validate the config blob
  const result = validate(blob);
  if (!result.valid)
    throw result.errors;

  // encode the config data into the format
  const data = format.writer(blob);

  // write the encoded config to file
  fs.writeFileSync(path, data);
};