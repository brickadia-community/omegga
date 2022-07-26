import Logger from '@/logger';
import soft from '@/softconfig';
import * as config from '@config';
import { PluginLoader } from '@omegga/plugin';
import { exec as execNonPromise } from 'child_process';
import fs from 'fs';
import path from 'path';
import prompts from 'prompts';
import semver from 'semver';
import simpleGit, { ResetMode, SimpleGit } from 'simple-git';
import { promisify } from 'util';
const pkg = require('../../package.json');
const exec = promisify(execNonPromise);

require('colors');

const MAIN_BRANCHES = ['master', 'main'];

// get the working directory for omegga
function getWorkDir() {
  // default working directory is the one specified in config
  let workDir = config.store.get('defaultOmegga');
  verboseLog('Using working directory', workDir.yellow);

  // if there's a config in the current directory, use that one instead
  if (config.find('.')) workDir = '.';

  const confFile = config.find(workDir);

  return confFile
    ? path.resolve(process.cwd(), path.dirname(confFile))
    : undefined;
}

interface IPlugin {
  name?: string;
  type: string | 'raw';
  url: string;
}

interface IInstalledPlugin {
  name: string;
  path?: string;
  git?: SimpleGit;
}

interface ITransformer {
  pattern: RegExp;
  fn(match: Record<string, string>): IPlugin;
}

const PLUGIN_TYPES = ['safe', 'safe-ts', 'unsafe', 'rust', 'rpc'];
type PluginType = typeof PLUGIN_TYPES[number];

// plugin url transformers
const transformers: ITransformer[] = [
  {
    // github transformer
    pattern: /^gh:(?<owner>[^/]+)\/(?<repo>[^/]+)$/,
    fn: ({ owner, repo }) => ({
      type: 'short',
      name: repo,
      url: `https://github.com/${owner}/omegga-${repo}`,
    }),
  },
  {
    // gitlab transformer
    pattern: /^gl:(?<owner>[^/]+)\/(?<repo>[^/]+)$/,
    fn: ({ owner, repo }) => ({
      type: 'short',
      name: repo,
      url: `https://gitlab.com/${owner}/omegga-${repo}`,
    }),
  },
];

// convert a shortened url into a full length one
const transformUrl = (url: string): IPlugin => {
  const found = transformers.find(t => url.match(t.pattern));
  if (!found) return { type: 'raw', url };
  return found.fn(url.match(found.pattern).groups);
};

let needsNL = false;

// rewrite a console line
const rewriteLine = (...args: string[]) => {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  process.stdout.write(args.join(' '));
  needsNL = true;
};

// logging helper functions
const plg = (plugin: IPlugin | IInstalledPlugin, ...args: any[]) => {
  if (needsNL) {
    needsNL = false;
    console.log();
  }
  console.log(plugin.name, '>>'.green, ...args);
};
const plgLog = (plugin: IPlugin | IInstalledPlugin, ...args: any[]) => {
  if (Logger.VERBOSE) plg(plugin, ...args);
  else rewriteLine(plugin.name, '>>'.green, ...args);
};
const plgWarn = (plugin: IPlugin | IInstalledPlugin, ...args: any[]) => {
  if (needsNL) {
    needsNL = false;
    console.warn();
  }
  console.warn(plugin.name, 'W>'.yellow, ...args);
};
const plgErr = (plugin: IPlugin | IInstalledPlugin, ...args: any[]) => {
  if (needsNL) {
    needsNL = false;
    console.error();
  }
  console.error(plugin.name, '!>'.red, ...args);
};

const err = (...args: any[]) => {
  if (needsNL) {
    needsNL = false;
    console.error();
  }
  console.error('!>'.red, ...args);
};
const log = (...args: any[]) => {
  if (needsNL) {
    needsNL = false;
    console.log();
  }
  console.log('>>'.green, ...args);
};
const verboseLog = (...args: any[]) => {
  if (!Logger.VERBOSE) return;
  if (needsNL) {
    needsNL = false;
    console.log();
  }
  console.log('V>'.magenta, ...args);
};

