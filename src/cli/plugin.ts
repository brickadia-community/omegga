import Logger from '@/logger';
import soft from '@/softconfig';
import * as config from '@config';
import { PluginLoader } from '@omegga/plugin';
import { getPluginGit } from '@cli/plugin/git';
import { exec as execNonPromise } from 'node:child_process';
import 'colors';
import fs from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';
import semver from 'semver';
import { promisify } from 'node:util';
import { VERSION } from '@/version';

const exec = promisify(execNonPromise);

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
}

interface ITransformer {
  pattern: RegExp;
  fn(match: Record<string, string>): IPlugin;
}

const PLUGIN_TYPES = ['safe', 'safe-ts', 'unsafe', 'rust', 'rpc'];
type PluginType = (typeof PLUGIN_TYPES)[number];

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
  for (const t of transformers) {
    const match = url.match(t.pattern);
    if (match?.groups) return t.fn(match.groups);
  }
  return { type: 'raw', url };
};

let needsNL = false;

// rewrite a console line
const rewriteLine = (...args: unknown[]) => {
  // stdout has no cursor controls when omegga is piped or run in a container
  if (process.stdout.isTTY) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
  }
  process.stdout.write(args.join(' '));
  needsNL = true;
};

// logging helper functions
const plg = (plugin: IPlugin | IInstalledPlugin, ...args: unknown[]) => {
  if (needsNL) {
    needsNL = false;
    console.log();
  }
  console.log(plugin.name, '>>'.green, ...args);
};
const plgLog = (plugin: IPlugin | IInstalledPlugin, ...args: unknown[]) => {
  if (Logger.VERBOSE) plg(plugin, ...args);
  else
    rewriteLine(
      plugin.name ?? ('url' in plugin ? plugin.url : ''),
      '>>'.green,
      ...args,
    );
};
const plgWarn = (plugin: IPlugin | IInstalledPlugin, ...args: unknown[]) => {
  if (needsNL) {
    needsNL = false;
    console.warn();
  }
  console.warn(plugin.name, 'W>'.yellow, ...args);
};
const plgErr = (plugin: IPlugin | IInstalledPlugin, ...args: unknown[]) => {
  if (needsNL) {
    needsNL = false;
    console.error();
  }
  console.error(plugin.name, '!>'.red, ...args);
};

const err = (...args: unknown[]) => {
  if (needsNL) {
    needsNL = false;
    console.error();
  }
  console.error('!>'.red, ...args);
};
const log = (...args: unknown[]) => {
  if (needsNL) {
    needsNL = false;
    console.log();
  }
  console.log('>>'.green, ...args);
};
const verboseLog = (...args: unknown[]) => {
  if (!Logger.VERBOSE) return;
  if (needsNL) {
    needsNL = false;
    console.log();
  }
  console.log('V>'.magenta, ...args);
};

