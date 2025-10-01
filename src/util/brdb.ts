import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { zstdDecompressSync } from 'zlib';

/** Open a brdb file if it exists */
function openBrdb(path: string): BetterSqlite3.Database | null {
  if (!existsSync(path)) return null;
  try {
    return new BetterSqlite3(path, { readonly: true, fileMustExist: true });
  } catch (err) {
    console.error(`Error reading BRDB metadata from ${path}:`, err);
    return null;
  }
}

/** Unsafely read a file from the BRDB database */
function readFile(db: BetterSqlite3.Database, name: string): Buffer | null {
  const row = db
    .prepare<
      string,
      {
        compression: number;
        size_uncompressed: number;
        size_compressed: number;
        content: Buffer | null;
      }
    >(
      `SELECT compression, size_uncompressed, size_compressed, content
      FROM files
      LEFT JOIN blobs ON files.content_id = blobs.blob_id
      WHERE name = ? AND deleted_at IS NULL;`,
    )
    .get(name);

  if (!row) return null;
  if (row.content === null) return null;
  if (!row.compression || row.size_compressed >= row.size_uncompressed)
    return row.content;

  return zstdDecompressSync(row.content, {
    maxOutputLength: row.size_uncompressed,
    params: {},
  });
}

/** read the meta and owner data from a brdb file */
// TODO: specify a create/delete time range for the reading the owner data to allow "browsing" of revisions
export function readBrdbMeta(path: string) {
  const db = openBrdb(path);
  if (!db) return null;

  try {
    const worldJson: { environment: string } = JSON.parse(
      readFile(db, 'World.json').toString('utf8'),
    );
    const bundleJson: {
      type: 'World';
      iD: string;
      name: string;
      version: string;
      tags: string[];
      authors: string[];
      createdAt: string;
      updatedAt: string;
      description: string;
      dependencies: string[];
    } = JSON.parse(readFile(db, 'Bundle.json').toString('utf8'));

    // parse the owner schema and its data
    const ownersSchemaBuf = readFile(db, 'Owners.schema');
    const ownersBuf = readFile(db, 'Owners.mps');

    // Convert the struct of arrays into an array of structs
    const owners: {
      id: string;
      name: string;
      display_name: string;
      entity_count: number;
      brick_count: number;
      component_count: number;
      wire_count: number;
    }[] = [];

    if (ownersBuf && ownersSchemaBuf) {
      const ownersSchema = readBrdbSchema(ownersSchemaBuf);
      const { value: ownersMps } = readBrdbType(
        ownersBuf,
        0,
        ownersSchema,
        'BRSavedOwnerTableSoA',
      );

      for (let i = 0; i < ownersMps['UserIds'].length; i++) {
        const id = guidToUuid(ownersMps['UserIds'][i]);
        const name: string = ownersMps['UserNames'][i];
        const display_name: string = ownersMps['DisplayNames'][i];
        const entity_count: number = ownersMps['EntityCounts'][i];
        const brick_count: number = ownersMps['BrickCounts'][i];
        const component_count: number = ownersMps['ComponentCounts'][i];
        const wire_count: number = ownersMps['WireCounts'][i];
        owners.push({
          id,
          name,
          display_name,
          entity_count,
          brick_count,
          component_count,
          wire_count,
        });
      }
    }

    db.close();

    return {
      meta: { world: worldJson, bundle: bundleJson },
      owners,
    };
  } catch (err) {
    console.error(`Error reading BRDB metadata from ${path}:`, err);
    db.close();
    return null;
  }
}

/** read the screenshot from a brdb file */
export function readBrdbScreenshot(path: string): Buffer | null {
  const db = openBrdb(path);
  if (!db) return null;
  try {
    const file = readFile(db, 'Screenshot.jpg');
    db.close();
    return file;
  } catch (err) {
    console.error(`Error reading BRDB screenshot from ${path}:`, err);
    db.close();
  }
}

