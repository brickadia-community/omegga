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
const chat = {
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
const color = { hsv, linearRGB, sRGB, rgbToHex, DEFAULT_COLORSET };

// uuid utils
import { UUID_PATTERN, match } from './uuid';
const uuid = { UUID_PATTERN, match };

// pattern matching utils
import { explode } from './pattern';
const pattern = { explode };

// time parsing utils
import { parseDuration, parseBrickadiaTime, debounce } from './time';
const time = { parseDuration, parseBrickadiaTime, debounce };

// map parsing utils
import { DEFAULT_MAPS, brn2n, n2brn } from './map';
const map = { DEFAULT_MAPS, brn2n, n2brn };

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

const brick = {
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
const wsl = (): number => require('./wsl');

import brs_, { ReadSaveObject, WriteSaveObject, Uuid } from 'brs-js';

// this type has to exist or the dts exporter will try to dynamically export brs-js
const brs: {
  read(
    rawBytes: Uint8Array,
    options?: {
      bricks?: boolean;
      preview?: boolean;
    }
  ): ReadSaveObject;
  write(
    save: WriteSaveObject,
    options?: {
      compress?: boolean;
    }
  ): Uint8Array;
  utils: any;
  constants: {
    MAGIC: Uint8Array;
    LATEST_VERSION: number;
    MAX_INT: number;
    DEFAULT_UUID: Uuid;
  };
} = brs_ as any;

export * as brs from 'brs-js';
export { chat, color, uuid, pattern, time, map, brick, wsl };

export default { chat, color, uuid, pattern, time, map, brick, wsl, brs };
