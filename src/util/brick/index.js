module.exports = {
  BRICK_CONSTANTS: require('./constants'),
  checkBounds: require('./checkBounds'),
  getBounds: require('./getBounds'),
  getBrickSize: require('./getBrickSize'),
  setOwnership: require('./setOwnership'),
  ...require('./rotate')
};