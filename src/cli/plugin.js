const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');
const semver = require('semver');
const util = require('util');
const {exec: execNonPromise} = require('child_process');
const exec = util.promisify(execNonPromise);

require('colors');

const soft = require('../softconfig.js');
const pkg = require('../../package.json');
const config = require('../config/index');

// get the working directory for omegga
function getWorkDir() {
  // default working directory is the one specified in config
  let workDir = config.store.get('defaultOmegga');
  verboseLog('Using working directory', workDir.yellow);

  // if there's a config in the current directory, use that one instead
  if (config.find('.'))
    workDir = '.';

  const confFile = config.find(workDir);

  return confFile ? path.resolve(process.cwd(), path.dirname(confFile)) : undefined;
}

// plugin url transformers
const transformers = [{
  // github transformer
  pattern: /^gh:(?<owner>[^/]+)\/(?<repo>[^/]+)$/,
  fn: ({owner, repo}) => ({
    type: 'short',
    name: repo,
    url: `https://github.com/${owner}/omegga-${repo}`,
  }),
}, {
  // gitlab transformer
  pattern: /^gl:(?<owner>[^/]+)\/(?<repo>[^/]+)$/,
  fn: ({owner, repo}) => ({
    type: 'short',
    name: repo,
    url: `https://gitlab.com/${owner}/omegga-${repo}`,
  }),
}];

// convert a shortened url into a full length one
const transformUrl = url => {
  const found = transformers.find(t => url.match(t.pattern));
  if (!found) return {type: 'raw', url};
  return found.fn(url.match(found.pattern).groups);
};

let padding = 0;
let needsNL = false;

// rewrite a console line
const rewriteLine = (...args) => {
  process.stdout.clearLine();
  process.stdout.cursorTo(0);
  process.stdout.write(args.join(' '));
  needsNL = true;
};

// logging helper functions
const plg = (plugin, ...args) => {
  if (needsNL) {
    needsNL = false;
    console.log();
  }
  console.log(plugin.name.padStart(padding), '>>'.green, ...args);
};
const plgLog = (plugin, ...args) => {
  if (global.VERBOSE)
    plg(plugin, ...args);
  else
    rewriteLine(plugin.name.padStart(padding), '>>'.green, ...args);
};
const plgWarn = (plugin, ...args) => {
  if (needsNL) {
    needsNL = false;
    console.warn();
  }
  console.warn(plugin.name.padStart(padding), 'W>'.yellow, ...args);
};
const plgErr = (plugin, ...args) => {
  if (needsNL) {
    needsNL = false;
    console.error();
  }
  console.error(plugin.name.padStart(padding), '!>'.red, ...args);
};

const err = (...args) => {
  if (needsNL) {
    needsNL = false;
    console.error();
  }
  console.error('!>'.red, ...args);
};
const log = (...args) => {
  if (needsNL) {
    needsNL = false;
    console.log();
  }
  console.log('>>'.green, ...args);
};
const verboseLog = (...args) => {
  if (!global.VERBOSE) return;
  if (needsNL) {
    needsNL = false;
    console.log();
  }
  console.log('V>'.magenta, ...args);
};

function checkPlugin(omeggaPath, plugin) {
  const pluginPath = path.join(omeggaPath, soft.PLUGIN_PATH, plugin.name);

  // check for the plugin file, whatever it's called
  if (fs.existsSync(path.join(pluginPath, soft.PLUGIN_FILE))) {
    plg(plugin, 'Checking plugin file...');
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(pluginPath, soft.PLUGIN_FILE), 'utf8'));
    } catch (e) {
      plgErr(plugin, 'Error reading plugin file', e);
      return false;
    }

    // make sure this plugin version is okay.
    // in the future, this may include deprecation warnings and format changes
    if (data.formatVersion !== 1) {
      plgWarn(plugin, 'WARNING - Plugin file has invalid', 'formatVersion'.yellow + '. Expected', '1'.yellow);
      return;
    }

    // check the omeggaVersion field of the plugin file
    if (!data.omeggaVersion || !semver.validRange(data.omeggaVersion)) {
      plgWarn(plugin, 'WARNING - Plugin file has invalid', 'omeggaVersion'.yellow + '. Expected semver expression');
      return false;
    } else if (!semver.satisfies(pkg.version, data.omeggaVersion)) {
      plgWarn(plugin, `WARNING - Plugin is not made for this version of omegga (${pkg.version.yellow} vs ${data.omeggaVersion.yellow})`);
      return false;
    }

    plgLog(plugin, 'Plugin file', 'OK'.green);
    return true;
  }

  // no plugin file, no problem!
  plgWarn(plugin, `WARNING - Plugin is missing plugin file (${soft.PLUGIN_FILE}), this may be a problem in future versions`);
  return true;
}