type MsgpackMarker =
  | 'fixpos'
  | 'fixneg'
  | 'fixmap'
  | 'fixarray'
  | 'fixstr'
  | 'nil'
  | 'false'
  | 'true'
  | 'bin8'
  | 'bin16'
  | 'bin32'
  | 'ext8'
  | 'ext16'
  | 'ext32'
  | 'float32'
  | 'float64'
  | 'uint8'
  | 'uint16'
  | 'uint32'
  | 'uint64'
  | 'int8'
  | 'int16'
  | 'int32'
  | 'int64'
  | 'fixext1'
  | 'fixext2'
  | 'fixext4'
  | 'fixext8'
  | 'fixext16'
  | 'str8'
  | 'str16'
  | 'str32'
  | 'array16'
  | 'array32'
  | 'map16'
  | 'map32';

/** get the msgpack format from a byte */
function mpMarker(byte: number): [MsgpackMarker, number | null] {
  if ((byte & 0b1000_0000) === 0) return ['fixpos', byte & 0b0111_111];
  if ((byte & 0b1111_0000) === 0b1000_0000)
    return ['fixmap', byte & 0b0000_1111];
  if ((byte & 0b1111_0000) === 0b1001_0000)
    return ['fixarray', byte & 0b0000_1111];
  if ((byte & 0b1110_0000) === 0b1010_0000)
    return ['fixstr', byte & 0b0001_1111];
  if ((byte & 0b1110_0000) === 0b1110_0000)
    return ['fixneg', -(byte & 0b0001_1111)];

  switch (byte) {
    case 0b1100_0000:
      return ['nil', null];
    case 0b1100_0010:
      return ['false', null];
    case 0b1100_0011:
      return ['true', null];
    case 0b1100_0100:
      return ['bin8', null];
    case 0b1100_0101:
      return ['bin16', null];
    case 0b1100_0110:
      return ['bin32', null];
    case 0b1100_0111:
      return ['ext8', null];
    case 0b1100_1000:
      return ['ext16', null];
    case 0b1100_1001:
      return ['ext32', null];
    case 0b1100_1010:
      return ['float32', null];
    case 0b1100_1011:
      return ['float64', null];
    case 0b1100_1100:
      return ['uint8', null];
    case 0b1100_1101:
      return ['uint16', null];
    case 0b1100_1110:
      return ['uint32', null];
    case 0b1100_1111:
      return ['uint64', null];
    case 0b1101_0000:
      return ['int8', null];
    case 0b1101_0001:
      return ['int16', null];
    case 0b1101_0010:
      return ['int32', null];
    case 0b1101_0011:
      return ['int64', null];
    case 0b1101_0100:
      return ['fixext1', null];
    case 0b1101_0101:
      return ['fixext2', null];
    case 0b1101_0110:
      return ['fixext4', null];
    case 0b1101_0111:
      return ['fixext8', null];
    case 0b1101_1000:
      return ['fixext16', null];
    case 0b1101_1001:
      return ['str8', null];
    case 0b1101_1010:
      return ['str16', null];
    case 0b1101_1011:
      return ['str32', null];
    case 0b1101_1100:
      return ['array16', null];
    case 0b1101_1101:
      return ['array32', null];
    case 0b1101_1110:
      return ['map16', null];
    case 0b1101_1111:
      return ['map32', null];
    default:
      return null;
  }
}

function mpString(
  buf: Buffer,
  offset: number,
): { str: string; offset: number } | null {
  const byte = buf[offset];
  const marker = mpMarker(byte);
  if (!marker) {
    throw new Error(`Invalid msgpack format byte: ${byte.toString(16)}`);
  }
  return mpStringContent(buf, marker, offset + 1);
}

function mpStringContent(
  buf: Buffer,
  marker: [MsgpackMarker, number | null],
  offset: number,
): { str: string; offset: number } {
  const [m, size] = marker;
  if (m !== 'fixstr' && m !== 'str8' && m !== 'str16' && m !== 'str32') {
    throw new Error(`Expected string format, got ${m}`);
  }

  let strSize = 0;
  if (m === 'fixstr') {
    strSize = size;
  } else if (m === 'str8') {
    strSize = buf[offset];
    offset++;
  } else if (m === 'str16') {
    strSize = buf.readUInt16BE(offset);
    offset += 2;
  } else if (m === 'str32') {
    strSize = buf.readUInt32BE(offset);
    offset += 4;
  }
  if (!strSize) return { str: '', offset };

  const str = buf.toString('utf8', offset, offset + strSize);
  offset += strSize;
  return { str, offset };
}

