import { Brick } from 'brs-js';

// get scale axis for scale when using rotation and orientation
export function getScaleAxis(brick: Brick, axis: number) {
  const { direction, rotation } = brick;
  if ([0, 1].includes(direction)) {
    if (axis === 0) {
      axis = 2;
    } else if (axis === 2) {
      axis = 0;
    }
  } else if ([2, 3].includes(direction)) {
    if (axis === 0) {
      axis = 1;
    } else if (axis === 1) {
      axis = 2;
    } else if (axis === 2) {
      axis = 0;
    }
  }

  if ([1, 3].includes(rotation)) {
    if (axis === 0) {
      axis = 1;
    } else if (axis === 1) {
      axis = 0;
    }
  }

  return axis;
}
export default getScaleAxis;
