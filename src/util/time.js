const UNIT_CONVERSION = {
  ms: 1, // milliseconds
  s: 1000, // seconds
  m: 60 * 1000, // minutes
  h: 60 * 60 * 1000, // hours
  d: 24 * 60 * 60 * 1000, // days
  w: 7 * 24 * 60 * 60 * 1000, // weeks
};

// sum duration from a string like '1d 4h 3m 25s 30ms'
function parseDuration(str) {
  let total = 0;

  // split string by spaces (0m 35s) -> [0m, 35s]
  const chunks = str.split(' ');

  // parse each chunk
  for (const chunk of chunks) {
    // extract the duration and unit from the chunk
    const [_, duration, unit] = chunk.match(/^(\d+)(\w+)$/) || [];

    // ignore invalid chunks
    if (!duration || !unit || !UNIT_CONVERSION[unit]) continue;

    // add to the total the duration in MS
    total += Number(duration) * UNIT_CONVERSION[unit];
  }

  return total;
}

module.exports = {
  parseDuration,
};