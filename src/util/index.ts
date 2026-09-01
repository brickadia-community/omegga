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

// Sqlite: the better-sqlite3 constructor, so plugins can open their own
// databases (e.g. reading .brdb worlds via OMEGGA_UTIL.brdb). @types/better-
// sqlite3 hides its `DatabaseConstructor` in a non-exported namespace, so the
// bare `typeof` isn't nameable in declaration emit; instead spell out the
// constructor signature from the exported `Database`/`Options` interfaces.
// Those (and their transitive types) inline into the self-contained plugin
// template via the dts bundler's --external-inlines better-sqlite3.
import BetterSqlite3 from 'better-sqlite3';
const Sqlite: new (
  filename?: string | Buffer,
  options?: BetterSqlite3.Options,
) => BetterSqlite3.Database = BetterSqlite3;

import brs_, {
  Brdb,
  WorldReader,
  brdb as brdbLib,
  type ReadSaveObject,
  type WriteSaveObject,
  type Uuid,
} from 'brs-js';

// this type has to exist or the dts exporter will try to dynamically export brs-js
type BrsModule = {
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
  // `utils` is a namespace, and it reaches plugins through the generated
  // omegga.d.ts. Naming its real type there would emit an unresolvable
  // `import("brs-js/...")`, and `unknown` would make it uncallable for
  // plugins, so `any` is the deliberate choice.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  utils: any;
  constants: {
    MAGIC: Uint8Array;
    LATEST_VERSION: number;
    MAX_INT: number;
    DEFAULT_UUID: Uuid;
  };
};

// the runtime module is wider than the shape above; assert through unknown
// rather than through `any` so the target type is still checked
const brs: BrsModule = brs_ as unknown as BrsModule;

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
  // rather than an unresolvable `import("brs-js/.../msgpack.js")`, and so
  // plugins can still call into it (`unknown` would not be callable)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msgpack: brdbLib.msgpack as any,
};

export * as brs from 'brs-js';
export { chat, color, uuid, pattern, time, map, brick, wsl, brdb, Sqlite };

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
  Sqlite,
};
export default OMEGGA_UTIL;
