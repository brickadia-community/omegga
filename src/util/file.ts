import Logger from '@/logger';
import chokidar from 'chokidar';
import fs from 'node:fs';
import _ from 'lodash';
import path from 'node:path';

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
  } catch {
    /* */
  }
}

// rm -rf a path
export async function rmdir(dir: string) {
  if (!fs.existsSync(dir)) return false;
  await fs.promises.rm(dir, { recursive: true, force: true });
  return true;
}

/**
 * Every file under `dir` whose name ends with `ext`, as full paths, in the
 * order glob 7 gave them (`localeCompare('en')`).
 *
 * Symlinked directories are followed, since servers point saves and prefabs at
 * shared storage that way; a directory reached twice through links is read
 * once. Names starting with a dot are skipped, files and directories alike.
 * `dir` is used literally, so a path containing glob characters such as `[`
 * still works. A missing `dir` gives an empty list.
 */
export function findFiles(dir: string, ext: string): string[] {
  const found: string[] = [];
  const visited = new Set<string>();

  const walk = (current: string) => {
    let real: string;
    let entries: fs.Dirent[];
    try {
      real = fs.realpathSync(current);
      if (visited.has(real)) return;
      visited.add(real);
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);

      let isDir = entry.isDirectory();
      let isFile = entry.isFile();
      if (entry.isSymbolicLink()) {
        try {
          const target = fs.statSync(full);
          isDir = target.isDirectory();
          isFile = target.isFile();
        } catch {
          // a dangling link names nothing that could be loaded
          continue;
        }
      }

      if (isDir) walk(full);
      else if (isFile && entry.name.endsWith(ext)) found.push(full);
    }
  };

  walk(dir);
  return found.sort((a, b) => a.localeCompare(b, 'en'));
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
