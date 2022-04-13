import { IConfig, IConfigFormat } from './types';
import fs from 'fs';
import validate from './validator';

// given a list of formats, generate a function for write to any of those formats
const writer = (formats: IConfigFormat[]) => (path: string, blob: IConfig) => {
  // find the config format that matches this extension
  const ext = path.split('.').pop().toLowerCase();
  const format = formats.find(f => f.extension === ext);
  if (!format) throw 'missing format';

  // validate the config blob
  const result = validate(blob);
  if (!result.valid) throw result.errors;

  // encode the config data into the format
  const data = format.writer(blob);

  // write the encoded config to file
  fs.writeFileSync(path, data);
};

export default writer;