function mpInt(
  buf: Buffer,
  offset: number,
): { num: number | null; offset: number } {
  const [marker, num] = mpMarker(buf[offset]);
  offset++;
  if (!marker)
    throw new Error(
      `Invalid msgpack format byte: ${buf[offset - 1].toString(16)}`,
    );
  if (marker === 'fixpos') return { num, offset };
  if (marker === 'fixneg') return { num, offset };
  if (marker === 'uint8')
    return {
      num: buf.readUInt8(offset++),
      offset,
    };
  if (marker === 'uint16') {
    const num = buf.readUInt16BE(offset);
    offset += 2;
    return { num, offset };
  }
  if (marker === 'uint32') {
    const num = buf.readUInt32BE(offset);
    offset += 4;
    return { num, offset };
  }
  if (marker === 'uint64') {
    const num = BigInt.asUintN(64, BigInt(buf.readBigUInt64BE(offset)));
    offset += 8;
    return { num: Number(num), offset };
  }
  if (marker === 'int8') {
    const num = buf.readInt8(offset);
    offset++;
    return { num, offset };
  }
  if (marker === 'int16') {
    const num = buf.readInt16BE(offset);
    offset += 2;
    return { num, offset };
  }
  if (marker === 'int32') {
    const num = buf.readInt32BE(offset);
    offset += 4;
    return { num, offset };
  }
  if (marker === 'int64') {
    const num = BigInt.asIntN(64, BigInt(buf.readBigInt64BE(offset)));
    offset += 8;
    return { num: Number(num), offset };
  }
  throw new Error(`Expected integer format, got ${marker}`);
}

type SchemaType =
  | {
      kind: 'literal';
      ty: string;
    }
  | {
      kind: 'array';
      ty: string;
    }
  | {
      kind: 'flatarray';
      ty: string;
    }
  | {
      kind: 'map';
      key: string;
      value: string;
    };

type SchemaStruct = {
  name: string;
  props: Record<string, SchemaType>;
};

