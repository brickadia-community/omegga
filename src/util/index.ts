// santize chat, emote list
import {
  EMOTES,
  sanitize,
  parseLinks,
  attr,
  attrParam,
  color as chatColor,
  bold,
  italic,
  underline,
  emoji,
  code,
  font,
  size,
  link,
  red,
  green,
  blue,
  yellow,
  cyan,
  magenta,
  black,
  white,
  gray,
} from './chat';
export const chat = {
  EMOTES,
  sanitize,
  parseLinks,
  attr,
  attrParam,
  color: chatColor,
  bold,
  italic,
  underline,
  emoji,
  code,
  font,
  size,
  link,
  red,
  green,
  blue,
  yellow,
  cyan,
  magenta,
  black,
  white,
  gray,
};

// hsv and sRGB to linearRGB helpers
import { hsv, linearRGB, sRGB, rgbToHex, DEFAULT_COLORSET } from './color';
export const color = { hsv, linearRGB, sRGB, rgbToHex, DEFAULT_COLORSET };

// uuid utils
import { UUID_PATTERN, match } from './uuid';
export const uuid = { UUID_PATTERN, match };

// pattern matching utils
import { explode } from './pattern';
export const pattern = { explode };

// time parsing utils
import { parseDuration, parseBrickadiaTime } from './time';
export const time = { parseDuration, parseBrickadiaTime };

// map parsing utils
import { DEFAULT_MAPS, brn2n, n2brn } from './map';
export const map = { DEFAULT_MAPS, brn2n, n2brn };

// brick utils
import {
  BRICK_CONSTANTS,
  checkBounds,
  getBounds,
  getBrickSize,
  getScaleAxis,
  setOwnership,
  rotate,
  rotate_x,
  rotate_y,
  rotate_z,
  d2o,
  o2d,
} from './brick';
export const brick = {
  BRICK_CONSTANTS,
  checkBounds,
  getBounds,
  getBrickSize,
  getScaleAxis,
  setOwnership,
  rotate,
  rotate_x,
  rotate_y,
  rotate_z,
  d2o,
  o2d,
};

// wsl
export const wsl = (): number => require('./wsl');

// brs
export * as brs from 'brs-js';
import * as brs from 'brs-js';

export default { chat, color, uuid, pattern, time, map, brick, wsl, brs };
