const { translationTable, rotationTable } = require('./constants');

const d2o = (direction, rotation) => (direction << 2) | rotation;
const o2d = orientation => [(orientation >> 2) % 6, orientation & 3];
const rotateDirection = (a, b) =>
  o2d(rotationTable[d2o(...a) * 24 + d2o(...b)]);

// Rotate a brick on its axis
const rotate = (brick, rotation) => {
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

function repeat(t, fn) {
  return obj => {
    for (let i = 0; i < t; i++) {
      obj = fn(obj);
    }
    return obj;
  };
}

const rotate_x = times => repeat(times, brick => rotate(brick, [3, 3]));
const rotate_y = times => repeat(times, brick => rotate(brick, [1, 0]));
const rotate_z = times => repeat(times, brick => rotate(brick, [4, 1]));

module.exports = {
  rotate,
  rotate_x,
  rotate_y,
  rotate_z,
  d2o,
  o2d,
};
