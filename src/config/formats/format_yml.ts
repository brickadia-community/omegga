import type { IConfig, IConfigFormat } from '@config/types';
import yaml from 'js-yaml';

const format_yaml: IConfigFormat = {
  extension: 'yml',
  encoding: 'string',
  reader: str => yaml.load(str) as IConfig,
  writer: blob => yaml.dump(blob),
};

export default format_yaml;
