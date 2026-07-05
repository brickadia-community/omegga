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
import { UUID_PATTERN, match, random } from './uuid';
const uuid = { UUID_PATTERN, match, random };

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
import { checkWsl } from './wsl';
const wsl = (): number => checkWsl();

import brs_, {
  Brdb,
  WorldReader,
  brdb as brdbLib,
  ReadSaveObject,
  WriteSaveObject,
  Uuid,
} from 'brs-js';

// this type has to exist or the dts exporter will try to dynamically export brs-js
const brs: {
  read(
    rawBytes: Uint8Array,
    options?: {
      bricks?: boolean;
      preview?: boolean;
    },
  ): ReadSaveObject;
  write(
    save: WriteSaveObject,
    options?: {
      compress?: boolean;
    },
  ): Uint8Array;
  utils: any;
  constants: {
    MAGIC: Uint8Array;
    LATEST_VERSION: number;
    MAX_INT: number;
    DEFAULT_UUID: Uuid;
  };
} = brs_ as any;

// brdb container + brz world reading/writing features from brs-js. Members
// are listed explicitly (rather than `typeof brdbLib`) so the dts bundler
// inlines each type instead of emitting a dynamic `import("brs-js/...")` the
// self-contained plugin template cannot resolve.
const brdb = {
  // container + world reader
  Brdb,
  WorldReader,
  BrzReader: brdbLib.BrzReader,
  writeBrzContainer: brdbLib.writeBrzContainer,
  writeBrzLegacy: brdbLib.writeBrzLegacy,
  saveToPendingFs: brdbLib.saveToPendingFs,
  toRelative: brdbLib.toRelative,
  MAIN_GRID: brdbLib.MAIN_GRID,
  CHUNK_SIZE: brdbLib.CHUNK_SIZE,
  CHUNK_HALF: brdbLib.CHUNK_HALF,
  // schema
  BrdbSchema: brdbLib.BrdbSchema,
  embeddedSchema: brdbLib.embeddedSchema,
  // guid conversion
  guidToUuid: brdbLib.guidToUuid,
  uuidToGuid: brdbLib.uuidToGuid,
  PUBLIC_GUID: brdbLib.PUBLIC_GUID,
  // pending-tree + catalog helpers
  file: brdbLib.file,
  folder: brdbLib.folder,
  isProceduralAsset: brdbLib.isProceduralAsset,
  // low-level building blocks
  bit: brdbLib.bit,
  BitFlags: brdbLib.BitFlags,
  ByteReader: brdbLib.ByteReader,
  ByteWriter: brdbLib.ByteWriter,
  // msgpack is a namespace; cast to any so the dts bundler emits `any`
  // rather than an unresolvable `import("brs-js/.../msgpack.js")`
  msgpack: brdbLib.msgpack as any,
};

export * as brs from 'brs-js';
export { chat, color, uuid, pattern, time, map, brick, wsl, brdb };

const OMEGGA_UTIL = {
  chat,
  color,
  uuid,
  pattern,
  time,
  map,
  brick,
  wsl,
  brs,
  brdb,
};
export default OMEGGA_UTIL;
