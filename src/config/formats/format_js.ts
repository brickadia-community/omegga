import type { IConfigFormat } from 'config/types';

const format_js: IConfigFormat = {
  extension: 'js',
  encoding: 'string',
  reader: str => JSON.parse(str),
  writer: blob => JSON.stringify(blob, null, 2),
};

export default format_js;
