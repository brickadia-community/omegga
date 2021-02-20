module.exports = {
  BRICK_CONSTANTS: require('./constants'),
  checkBounds: require('./checkBounds'),
  getBounds: require('./getBounds'),
  getBrickSize: require('./getBrickSize'),
  getScaleAxis: require('./getScaleAxis'),
  setOwnership: require('./setOwnership'),
  ...require('./rotate')
};