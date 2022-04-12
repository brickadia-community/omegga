import { Brick } from 'brs-js/dist/src/types';
import { translationTable, rotationTable } from './constants';

const d2o = (direction: number, rotation: number) =>
  (direction << 2) | rotation;
const o2d = (orientation: number) => [(orientation >> 2) % 6, orientation & 3];
const rotateDirection = (a: [number, number], b: [number, number]) =>
  o2d(rotationTable[d2o(...a) * 24 + d2o(...b)]);

// Rotate a brick on its axis
const rotate = (brick: Brick, rotation: [number, number]) => {
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
};

function repeat<T>(times: number, fn: (o: T) => T) {
  return (obj: T) => {
    for (let i = 0; i < times; i++) {
      obj = fn(obj);
    }
    return obj;
  };
}

const rotate_x = (times: number) =>
  repeat(times, (brick: Brick) => rotate(brick, [3, 3]));
const rotate_y = (times: number) =>
  repeat(times, (brick: Brick) => rotate(brick, [1, 0]));
const rotate_z = (times: number) =>
  repeat(times, (brick: Brick) => rotate(brick, [4, 1]));

export { rotate, rotate_x, rotate_y, rotate_z, d2o, o2d };
export default { rotate, rotate_x, rotate_y, rotate_z, d2o, o2d };
