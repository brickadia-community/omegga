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

const err = (...args) => console.error('!>'.red, ...args);
const log = (...args) => console.log('>>'.green, ...args);
const verboseLog = (...args) => {
  if (!global.VERBOSE) return;
  console.log('V>'.magenta, ...args);
};

// plugin url transformers
const transformers = [{
  // github transformer
  pattern: /^gh@(?<owner>[^/]+)\/(?<repo>[^/]+)$/,
  fn: ({owner, repo}) => ({
    type: 'short',
    name: repo,
    url: `https://github.com/${owner}/omegga-${repo}`,
  }),
}, {
  // gitlab transformer
  pattern: /^gl@(?<owner>[^/]+)\/(?<repo>[^/]+)$/,
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

module.exports = {
  // install plugins from a list of plugins
  async install(plugins) {
    plugins = plugins.map(transformUrl);
    log('Attempting to install', (plugins.length+'').yellow, 'plugins...');
    for (const plugin of plugins) {
      log('Installing plugin', plugin.name.yellow, 'from', plugin.url.yellow + '...');

      // logging helper functions
      const plg = (...args) => console.log(plugin.name, '>>'.green, ...args);
      const plgErr = (...args) => console.error(plugin.name, '!>'.red, ...args);
      const plgWarn = (...args) => console.warn(plugin.name, 'W>'.yellow, ...args);

      // if the plugin wasn't transformed, try to extract its name from the git url
      if (!plugin.name) {
        try {
          const { name } = path.parse(plugin.url);
          plugin.name = name.replace(/^omegga-/, '');
        } catch (e) {
          plgErr('Error parsing name from url');
          continue;
        }
      }

      // plugin absolute path
      const pluginPath = path.join(process.cwd(), soft.PLUGIN_PATH, plugin.name);

      // check if plugin already exists
      if (fs.existsSync(pluginPath)) {
        plgErr('Directory already exists! Try', ('omegga update ' + plugin.name).yellow, 'or check for plugin name collisions');
        continue;
      }

      // create plugin local directory
      try {
        fs.mkdirSync(pluginPath, {recursive: true});
      } catch (e) {
        plgErr('Error creating plugin directory', e);
      }

      // clone the plugin from git
      try {
        plg('Cloning...');
        const git = simpleGit(pluginPath);
        await git.clone(plugin.url, pluginPath);
      } catch (e) {
        plgErr('Error cloning plugin', e);
      }

      // check for the plugin file, whatever it's called
      if (fs.existsSync(path.join(pluginPath, soft.PLUGIN_FILE))) {
        plg('Checking plugin file...');
        let data;
        try {
          data = JSON.parse(fs.readFileSync(path.join(pluginPath, soft.PLUGIN_FILE), 'utf8'));
        } catch (e) {
          plgErr('Error reading plugin file', e);
          continue;
        }

        let ok = true;

        // check the omeggaVersion field of the plugin file
        if (!semver.valid(semver.clean(data.omeggaVersion))) {
          plgWarn('WARNING - Plugin file has invalid', 'omeggaVersion'.yellow);
          ok = false;
        } else if (!semver.satisfies(pkg.version, data.omeggaVersion)) {
          plgWarn(`WARNING - Plugin is not made for this version of omegga (${pkg.version.yellow} vs ${data.omeggaVersion.yellow})`);
          ok = false;
        }

        if (ok) {
          plg('Plugin file', 'OK'.green);
        }
      }

      const postInstallPath = fs.existsSync(path.join(pluginPath, soft.PLUGIN_POSTINSTALL));
      if (fs.existsSync(postInstallPath)) {
        plg('Running post install script...');
        try {
          let {stdout, stderr} = await exec(postInstallPath, {
            cwd: pluginPath,
            shell: true,
          });

          if (stderr.length)
            console.error(stderr);

          verboseLog(stdout);
        } catch (e) {
          plgErr('Error running post install script:', e);
        }
      }

    }
  },

  async update(plugins) {
    log(plugins);
    err('not implemented yet');
  }
};