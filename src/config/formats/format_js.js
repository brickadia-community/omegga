module.exports = {
  extension: 'js',
  encoding: 'string',
  reader: str => JSON.parse(str),
  writer: blob => JSON.stringify(blob, 0, 2),
};