function checkPlugin(
  omeggaPath: string,
  plugin: (IPlugin & { name: string }) | IInstalledPlugin,
) {
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
        fs.readFileSync(path.join(pluginPath, soft.PLUGIN_FILE), 'utf8'),
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
        '1'.yellow,
      );
      return;
    }

    // check the omeggaVersion field of the plugin file
    if (!data.omeggaVersion || !semver.validRange(data.omeggaVersion)) {
      plgWarn(
        plugin,
        'WARNING - Plugin file has invalid',
        'omeggaVersion'.yellow + '. Expected semver expression',
      );
      return false;
    } else if (!semver.satisfies(VERSION, data.omeggaVersion)) {
      plgWarn(
        plugin,
        `WARNING - Plugin is not made for this version of omegga (${VERSION.yellow} vs ${data.omeggaVersion.yellow})`,
      );
      return false;
    }

    plgLog(plugin, 'Plugin file', 'OK'.green);
    return true;
  }

  // no plugin file, no problem!
  plgWarn(
    plugin,
    `WARNING - Plugin is missing plugin file (${soft.PLUGIN_FILE}), this may be a problem in future versions`,
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
      'to setup one.',
    );

  log('Attempting to install', (plugins.length + '').yellow, 'plugins...');

  for (const pluginUrl of plugins) {
    const transformed = transformUrl(pluginUrl);

    // if the plugin wasn't transformed, try to extract its name from the git url
    let name = transformed.name;
    if (!name) {
      try {
        name = path.parse(transformed.url).name.replace(/^omegga-/, '');
      } catch {
        console.error('!>'.red, 'Error parsing name from url', transformed.url);
        break;
      }
    }
    const plugin = { ...transformed, name };

    log(
      'Installing plugin',
      plugin.name.yellow,
      'from',
      plugin.url.yellow + '...',
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
        'or check for plugin name collisions',
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
      const git = getPluginGit();
      plgLog(plugin, 'Cloning...');
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
        verboseLog('Changing permission of', postInstallPath);
        fs.chmodSync(postInstallPath, '0755');
        verboseLog('Executing bash file');
        const { stdout, stderr } = await exec(postInstallPath, {
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
      'to setup one.',
    );

  const git = getPluginGit();
  const pluginFolder = path.join(omeggaPath, soft.PLUGIN_PATH);

  // if no plugins are passed in, use every plugin in the plugins folder
  if (pluginsNames.length === 0) {
    pluginsNames = fs.readdirSync(pluginFolder);
  }

  const plugins: (IInstalledPlugin & { path: string })[] = pluginsNames
    .map(dir => path.join(pluginFolder, dir))
    // every plugin must be a directory git can update
    .filter(
      dir =>
        fs.existsSync(dir) &&
        fs.lstatSync(dir).isDirectory() &&
        fs.existsSync(path.join(dir, '.git')),
    )
    .map(dir => ({ name: path.basename(dir), path: dir }));

  if (plugins.length === 0) {
    log('Found no plugins that can be updated');
    return;
  }

  log('Checking', (plugins.length + '').yellow, 'plugins for updates...');

  // list of plugins that will be updated
  const pluginsToUpdate: (IInstalledPlugin & { path: string })[] = [];

  for (const plugin of plugins) {
    if (needsNL) {
      console.log();
      needsNL = false;
    }
    plgLog(plugin, 'Checking...');

    try {
      // local edits are someone's work in progress, and an update would eat them
      if (await git.isDirty(plugin.path)) {
        plgErr(plugin, 'Detected uncommitted changes - ignoring');
        continue;
      }

      const branch = await git.currentBranch(plugin.path);
      if (!branch || !MAIN_BRANCHES.includes(branch)) {
        plgErr(plugin, 'Not on a main branch - ignoring');
        continue;
      }

      plgLog(plugin, 'Fetching...');
      await git.fetch(plugin.path);

      const upstream = await git.compareUpstream(plugin.path);
      if (!upstream) {
        plgErr(plugin, 'No upstream branch - ignoring');
        continue;
      }

      // local developers, publish your code please!!! :)
      if (upstream.ahead) {
        plgErr(plugin, 'Detected plugin is ahead - ignoring');
        continue;
      }

      if (!upstream.behind) {
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
    if (needsNL) {
      console.log();
      needsNL = false;
    }

    // the commit to fall back to when the new code turns out to be unusable
    let previous: string;
    try {
      previous = await git.headSha(plugin.path);
    } catch (e) {
      plgErr(plugin, 'Error reading current commit', e);
      continue;
    }

    try {
      plgLog(plugin, 'Pulling update...');
      await git.fastForward(plugin.path);

      plgLog(plugin, 'Checking plugin versions...');
      if (!checkPlugin(omeggaPath, plugin)) {
        throw 'Incompatible';
      }

      const postInstallPath = path.join(plugin.path, soft.PLUGIN_POSTINSTALL);
      if (fs.existsSync(postInstallPath)) {
        plgLog(plugin, 'Running post install script...');
        try {
          fs.chmodSync(postInstallPath, '0755');
          const { stdout, stderr } = await exec(postInstallPath, {
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
      plgErr(plugin, 'Error updating plugin', e);
      try {
        plgWarn(plugin, 'Rolling back to', previous.slice(0, 8).yellow);
        await git.resetTo(plugin.path, previous);
      } catch (rollback) {
        plgErr(plugin, 'Error rolling back', rollback);
      }
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
      'to setup one.',
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
        fs.existsSync(path.join(dir, '.git')),
    )
    .map(dir => ({ name: path.basename(dir) }));

  if (plugins.length === 0) {
    log('Found no plugins that can be checked');
    return;
  }

  log(
    'Checking',
    (plugins.length + '').yellow,
    'plugins for valid plugin files',
  );

  for (const plugin of plugins) {
    // a plugin copied in by hand is still a plugin worth checking, so this
    // does not care whether the directory came from git
    plugin.path = path.join(pluginFolder, plugin.name);
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
      type: prev => (prev === 'safe' ? 'confirm' : null),
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
    response.type === 'safe' && response.ts ? 'safe-ts' : response.type;

  if (!PLUGIN_TYPES.includes(type)) {
    err('Invalid plugin type', type.red, '!');
    process.exit(1);
  }

  let dest: string;
  if (!config.find('.')) {
    log(
      'Warning:'.yellow,
      'This is not an omegga installation, initializing here instead...',
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

  const templateData: Record<string, string> = {
    name,
    author: author ?? 'AUTHOR',
    omeggaVersion: VERSION,
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
        { mode },
      );
    }
  };

  const src = path.join(__dirname, `../../templates/${type}`);

  verboseLog('Copying and rendering template...');
  await copyAndRender(src, dest);

  verboseLog('Starting a repo in the new plugin directory ...');
  try {
    await getPluginGit().init(dest);
  } catch (e) {
    log('Warning: could not start a git repo here.'.yellow, e);
  }

  if (fs.existsSync(path.join(src, 'package.json'))) {
    verboseLog('Running', 'npm i'.yellow, 'in the new plugin directory ...');
    try {
      await exec('npm i', { cwd: dest });
    } catch {
      log('Warning: npm i'.yellow, 'failed to execute. Proceeding anyway...');
    }
  }

  log('Initialized', type.yellow, 'plugin', `${name}`.cyan, 'successfully!');
}

function pluginLoaderFactory() {
  const workDir = getWorkDir();
  if (!workDir) {
    err('Not an omegga directory, run ', 'omegga init'.yellow, 'to setup one.');
    process.exit(1);
  }
  return new PluginLoader(workDir);
}

/** Loads in a plugin and it's documentation. */
async function loadPlugin(pluginName: string) {
  const pluginLoader = pluginLoaderFactory();
  const foundPluginDirectory = fs
    .readdirSync(pluginLoader.path)
    .find(dir => dir.toLowerCase() === pluginName.toLowerCase());
  if (!foundPluginDirectory) {
    err(
      `Plugin ${pluginName} not found! Make sure to use the plugin's directory name.`,
    );
    process.exit(1);
  }
  const plugin = await pluginLoader.scanPlugin(
    path.join(pluginLoader.path, foundPluginDirectory),
  );
  if (!plugin) {
    err(`Plugin ${pluginName} failed to load!`);
    process.exit(1);
  }
  return plugin;
}

/** Get a loaded plugin's config documentation or exit. */
function getConfigDoc(plugin: Awaited<ReturnType<typeof loadPlugin>>) {
  const configDoc = plugin.getDocumentation()?.config;
  if (!configDoc) {
    err('Plugin', plugin.getName().cyan, 'has no config documentation');
    process.exit(1);
  }
  return configDoc;
}

async function listConfig(pluginName: string, json = false) {
  const plugin = await loadPlugin(pluginName);
  // plugins without a config section are valid; list only skips unknown keys
  const configDoc = plugin.getDocumentation()?.config ?? {};
  const config = (await plugin.storage.getConfig()) ?? {};
  if (json) {
    console.log(JSON.stringify(config, null, 2));
  } else {
    for (const key in config) {
      if (!configDoc[key]) continue; // Skip unknown config keys.
      const value = config[key];
      log(
        key.cyan,
        '=',
        typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
          ? value.toString().yellow
          : JSON.stringify(value).yellow,
      );
    }
  }
  process.exit();
}

async function getConfig(pluginName: string, configName: string, json = false) {
  const plugin = await loadPlugin(pluginName);
  const configDoc = getConfigDoc(plugin)[configName];
  if (configDoc === undefined) {
    err('Config', configName.cyan, 'not found');
    process.exit(1);
  }
  const config = (await plugin.storage.getConfig()) ?? {};
  if (json) {
    console.log(JSON.stringify(config[configName], null, 2));
  } else {
    log(config[configName]);
  }
  process.exit();
}

async function setConfig(
  pluginName: string,
  configName: string,
  valueString: string,
) {
  const plugin = await loadPlugin(pluginName);
  const configDoc = getConfigDoc(plugin)[configName];
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
          configDoc.options.join(', ').yellow,
        );
        process.exit(1);
      }
      parsed = valueString;
      break;
    default:
      err('set-context does not support config type', configDoc.type.cyan);
      process.exit(1);
  }

  const pluginConfig = (await plugin.storage.getConfig()) ?? {};
  pluginConfig[configName] = parsed;
  await plugin.storage.setConfig(pluginConfig);
  log(
    'Set config',
    configName.cyan,
    'of plugin',
    plugin.getName().cyan,
    'to',
    parsed.toString().yellow,
  );
  process.exit();
}

async function resetAllConfigs(pluginName: string, force: boolean) {
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

async function resetConfig(pluginName: string, configName: string) {
  const plugin = await loadPlugin(pluginName);
  const configDoc = getConfigDoc(plugin)[configName];
  if (configDoc === undefined) {
    err('Config', configName.cyan, 'not found');
    process.exit(1);
  }
  const pluginConfig = (await plugin.storage.getConfig()) ?? {};
  pluginConfig[configName] = plugin.storage.getDefaultConfig()[configName];
  await plugin.storage.setConfig(pluginConfig);
  log(
    'Reset config',
    configName.cyan,
    'of plugin',
    plugin.getName().cyan,
    'to',
    pluginConfig[configName],
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
