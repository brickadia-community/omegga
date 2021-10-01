const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const rimraf = require('rimraf');


// objects to store cached data
const cachedTimes = {};
const cachedJSON = {};

// read a file and write it to cache, return the json object
function updateJSONCache(file) {
  let body;
  try {
    // check if the file contents exist
    body = fs.readFileSync(file, 'utf8');
    // sometimes json files start with unicode for some reason. who knows!
    if (!body.startsWith('{') && body.length > 4) body = body.replace(/^[^{]+/, '');
    if (!body) return cachedJSON[file];

    // parse them as  json
    cachedJSON[file] = JSON.parse(body);
    cachedTimes[file] = Date.now();
  } catch (err) {
    const log = global.Omegga && global.Omegga.error || console.error;
    log('Error updating JSON cache for file', file, err);
    if (body)
      log('File contents:', body);
  }
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

// recursively mkdir (mkdir -p )
function mkdir(path) {
  try { fs.mkdirSync(path, {recursive: true}); } catch (e) { /* */ }
}

// rm -rf a path
function rmdir(dir) {
  if (!fs.existsSync(dir)) return false;
  return new Promise((resolve, reject) => {
    rimraf(dir, error => {
      if (error)
        reject(error);
      else
        resolve(true);
    });
  });
}

// copy files from one dir to another, creating the directories in the process
function copyFiles(srcDir, dstDir, files) {
  // create the directories if they don't already exist
  mkdir(srcDir);
  mkdir(dstDir);

  // copy the brickadia auth files
  for (const f of files) {
    // source is the omegga config path
    const src = path.join(srcDir, f);

    // destination file is in the auth path
    const dst = path.join(dstDir, f);

    // if it exists in the auth path and not in the current folder
    if (!fs.existsSync(dst) && fs.existsSync(src)) {
      fs.copyFileSync(src, dst);
    }
  }
}

module.exports = {
  readCachedJSON,
  readWatchedJSON,
  rmdir,
  mkdir,
  copyFiles,
};