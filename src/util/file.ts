import Logger from '@/logger';
import chokidar from 'chokidar';
import fs from 'fs';
import _ from 'lodash';
import path from 'path';
import rimraf from 'rimraf';

// objects to store cached data
const cachedTimes: Record<string, number> = {};
const cachedJSON: Record<string, unknown> = {};

// read a file and write it to cache, return the json object
function updateJSONCache(file: string) {
  let body;
  try {
    // check if the file contents exist
    body = fs.readFileSync(file, 'utf8');
    // sometimes json files start with unicode for some reason. who knows!
    if (!body.startsWith('{') && body.length > 4)
      body = body.replace(/^[^{]+/, '');
    if (!body) return cachedJSON[file];

    // parse them as  json
    cachedJSON[file] = JSON.parse(body);
    cachedTimes[file] = Date.now();
  } catch (err) {
    Logger.errorp('Error updating JSON cache for file', file, err);
    if (body) Logger.errorp('File contents:', body);
  }
  return cachedJSON[file];
}

// read cached json
export function readCachedJSON(file: string, expire = 5000) {
  const now = Date.now();
  if (cachedTimes[file] && cachedTimes[file] + expire > now)
    return cachedJSON[file];

  // update the cache with data
  return updateJSONCache(file);
}

// object state to store watched json data
const watchers: Record<string, chokidar.FSWatcher> = {};

export function readWatchedJSON(file: string) {
  // if the file is already being watched, return the watched json
  if (watchers[file]) return cachedJSON[file];

  // check if the file exists
  if (!fs.existsSync(file)) return undefined;

  // create a watcher (no persistence means the process dies even if there's still a watcher)
  const watcher = chokidar.watch(file, { persistent: false });
  watchers[file] = watcher;

  const read = _.debounce(() => updateJSONCache(file), 500);

  // add listeners to the watcher
  watcher
    .on('add', () => read()) // on add, update the cache
    .on('change', () => read()) // on change, update the cache
    .on('unlink', () => {
      // on unlink (delete), destroy value in cache
      cachedJSON[file] = undefined;
      cachedTimes[file] = Date.now();
    });

  return updateJSONCache(file);
}

// recursively mkdir (mkdir -p )
export function mkdir(path: string) {
  try {
    fs.mkdirSync(path, { recursive: true });
  } catch (e) {
    /* */
  }
}

// rm -rf a path
export function rmdir(dir: string) {
  if (!fs.existsSync(dir)) return false;
  return new Promise((resolve, reject) => {
    rimraf(dir, error => {
      if (error) reject(error);
      else resolve(true);
    });
  });
}

// copy files from one dir to another, creating the directories in the process
export function copyFiles(srcDir: string, dstDir: string, files: string[]) {
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
