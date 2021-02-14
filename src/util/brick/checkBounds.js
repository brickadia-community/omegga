const getScaleAxis = require('./getScaleAxis');
const getBrickSize = require('./getBrickSize');

// check if the brick is in bounds for 1 axis
function checkBound(brick, brick_assets, bounds, axis) {
  const scaleAxis = getScaleAxis(brick, axis);
  const size = getBrickSize(brick, brick_assets);
  const upper = brick.position[axis] + size[scaleAxis];
  const lower = brick.position[axis] - size[scaleAxis];
  return upper <= bounds.maxBound[axis] && lower >= bounds.minBound[axis];
}

// check if the brick is in bounds
function checkBounds(brick, brick_assets, bounds) {
  return checkBound(brick, brick_assets, bounds, 0) && checkBound(brick, brick_assets, bounds, 1) && checkBound(brick, brick_assets, bounds, 2);
}

module.exports = checkBounds;