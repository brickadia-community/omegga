const { brickSizeMap } = require('./constants');

// get brick size for special bricks
function getBrickSize(brick, brick_assets) {
  const asset = brick_assets[brick.asset_name_index];
  return brickSizeMap[asset] || brick.size;
}

module.exports = getBrickSize;
