// regex pattern that matches uuids
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

module.exports = {
  match: str => !!str.match(UUID_PATTERN),
  UUID_PATTERN,
};