module.exports = {
  // install plugins from a list of plugins
  async install(plugins, _options) {
    const omeggaPath = getWorkDir();
    if (!omeggaPath)
      return err('Not an omegga directory, run ', 'omegga init'.yellow, 'to setup one.');

    plugins = plugins.map(transformUrl);
    log('Attempting to install', (plugins.length+'').yellow, 'plugins...');

    for (const plugin of plugins) {
      log('Installing plugin', plugin.name.yellow, 'from', plugin.url.yellow + '...');

      // if the plugin wasn't transformed, try to extract its name from the git url
      if (!plugin.name) {
        try {
          const { name } = path.parse(plugin.url);
          plugin.name = name.replace(/^omegga-/, '');
        } catch (e) {
          plgErr(plugin, 'Error parsing name from url');
          continue;
        }
      }

      // update padding for plugin names
      padding = Math.max(...plugins.map(p => p.name.length));

      // plugin absolute path
      const pluginPath = path.join(omeggaPath, soft.PLUGIN_PATH, plugin.name);

      // check if plugin already exists
      // TODO: if force is passed in, remove the old directory
      if (fs.existsSync(pluginPath)) {
        plgErr(plugin, 'Directory already exists! Try', ('omegga update ' + plugin.name).yellow, 'or check for plugin name collisions');
        continue;
      }

      // create plugin local directory
      try {
        fs.mkdirSync(pluginPath, {recursive: true});
      } catch (e) {
        plgErr(plugin, 'Error creating plugin directory', e);
      }

      // clone the plugin from git
      try {
        plgLog(plugin, 'Cloning...');
        const git = simpleGit(pluginPath);
        await git.clone(plugin.url, pluginPath);
      } catch (e) {
        plgErr(plugin, 'Error cloning plugin', e);
      }

      // check for the plugin file for issues
      // TODO: if force is passed in, ignore the plugin check
      if (!checkPlugin(omeggaPath, plugin)) continue;

      const postInstallPath = path.join(pluginPath, soft.PLUGIN_POSTINSTALL);
      if (fs.existsSync(postInstallPath)) {
        plgLog(plugin, 'Running post install script...');
        try {
          fs.chmodSync(postInstallPath, '0755');
          let {stdout, stderr} = await exec(postInstallPath, {
            cwd: pluginPath,
            shell: true,
          });

          if (stderr.length)
            plgErr(plugin, stderr);

          verboseLog(stdout);
        } catch (e) {
          plgErr(plugin, 'Error running post install script:', e);
        }
      }

    }
  },

  async update(plugins, _options) {
    const omeggaPath = getWorkDir();
    if (!omeggaPath)
      return err('Not an omegga directory, run ', 'omegga init'.yellow, 'to setup one.');

    const pluginFolder = path.join(omeggaPath, soft.PLUGIN_PATH);

    // if no plugins are passed in, use every plugin in the plugins folder
    if (plugins.length === 0) {
      plugins = fs.readdirSync(pluginFolder);
    }

    plugins = plugins.map(dir => path.join(pluginFolder, dir))
      // every plugin must be in a directory
      .filter(dir => fs.existsSync(dir) && fs.lstatSync(dir).isDirectory() &&
        fs.existsSync(path.join(dir, '.git')))
      .map(dir => ({name: path.basename(dir)}));

    if (plugins.length === 0) {
      log('Found no plugins that can be updated');
      return;
    }

    log('Checking', (plugins.length+'').yellow, 'plugins for updates...');

    // update padding for plugin names
    padding = Math.max(...plugins.map(p => p.name.length));

    // list of plugins that will be updated
    let pluginsToUpdate = [];

    for (const plugin of plugins) {
      if (needsNL) {
        console.log();
        needsNL = false;
      }
      plgLog(plugin, 'Checking...');
      const pluginPath = path.join(pluginFolder, plugin.name);
      plugin.path = pluginPath;
      const git = simpleGit(pluginPath);
      plugin.git = git;
      if (!await git.checkIsRepo()) {
        plgErr(plugin, 'No git repo detected');
        continue;
      }

      let status;
      // get git status
      try {
        status = await git.status();
      } catch (e) {
        plgErr(plugin, 'Error getting status', e);
      }

      try {
        // check for uncommitted changes
        if (status.files.some(f => f.working_dir !== '?')) {
          plgErr(plugin, 'Detected uncommitted changes - ignoring');
          continue;
        }

        const remotes = await git.getRemotes();
        const branches = await git.branch();

        // check if we're on a weird branch
        if (branches.current !== 'master') {
          plgErr(plugin, 'Not on master branch - ignoring');
          continue;
        }

        // try to correct a weird detached branch
        if (remotes.length === 1 && remotes[0].name === 'origin' &&
          branches.current === 'master' && !status.tracking && branches.branches['remotes/origin/master']) {
          plgLog(plugin, 'Correcting upstream...');
          try {
            await git.branch({'--set-upstream-to': 'origin/master'});
            status = await git.status();
          } catch (e) {
            plgErr(plugin, 'Error getting status/fixing upstream branch', e);
            continue;
          }
        }

        // this should be corrected by the above check, though if it's not I am not fighting git lol
        if (!status.tracking) {
          plgErr(plugin, 'No upstream branch - ignoring');
          continue;
        }

        // local developers, publish your code please!!! :)
        if (remotes.length === 0) {
          plgErr(plugin, 'No remotes - ignoring');
          continue;
        }

        try {
          plgLog(plugin, 'Fetching...');
          await git.fetch();
          status = await git.status();
        } catch (e) {
          plgErr(plugin, 'Error fetching remote code', e);
          continue;
        }

        if (status.ahead > 0) {
          plgErr(plugin, 'Detected plugin is ahead - ignoring');
          continue;
        }

        if (status.behind === 0) {
          plgLog(plugin, 'Already up-to-date!'.green);
          continue;
        }

        plgLog(plugin, 'Update available');
        pluginsToUpdate.push(plugin);
      } catch (e) {
        plgErr(plugin, 'Error', e);
      }
    }

    if (pluginsToUpdate.length === 0) {
      log('All plugins are currently up-to-date');
      return;
    }

    log('Updating', (pluginsToUpdate.length+'').yellow, 'plugins...');
    let updates = 0;

    for (const plugin of pluginsToUpdate) {
      const { git } = plugin;
      if (needsNL) {
        console.log();
        needsNL = false;
      }
      plgLog(plugin, 'Creating backup branch...');
      try {
        const branches = await git.branch();
        if (branches.branches['omegga-upgrade-backup']) {
          plgLog(plugin, 'Deleting leftover backup branch...');
          await git.deleteLocalBranch('omegga-upgrade-backup', true);
        }
        await git.checkoutBranch('omegga-upgrade-backup', 'master');
        await git.branch({'--set-upstream-to': 'origin/master'});
        await git.checkout('master');
        plgLog(plugin, 'Pulling update...');
        await git.pull();
        if ((await git.status()).behind > 0) {
          throw '- still behind?';
        }
        plgLog(plugin, 'Checking plugin versions...');
        if (!checkPlugin(omeggaPath, plugin)) {
          throw 'Incompatible';
        }
        plgLog(plugin, 'Updated!'.green);
        updates ++;
      } catch (e) {
        plgErr(plugin, 'Error updating - attempting to restore from backup branch', e);
        try {
          if ((await git.branch()) !== 'master') {
            plgErr(plugin, 'Not on expected branch - exiting before I break more things');
            continue;
          }

          plg(plugin, 'Resetting current branch');
          await git.reset('hard');
          plgLog(plugin, 'Attempting to checkout backup branch');
          await git.checkout('omegga-upgrade-backup');
          plgLog(plugin, 'Replacing master with backup');
          await git.deleteLocalBranch('master');
          await git.checkoutBranch('master', 'omegga-upgrade-backup');
          plgLog(plugin, 'Restored to backup branch');

          if ((await git.branch()) !== 'master') {
            plgErr(plugin, 'Failed to checkout newly created master');
            continue;
          } else {
            plgWarn(plugin, 'Restored from backup and plugin not updated...');
          }

        } catch (e) {
          plgErr(plugin, 'Error restoring from backup... Whelp...');
        }
        continue;
      }
    }

    log('Updated', (updates+'').yellow, 'plugins!');
  },

  async check(plugins, _options) {
    const omeggaPath = getWorkDir();
    if (!omeggaPath)
      return err('Not an omegga directory, run ', 'omegga init'.yellow, 'to setup one.');

    const pluginFolder = path.join(omeggaPath, soft.PLUGIN_PATH);

    // if no plugins are passed in, use every plugin in the plugins folder
    if (plugins.length === 0) {
      plugins = fs.readdirSync(pluginFolder);
    }

    plugins = plugins.map(dir => path.join(pluginFolder, dir))
      // every plugin must be in a directory
      .filter(dir => fs.existsSync(dir) && fs.lstatSync(dir).isDirectory() &&
        fs.existsSync(path.join(dir, '.git')))
      .map(dir => ({name: path.basename(dir)}));

    if (plugins.length === 0) {
      log('Found no plugins that can be checked');
      return;
    }

    log('Checking', (plugins.length+'').yellow, 'plugins for valid plugin files');

    // update padding for plugin names
    padding = Math.max(...plugins.map(p => p.name.length));

    for (const plugin of plugins) {
      const pluginPath = path.join(pluginFolder, plugin.name);
      plugin.path = pluginPath;
      const git = simpleGit(pluginPath);
      plugin.git = git;
      if (!await git.checkIsRepo()) {
        plgErr(plugin, 'No git repo detected');
        continue;
      }
      checkPlugin(omeggaPath, plugin);
    }
  }
};