# Installing Plugins

## CLI Installation

You can install plugins with the `omegga install https://github.com/user/repo` command.

You can install plugins using a shorthand `omegga install gh:user/repo` which will install the plugin located at `https://github.com/user/omegga-repo` (note the inserted `omegga-` prefix).

The available shorthands are `gh` for github.com and `gl` for gitlab.com

This is the recommended way of installing plugins as it automatically runs a setup script when present.

## Manual Installation

You can clone a plugin's github repo inside the `plugins` folder (created when you run `omegga` for the first time):

- `cd plugins` to navigate to plugins folder
- `git clone https://github.com/user/repo` to download the plugin
- Make sure to read the plugin's README file for after-install instructions

## Updating Plugins

Plugins can be updated with `omegga update`:

```sh
# update all plugins
omegga update

# update plugins named "pluginName" and "anotherPluginName"
omegga update pluginName anotherPluginName
```

Plugins may also need to be updated based on the project's README file.

## Uninstalling Plugins

Plugins can be installed by deleting the plugin's respective folder:

```sh
rm -rf plugins/PLUGIN_NAME
```
