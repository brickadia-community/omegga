import { Brick } from 'brs-js';
import { brickSizeMap } from './constants';

// get brick size for special bricks
export function getBrickSize(brick: Brick, brick_assets: string[]) {
  const asset = brick_assets[brick.asset_name_index];
  return brickSizeMap[asset] || brick.size;
}
export default getBrickSize;
