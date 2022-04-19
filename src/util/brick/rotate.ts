import { Brick } from 'brs-js';
import { translationTable, rotationTable } from './constants';

export const d2o = (direction: number, rotation: number) =>
  (direction << 2) | rotation;
export const o2d = (orientation: number) => [
  (orientation >> 2) % 6,
  orientation & 3,
];
const rotateDirection = (a: [number, number], b: [number, number]) =>
  o2d(rotationTable[d2o(...a) * 24 + d2o(...b)]);

// Rotate a brick on its axis
export function rotate(brick: Brick, rotation: [number, number]) {
  // copy the brick
  brick = { ...brick };
  // use default values if none exist
  const { direction: brick_direction = 4, rotation: brick_rotation = 0 } =
    brick;
  const [d, r] = rotateDirection([brick_direction, brick_rotation], rotation);
  brick.direction = d;
  brick.rotation = r;
  brick.position = translationTable[d2o(...rotation)](brick.position);

  return brick;
}

function repeat<T>(times: number, fn: (o: T) => T) {
  return (obj: T) => {
    for (let i = 0; i < times; i++) {
      obj = fn(obj);
    }
    return obj;
  };
}

export function rotate_x(times: number) {
  return repeat(times, (brick: Brick) => rotate(brick, [3, 3]));
}
export function rotate_y(times: number) {
  return repeat(times, (brick: Brick) => rotate(brick, [1, 0]));
}
export function rotate_z(times: number) {
  return repeat(times, (brick: Brick) => rotate(brick, [4, 1]));
}

export default { rotate, rotate_x, rotate_y, rotate_z, d2o, o2d };
