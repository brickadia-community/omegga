import { Brick } from 'brs-js/dist/src/types';
import getScaleAxis from './getScaleAxis';
import getBrickSize from './getBrickSize';
import type { IBrickBounds } from './checkBounds';
import type { brickSizeMap } from './constants';

// compare bound to see if it is new min or max, and then replace if it is
function minMaxBound(
  brick: Brick,
  brick_assets: string[],
  bounds: IBrickBounds,
  axis: number
) {
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
export default function getBounds({
  bricks,
  brick_assets,
}: {
  bricks: Brick[];
  brick_assets: string[];
}) {
  const bounds: IBrickBounds = { minBound: [], maxBound: [], center: [] };

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
