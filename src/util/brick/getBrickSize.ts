import { Brick } from 'brs-js/dist/src/types';
import { brickSizeMap } from './constants';

// get brick size for special bricks
export default function getBrickSize(brick: Brick, brick_assets: string[]) {
  const asset = brick_assets[brick.asset_name_index];
  return brickSizeMap[asset] || brick.size;
}