function checkPlugin(omeggaPath: string, plugin: IPlugin | IInstalledPlugin) {
  const pluginPath = path.join(omeggaPath, soft.PLUGIN_PATH, plugin.name);

  // check for the plugin file, whatever it's called
  if (fs.existsSync(path.join(pluginPath, soft.PLUGIN_FILE))) {
    if (needsNL) {
      console.log();
      needsNL = false;
    }
    plgLog(plugin, 'Checking plugin file...');
    let data;
    try {
      data = JSON.parse(
        fs.readFileSync(path.join(pluginPath, soft.PLUGIN_FILE), 'utf8')
      );
    } catch (e) {
      plgErr(plugin, 'Error reading plugin file', e);
      return false;
    }

    // make sure this plugin version is okay.
    // in the future, this may include deprecation warnings and format changes
    if (data.formatVersion !== 1) {
      plgWarn(
        plugin,
        'WARNING - Plugin file has invalid',
        'formatVersion'.yellow + '. Expected',
        '1'.yellow
      );
      return;
    }

    // check the omeggaVersion field of the plugin file
    if (!data.omeggaVersion || !semver.validRange(data.omeggaVersion)) {
      plgWarn(
        plugin,
        'WARNING - Plugin file has invalid',
        'omeggaVersion'.yellow + '. Expected semver expression'
      );
      return false;
    } else if (!semver.satisfies(pkg.version, data.omeggaVersion)) {
      plgWarn(
        plugin,
        `WARNING - Plugin is not made for this version of omegga (${pkg.version.yellow} vs ${data.omeggaVersion.yellow})`
      );
      return false;
    }

    plgLog(plugin, 'Plugin file', 'OK'.green);
    return true;
  }

  // no plugin file, no problem!
  plgWarn(
    plugin,
    `WARNING - Plugin is missing plugin file (${soft.PLUGIN_FILE}), this may be a problem in future versions`
  );
  return true;
}

