const getScaleAxis = require('./getScaleAxis');
const getBrickSize = require('./getBrickSize');

// compare bound to see if it is new min or max, and then replace if it is
function minMaxBound(brick, brick_assets, bounds, axis) {
  const scaleAxis = getScaleAxis(brick, axis);
  const size = getBrickSize(brick, brick_assets);
  const upper = brick.position[axis] + size[scaleAxis];
  const lower = brick.position[axis] - size[scaleAxis];
  if (upper > bounds.maxBound[axis] || bounds.maxBound[axis] === undefined)
    bounds.maxBound[axis] = upper;
  if (lower < bounds.minBound[axis] || bounds.minBound[axis] === undefined)
    bounds.minBound[axis] = lower;
}

// returns bounds of the array of the brick
function getBounds({ bricks, brick_assets }) {
  const bounds = { minBound: [], maxBound: [], center: [] };

  bricks.forEach(brick => {
    minMaxBound(brick, brick_assets, bounds, 0);
    minMaxBound(brick, brick_assets, bounds, 1);
    minMaxBound(brick, brick_assets, bounds, 2);
  });

  // calculate center from min and max bounds
  bounds.center = bounds.minBound.map((min, index) => {
    const max = bounds.maxBound[index];
    const avg = (max + min) / 2;
    return Math.round(avg);
  });

  return bounds;
}

module.exports = getBounds;
