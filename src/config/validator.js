const Validator = require('jsonschema').Validator;

// The JSON Schema for config file format
// visit http://json-schema.org/ for more info on JSON Schema

// TODO: Add Roles, BanList, Etc
// TODO: Separate schema into separate files

//. the JSON schema for the config file output
const schema = require('./schema.json');

// export a single function that validates a config object
module.exports = obj => {
  const v = new Validator();
  return v.validate(obj, schema);
};