function readBrdbSchema(buf: Buffer) {
  const enums: Record<string, Record<string, number> & Record<number, string>> =
    {};
  const structs: Record<string, SchemaStruct> = {};
  let offset = 0;
  const next = () => {
    const byte = buf[offset];
    offset++;
    return byte;
  };
  const nextMarker = () => {
    const byte = next();
    const kind = mpMarker(byte);
    if (!kind) {
      throw new Error(`Invalid msgpack format byte: ${byte.toString(16)}`);
    }
    return kind;
  };
  const mapLen = (name?: string) => {
    const [kind, val] = nextMarker();
    let len = 0;
    switch (kind) {
      case 'fixmap':
        len = val;
        break;
      case 'map16':
        len = buf.readUInt16BE(offset);
        offset += 2;
        break;
      case 'map32':
        len = buf.readUInt32BE(offset);
        offset += 4;
        break;
      default:
        throw new Error(`Expected ${name ?? 'unknown'} map len, got ${kind}`);
    }
    return len;
  };
  const header = nextMarker();
  if (header[0] !== 'fixarray' && header[1] !== 2) {
    throw new Error(
      `Expected schema header to be fixarray of length 2, got ${header[0]} ${header[1]}`,
    );
  }

  const numEnums = mapLen('enums');
  for (let i = 0; i < numEnums; i++) {
    let name: string;
    ({ str: name, offset } = mpString(buf, offset));
    enums[name] = {};
    const values = mapLen(`enum ${name} values`);
    for (let j = 0; j < values; j++) {
      let key: string;
      ({ str: key, offset } = mpString(buf, offset));
      let value: number;
      ({ num: value, offset } = mpInt(buf, offset));
      enums[name][key] = value;
      enums[name][value] = key;
    }
  }
  const numStructs = mapLen('structs');
  for (let i = 0; i < numStructs; i++) {
    let name: string;
    ({ str: name, offset } = mpString(buf, offset));
    const props: Record<string, SchemaType> = {};
    const numProps = mapLen(`struct ${name} properties`);
    for (let j = 0; j < numProps; j++) {
      let propName: string;
      ({ str: propName, offset } = mpString(buf, offset));
      const [kind, val] = nextMarker();
      // Basic types
      if (kind === 'fixstr' || kind === 'str8' || kind === 'str16') {
        let ty: string;
        ({ str: ty, offset } = mpStringContent(buf, [kind, val], offset));
        props[propName] = { kind: 'literal', ty };
      } else if (kind === 'fixarray' && val == 1) {
        let ty: string;
        ({ str: ty, offset } = mpString(buf, offset));
        props[propName] = { kind: 'array', ty };
      } else if (kind === 'fixarray' && val == 2) {
        let ty: string;
        ({ str: ty, offset } = mpString(buf, offset));
        if (nextMarker()[0] !== 'nil')
          throw new Error(`Expected nil after flatarray type`);
        props[propName] = { kind: 'flatarray', ty };
      } else if (kind === 'fixmap' && val == 1) {
        let key_ty: string;
        let val_ty: string;
        ({ str: key_ty, offset } = mpString(buf, offset));
        ({ str: val_ty, offset } = mpString(buf, offset));
        props[propName] = { kind: 'map', key: key_ty, value: val_ty };
      } else {
        throw new Error(
          `Expected property type for ${name}.${propName}, got ${kind}`,
        );
      }
    }
    structs[name] = { name, props };
  }
  return { enums, structs };
}
type BrdbSchema = ReturnType<typeof readBrdbSchema>;

function mpArrayLen(
  buf: Buffer,
  offset: number,
): { len: number; offset: number } {
  const [kind, val] = mpMarker(buf[offset]);
  offset++;
  let len = 0;
  switch (kind) {
    case 'fixarray':
      len = val;
      break;
    case 'array16':
      len = buf.readUInt16BE(offset);
      offset += 2;
      break;
    case 'array32':
      len = buf.readUInt32BE(offset);
      offset += 4;
      break;
    default:
      throw new Error(`Expected array length, got ${kind}`);
  }
  return { len, offset };
}

function mpBinLen(
  buf: Buffer,
  offset: number,
): { len: number; offset: number } {
  const [kind, _] = mpMarker(buf[offset]);
  offset++;
  let len = 0;
  switch (kind) {
    case 'bin8':
      len = buf.readUInt8(offset);
      offset++;
      break;
    case 'bin16':
      len = buf.readUInt16BE(offset);
      offset += 2;
      break;
    case 'bin32':
      len = buf.readUInt32BE(offset);
      offset += 4;
      break;
    default:
      throw new Error(`Expected binary length, got ${kind}`);
  }
  return { len, offset };
}

// this is not a full brdb impl so I'm only implementing what is required
// to read the owner data
function readBrdbType(
  buf: Buffer,
  offset: number,
  schema: BrdbSchema,
  ty: string,
): { value: unknown; offset: number } {
  switch (ty) {
    case 'u32':
      let num: number;
      ({ num, offset } = mpInt(buf, offset));
      return { value: num, offset };
    case 'str':
      let str: string;
      ({ str, offset } = mpString(buf, offset));
      return { value: str, offset };
    default:
      if (!(ty in schema.structs)) {
        throw new Error(`Unknown type ${ty} in schema`);
      }
      const struct = schema.structs[ty];
      const value: Record<string, unknown> = {};
      for (const [propName, propType] of Object.entries(struct.props)) {
        switch (propType.kind) {
          // other soa fields
          case 'array':
            let arrLen: number;
            ({ len: arrLen, offset } = mpArrayLen(buf, offset));
            const arr: unknown[] = [];
            for (let i = 0; i < arrLen; i++) {
              const item = readBrdbType(buf, offset, schema, propType.ty);
              arr.push(item.value);
              offset = item.offset;
            }
            value[propName] = arr;
            break;

          // userids
          case 'flatarray':
            let flatBinSize: number;
            ({ len: flatBinSize, offset } = mpBinLen(buf, offset));
            const flatTySize = flatTypeSize(schema, propType.ty);
            const numItems = flatBinSize / flatTySize;
            const flatArr: unknown[] = [];
            for (let i = 0; i < numItems; i++) {
              const item = readFlatBrdbType(buf, offset, schema, propType.ty);
              flatArr.push(item.value);
              offset = item.offset;
            }
            value[propName] = flatArr;
            break;
        }
      }
      return { value, offset };
  }
}

