const fs = require('fs');
const chokidar = require('chokidar');

// objects to store cached data
const cachedTimes = {};
const cachedJSON = {};

// read a file and write it to cache, return the json object
function updateJSONCache(file) {
  cachedJSON[file] = JSON.parse(fs.readFileSync(file, 'utf8'))
  cachedTimes[file] = Date.now();
  return cachedJSON[file];
}

// read cached json
function readCachedJSON(file, expire=5000) {
  const now = Date.now();
  if (cachedTimes[file] && cachedTimes[file] + expire > now)
    return cachedJSON[file];

  // update the cache with data
  return updateJSONCache(file);
}

// object state to store watched json data
const watchers = {};

function readWatchedJSON(file) {
  // if the file is already being watched, return the watched json
  if (watchers[file])
    return cachedJSON[file];

  // check if the file exists
  if (!fs.existsSync(file))
    return undefined;

  // create a watcher (no persistence means the process dies even if there's still a watcher)
  const watcher = chokidar.watch(file, { persistent: false });
  watchers[file] = watcher;

  const read = () => updateJSONCache(file);

  // add listeners to the watcher
  watcher
    .on('add', () => read()) // on add, update the cache
    .on('change', () => read()) // on change, update the cache
    .on('unlink', () => { // on unlink (delete), destroy value in cache
      cachedJSON[file] = undefined;
      cachedTimes[file] = Date.now();
    });

  return read();
}

module.exports = {
  readCachedJSON,
  readWatchedJSON,
};