// install plugins from a list of plugins
export async function install(plugins: string[], _options: unknown) {
  const omeggaPath = getWorkDir();
  if (!omeggaPath)
    return err(
      'Not an omegga directory, run ',
      'omegga init'.yellow,
      'to setup one.'
    );

  log('Attempting to install', (plugins.length + '').yellow, 'plugins...');

  for (const pluginUrl of plugins) {
    const plugin = transformUrl(pluginUrl);

    // if the plugin wasn't transformed, try to extract its name from the git url
    if (!('name' in plugin)) {
      try {
        const { name } = path.parse(plugin.url);
        plugin.name = name.replace(/^omegga-/, '');
      } catch (e) {
        console.error('!>'.red, 'Error parsing name from url', plugin.url);
        break;
      }
    }

    log(
      'Installing plugin',
      plugin.name.yellow,
      'from',
      plugin.url.yellow + '...'
    );

    // plugin absolute path
    const pluginPath = path.join(omeggaPath, soft.PLUGIN_PATH, plugin.name);

    // check if plugin already exists
    // TODO: if force is passed in, remove the old directory
    if (
      fs.existsSync(pluginPath) &&
      fs.existsSync(path.join(pluginPath, 'doc.json'))
    ) {
      plgErr(
        plugin,
        'Directory already exists! Try',
        ('omegga update ' + plugin.name).yellow,
        'or check for plugin name collisions'
      );
      continue;
    }

    if (!fs.existsSync(pluginPath)) {
      // create plugin local directory
      try {
        fs.mkdirSync(pluginPath, { recursive: true });
      } catch (e) {
        plgErr(plugin, 'Error creating plugin directory', e);
      }
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
        let { stdout, stderr } = await exec(postInstallPath, {
          cwd: pluginPath,
          shell: 'bash',
        });

        if (stderr.length) plgErr(plugin, stderr);

        verboseLog(stdout);
      } catch (e) {
        plgErr(plugin, 'Error running post install script:', e);
      }
    }
  }
}
export async function update(pluginsNames: string[], _options: unknown) {
  const omeggaPath = getWorkDir();
  if (!omeggaPath)
    return err(
      'Not an omegga directory, run ',
      'omegga init'.yellow,
      'to setup one.'
    );

  const pluginFolder = path.join(omeggaPath, soft.PLUGIN_PATH);

  // if no plugins are passed in, use every plugin in the plugins folder
  if (pluginsNames.length === 0) {
    pluginsNames = fs.readdirSync(pluginFolder);
  }

  const plugins: IInstalledPlugin[] = pluginsNames
    .map(dir => path.join(pluginFolder, dir))
    // every plugin must be in a directory
    .filter(
      dir =>
        fs.existsSync(dir) &&
        fs.lstatSync(dir).isDirectory() &&
        fs.existsSync(path.join(dir, '.git'))
    )
    .map(dir => ({ name: path.basename(dir) }));

  if (plugins.length === 0) {
    log('Found no plugins that can be updated');
    return;
  }

  log('Checking', (plugins.length + '').yellow, 'plugins for updates...');

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
    if (!(await git.checkIsRepo())) {
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
      if (!MAIN_BRANCHES.includes(branches.current)) {
        plgErr(plugin, 'Not on a main branch - ignoring');
        continue;
      }

      // try to correct a weird detached branch
      if (
        remotes.length === 1 &&
        remotes[0].name === 'origin' &&
        !status.tracking
      ) {
        let skip = false;
        for (const branch of MAIN_BRANCHES) {
          if (
            branches.current === branch &&
            branches.branches[`remotes/origin/${branch}`]
          ) {
            plgLog(plugin, 'Correcting upstream...');
            try {
              await git.branch({ '--set-upstream-to': `origin/${branch}` });
              status = await git.status();
              break;
            } catch (e) {
              plgErr(plugin, 'Error getting status/fixing upstream branch', e);
              skip = true;
              break;
            }
          }
        }
        if (skip) continue;
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

  log('Updating', (pluginsToUpdate.length + '').yellow, 'plugins...');
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
      const mainBranch =
        MAIN_BRANCHES.find(b => branches.branches[b]) ?? MAIN_BRANCHES[0];
      if (branches.branches['omegga-upgrade-backup']) {
        plgLog(plugin, 'Deleting leftover backup branch...');
        await git.deleteLocalBranch('omegga-upgrade-backup', true);
      }
      await git.checkoutBranch('omegga-upgrade-backup', mainBranch);
      await git.branch({ '--set-upstream-to': `origin/${mainBranch}` });
      await git.checkout(mainBranch);
      plgLog(plugin, 'Pulling update...');
      await git.pull();
      if ((await git.status()).behind > 0) {
        throw '- still behind?';
      }
      plgLog(plugin, 'Checking plugin versions...');
      if (!checkPlugin(omeggaPath, plugin)) {
        throw 'Incompatible';
      }

      const postInstallPath = path.join(plugin.path, soft.PLUGIN_POSTINSTALL);
      if (fs.existsSync(postInstallPath)) {
        plgLog(plugin, 'Running post install script...');
        try {
          fs.chmodSync(postInstallPath, '0755');
          let { stdout, stderr } = await exec(postInstallPath, {
            cwd: plugin.path,
            shell: 'bash',
          });

          if (stderr.length) plgErr(plugin, stderr);

          verboseLog(stdout);
        } catch (e) {
          plgErr(plugin, 'Error running post install script:', e);
        }
      }

      plgLog(plugin, 'Updated!'.green);
      updates++;
    } catch (e) {
      plgErr(
        plugin,
        'Error updating - attempting to restore from backup branch',
        e
      );
      try {
        const branches = await git.branch();
        if (!MAIN_BRANCHES.includes(branches.current)) {
          plgErr(
            plugin,
            'Not on expected branch - exiting before I break more things'
          );
          continue;
        }

        const mainBranch =
          MAIN_BRANCHES.find(b => branches.branches[b]) ?? MAIN_BRANCHES[0];

        plg(plugin, 'Resetting current branch');
        await git.reset(ResetMode.HARD);
        plgLog(plugin, 'Attempting to checkout backup branch');
        await git.checkout('omegga-upgrade-backup');
        plgLog(plugin, `Replacing ${mainBranch} with backup`);
        await git.deleteLocalBranch(mainBranch);
        await git.checkoutBranch(mainBranch, 'omegga-upgrade-backup');
        plgLog(plugin, 'Restored to backup branch');

        if ((await git.branch()).current !== mainBranch) {
          plgErr(
            plugin,
            `Failed to checkout newly created ${mainBranch} branch`
          );
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

  log('Updated', (updates + '').yellow, 'plugins!');
}

export async function check(pluginNames: string[], _options: unknown) {
  const omeggaPath = getWorkDir();
  if (!omeggaPath)
    return err(
      'Not an omegga directory, run ',
      'omegga init'.yellow,
      'to setup one.'
    );

  const pluginFolder = path.join(omeggaPath, soft.PLUGIN_PATH);

  // if no plugins are passed in, use every plugin in the plugins folder
  if (pluginNames.length === 0) {
    pluginNames = fs.readdirSync(pluginFolder);
  }

  const plugins: IInstalledPlugin[] = pluginNames
    .map(dir => path.join(pluginFolder, dir))
    // every plugin must be in a directory
    .filter(
      dir =>
        fs.existsSync(dir) &&
        fs.lstatSync(dir).isDirectory() &&
        fs.existsSync(path.join(dir, '.git'))
    )
    .map(dir => ({ name: path.basename(dir) }));

  if (plugins.length === 0) {
    log('Found no plugins that can be checked');
    return;
  }

  log(
    'Checking',
    (plugins.length + '').yellow,
    'plugins for valid plugin files'
  );

  for (const plugin of plugins) {
    const pluginPath = path.join(pluginFolder, plugin.name);
    plugin.path = pluginPath;
    const git = simpleGit(pluginPath);
    plugin.git = git;
    if (!(await git.checkIsRepo())) {
      plgErr(plugin, 'No git repo detected');
      continue;
    }
    checkPlugin(omeggaPath, plugin);
  }
  console.log();
}

const EXECUTABLES = ['setup.sh', 'omegga_plugin'];

async function init() {
  const { author, ...response } = await prompts([
    {
      type: 'text',
      name: 'name',
      message: 'What would you like to ' + 'name'.yellow + ' your plugin?',
      validate: value =>
        value.match(/^[\w-_]+$/) ? true : 'Invalid plugin name!',
    },
    {
      type: 'select',
      name: 'type',
      message:
        'What ' + 'type'.yellow + ' of plugin would you like to initialize?',
      choices: [
        { title: 'safe ' + '(default)'.italic, value: 'safe' },
        { title: 'unsafe', value: 'unsafe' },
        { title: 'rust', value: 'rust' },
        { title: 'rpc', value: 'rpc' },
      ],
    },
    {
      type: prev => (prev == 'safe' ? 'confirm' : null),
      name: 'ts',
      message:
        'Would you like to use ' + 'TypeScript'.yellow + ' in your plugin?',
      initial: false,
    },
    {
      type: 'text',
      name: 'author',
      message: 'Who is the ' + 'author'.yellow + ' of this plugin?',
    },
  ]);

  const name = response.name;
  const type: PluginType =
    response.type == 'safe' && response.ts ? 'safe-ts' : response.type;

  if (!PLUGIN_TYPES.includes(type)) {
    err('Invalid plugin type', type.red, '!');
    process.exit(1);
  }

  let dest: string;
  if (!config.find('.')) {
    log(
      'Warning:'.yellow,
      'This is not an omegga installation, initializing here instead...'
    );
    dest = `./${name}`;
  } else {
    dest = `./plugins/${name}`;
    if (!fs.existsSync('./plugins')) fs.mkdirSync('./plugins');
  }

  if (fs.existsSync(dest)) {
    err('A directory already exists at the desired plugin location.');
    process.exit(1);
  }

  log('Initializing new', type.yellow, 'plugin', name.cyan, '...');

  const templateData = {
    name,
    author: author ?? 'AUTHOR',
    omeggaVersion: pkg.version,
  };

  const copyAndRender = async (src: string, dest: string) => {
    const stats = fs.statSync(src);
    // remove .rename suffix from files
    dest = dest.replace(/\.rename$/, '');
    if (stats.isDirectory()) {
      await fs.promises.mkdir(dest);
      const contents = await fs.promises.readdir(src);
      for (const child of contents)
        await copyAndRender(path.join(src, child), path.join(dest, child));
    } else {
      // copy and render the file
      const data = (await fs.promises.readFile(src)).toString();
      const mode = EXECUTABLES.includes(path.basename(dest)) ? 0o755 : 0o644;

      await fs.promises.writeFile(
        dest,
        data.replace(/{{(\w+)}}/g, (_, p) => templateData[p] ?? `{{${p}}}`),
        { mode }
      );
    }
  };

  const src = path.join(__dirname, `../../templates/${type}`);

  verboseLog('Copying and rendering template...');
  await copyAndRender(src, dest);

  if (require('hasbin').sync('git')) {
    verboseLog('Running', 'git init'.yellow, 'in the new plugin directory ...');
    await exec('git init', { cwd: dest });
  }

  if (fs.existsSync(path.join(src, 'package.json'))) {
    verboseLog('Running', 'npm i'.yellow, 'in the new plugin directory ...');
    try {
      await exec('npm i', { cwd: dest });
    } catch (e) {
      log('Warning: npm i'.yellow, 'failed to execute. Proceeding anyway...');
    }
  }

  log('Initialized', type.yellow, 'plugin', `${name}`.cyan, 'successfully!');
}

function pluginLoaderFactory() {
  const workDir = getWorkDir();
  return new PluginLoader(workDir);
}

/** Loads in a plugin and it's documentation. */
async function loadPlugin(pluginName) {
  const pluginLoader = pluginLoaderFactory();
  const foundPluginDirectory = fs
    .readdirSync(pluginLoader.path)
    .find(dir => dir.toLowerCase() === pluginName.toLowerCase());
  if (!foundPluginDirectory) {
    err(
      `Plugin ${pluginName} not found! Make sure to use the plugin's directory name.`
    );
    process.exit(1);
  }
  const plugin = await pluginLoader.scanPlugin(
    path.join(pluginLoader.path, foundPluginDirectory)
  );
  return plugin;
}

async function listConfig(pluginName) {
  const plugin = await loadPlugin(pluginName);
  const configDoc = plugin.getDocumentation().config;
  const config = await plugin.storage.getConfig();
  for (const key in config) {
    if (!configDoc[key]) continue; // Skip unknown config keys.
    const value = config[key];
    log(key.cyan, '=', value.toString().yellow);
  }
  process.exit();
}

async function getConfig(pluginName, configName: string) {
  const plugin = await loadPlugin(pluginName);
  const configDoc = plugin.getDocumentation().config[configName];
  if (configDoc === undefined) {
    err('Config', configName.cyan, 'not found');
    process.exit(1);
  }
  const config = await plugin.storage.getConfig();
  log(config[configName]);
  process.exit();
}

async function setConfig(pluginName, configName: string, valueString: string) {
  const plugin = await loadPlugin(pluginName);
  const configDoc = plugin.getDocumentation().config[configName];
  if (configDoc === undefined) {
    err('Config', configName.cyan, 'not found');
    process.exit(1);
  }

  // Parse the value string into a value of the correct type for the config.
  let parsed;
  switch (configDoc.type) {
    case 'boolean':
      parsed = valueString === 'true';
      break;
    case 'number':
      parsed = Number(valueString);
      if (isNaN(parsed)) {
        err('Invalid number value', valueString.yellow);
        process.exit(1);
      }
      break;
    case 'string':
      parsed = valueString;
      break;
    case 'enum':
      if (!configDoc.options.includes(valueString)) {
        err(
          'Config',
          configName.cyan,
          'must be one of',
          configDoc.options.join(', ').yellow
        );
        process.exit(1);
      }
      parsed = valueString;
      break;
    default:
      err('set-context does not support config type', configDoc.type.cyan);
      process.exit(1);
  }

  const pluginConfig = await plugin.storage.getConfig();
  pluginConfig[configName] = parsed;
  await plugin.storage.setConfig(pluginConfig);
  log(
    'Set config',
    configName.cyan,
    'of plugin',
    plugin.getName().cyan,
    'to',
    parsed.toString().yellow
  );
  process.exit();
}

async function resetAllConfigs(pluginName, force) {
  const plugin = await loadPlugin(pluginName);
  if (!force) {
    const { answer } = await prompts([
      {
        type: 'confirm',
        name: 'answer',
        message: 'Are you sure you want to reset all configs?',
        initial: false,
      },
    ]);
    if (!answer) {
      log('Reset aborted.');
      process.exit(1);
    }
  }
  await plugin.storage.wipeConfig();
  await plugin.storage.init();
  log('Reset all configs of plugin', plugin.getName().cyan);
  process.exit();
}

async function resetConfig(pluginName, configName: string) {
  const plugin = await loadPlugin(pluginName);
  const configDoc = plugin.getDocumentation().config[configName];
  if (configDoc === undefined) {
    err('Config', configName.cyan, 'not found');
    process.exit(1);
  }
  const pluginConfig = await plugin.storage.getConfig();
  pluginConfig[configName] = plugin.storage.getDefaultConfig()[configName];
  await plugin.storage.setConfig(pluginConfig);
  log(
    'Reset config',
    configName.cyan,
    'of plugin',
    plugin.getName().cyan,
    'to',
    pluginConfig[configName]
  );
  process.exit();
}

export default {
  install,
  update,
  check,
  init,
  listConfig,
  getConfig,
  setConfig,
  resetAllConfigs,
  resetConfig,
};