function readFlatBrdbType(
  buf: Buffer,
  offset: number,
  schema: BrdbSchema,
  ty: string,
): { value: unknown; offset: number } {
  switch (ty) {
    case 'u8':
      const u8 = buf.readUInt8(offset);
      offset++;
      return { value: u8, offset };
    case 'u16':
      const u16 = buf.readUInt16LE(offset);
      offset += 2;
      return { value: u16, offset };
    case 'u32':
      const u32 = buf.readUInt32LE(offset);
      offset += 4;
      return { value: u32, offset };
    case 'u64':
      const u64 = BigInt.asUintN(64, BigInt(buf.readBigUInt64LE(offset)));
      offset += 8;
      return { value: Number(u64), offset };
    case 'i8':
      const i8 = buf.readInt8(offset);
      offset++;
      return { value: i8, offset };
    case 'i16':
      const i16 = buf.readInt16LE(offset);
      offset += 2;
      return { value: i16, offset };
    case 'i32':
      const i32 = buf.readInt32LE(offset);
      offset += 4;
      return { value: i32, offset };
    case 'i64':
      const i64 = BigInt.asIntN(64, BigInt(buf.readBigInt64LE(offset)));
      offset += 8;
      return { value: Number(i64), offset };
    case 'f32':
      const f32 = buf.readFloatLE(offset);
      offset += 4;
      return { value: f32, offset };
    case 'f64':
      const f64 = buf.readDoubleLE(offset);
      offset += 8;
      return { value: f64, offset };
    default:
      if (!(ty in schema.structs)) {
        throw new Error(`Unknown type ${ty} in schema`);
      }
      const struct = schema.structs[ty];
      const value: Record<string, unknown> = {};
      for (const [propName, propType] of Object.entries(struct.props)) {
        if (propType.kind !== 'literal') {
          throw new Error(
            `Expected literal type for ${ty} property, got ${propType.kind}`,
          );
        }
        const item = readFlatBrdbType(buf, offset, schema, propType.ty);
        value[propName] = item.value;
        offset = item.offset;
      }
      return { value, offset };
  }
}

function flatTypeSize(schema: BrdbSchema, ty: string): number {
  switch (ty) {
    case 'u8':
      return 1;
    case 'u16':
      return 2;
    case 'u32':
      return 4;
    case 'u64':
      return 8;
    case 'i8':
      return 1;
    case 'i16':
      return 2;
    case 'i32':
      return 4;
    case 'i64':
      return 8;
    case 'f32':
      return 4;
    case 'f64':
      return 8;
    default:
      if (!(ty in schema.structs)) {
        throw new Error(`Unknown type ${ty} in schema`);
      }
      const struct = schema.structs[ty];
      let size = 0;
      for (const propType of Object.values(struct.props)) {
        if (propType.kind !== 'literal') {
          throw new Error(
            `Expected literal type for ${ty} property, got ${propType.kind}`,
          );
        }
        size += flatTypeSize(schema, propType.ty);
      }
      return size;
  }
}

/** convert a set of 4 u32s into a uuidv4 */
function guidToUuid(guid: {
  A: number;
  B: number;
  C: number;
  D: number;
}): string {
  const hex = (num: number): string => num.toString(16).padStart(8, '0');
  // concatenate them all together
  const joined = `${hex(guid.A)}${hex(guid.B)}${hex(guid.C)}${hex(guid.D)}`;
  // format as uuidv4
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}
