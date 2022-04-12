import { Brick } from 'brs-js/dist/src/types';

import getScaleAxis from './getScaleAxis';
import getBrickSize from './getBrickSize';

export interface IBrickBounds {
  minBound: number[];
  maxBound: number[];
  center: number[];
}

// check if the brick is in bounds for 1 axis
function checkBound(
  brick: Brick,
  brick_assets: string[],
  bounds: IBrickBounds,
  axis: number
) {
  const scaleAxis = getScaleAxis(brick, axis);
  const size = getBrickSize(brick, brick_assets);
  const upper = brick.position[axis] + size[scaleAxis];
  const lower = brick.position[axis] - size[scaleAxis];
  return upper <= bounds.maxBound[axis] && lower >= bounds.minBound[axis];
}

// check if the brick is in bounds
export default function checkBounds(
  brick: Brick,
  brick_assets: string[],
  bounds: IBrickBounds
) {
  return (
    checkBound(brick, brick_assets, bounds, 0) &&
    checkBound(brick, brick_assets, bounds, 1) &&
    checkBound(brick, brick_assets, bounds, 2)
  );
}
