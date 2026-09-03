# Installing on Linux

## Quick Setup

1. Install linux if you haven't already ([Windows Install](wsl.md) is not that bad)

2. If you type `whoami` and it says "root", [create a new user](#creating-a-new-user) and come back. This step is usually only necessary for people using a VPS.

3. Update the packages you already have, then install the ones omegga needs.
   Skipping the update step causes several of the errors below:

    ```sh
    sudo apt update && sudo apt upgrade

    sudo apt install curl git build-essential python3 wget tar openssl lib32gcc-s1
    ```

    [What each of those is for](#packages). On non-Debian distros the names
    differ; on Arch, `lib32gcc-s1` is `lib32-gcc-libs` and needs `multilib`
    enabled.

4. Run these commands (Installs a node installer, installs node, installs omegga):

    ```sh
    # download nvm
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash

    # activate nvm
    . ~/.nvm/nvm.sh

    # install node version 24
    nvm install 24

    # install omegga
    npm i -g omegga
    ```

5. Head over to [Running Omegga](../running.md) or troubleshoot below. To run it in a container instead of installing it, see [Containers](../containers.md).

## Install Troubleshooting

If you are having issues running omegga, see [Troubleshooting](../troubleshooting.md) for a potential fix. This section is for issues with installing.

  - If you are on Ubuntu and the output of `which npm` is `/bin/npm`
    ```sh
    sudo apt purge nodejs # uninstall old version of nodejs
    # restart install instructions from this point
    nvm install 24 # install node version 24 via nvm
    ```

  - If you get an error like "`sh: 28: cd: can't cd to .`", you need to be in `bash` (and probably type `cd` to navigate out of root directory):

    ```sh
    bash # use bash instead of sh
    cd # navigate home
    ```

  - If you get an error like "`gyp info find Python using Python version 3.8.10 found at /usr/bin/python3`" you need to install python3:

    ```sh
    sudo apt install python3
    npm i -g omegga
    ```

  - If you get an error like "`gyp ERR! stack Error: not found: make`" you need to install build-essential:
    ```sh
    sudo apt update && sudo apt upgrade # refresh the package index first
    sudo apt install build-essential # install make
    npm i -g omegga # re-run omegga install
    ```

  - If you get an error like "`Unable to fetch some archives, maybe run apt-get update`" you need to run this before running your original command:
    ```sh
    sudo apt update && sudo apt upgrade
    ```

  - If you are having trouble installing with nvm and are running **Ubuntu/Debian**, run the following commands (installs node, installs omegga) instead or install node&npm from [NodeSource Binary Distributions](https://github.com/nodesource/distributions/blob/master/README.md).

    ```sh
    curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
    sudo apt-get install -y nodejs
    npm i -g omegga
    ```

## Manual Setup (you install stuff)

Omegga depends on:

- linux
  - [Windows Install](wsl.md) (WSL 1 or WSL 2)
- Node v23+ ([ubuntu/deb](https://github.com/nodesource/distributions/blob/master/README.md#installation-instructions), but `nvm` from Quick Setup is better)
- One of:
  - `tar` (most linuxes come with this, though you can `sudo apt install tar`)
  - [Brickadia linux launcher](https://brickadia.com/download)

### Packages

`sudo apt install curl git build-essential python3 wget tar openssl lib32gcc-s1`
covers all of these on Debian and Ubuntu.

| Package | Needed for |
| --- | --- |
| `curl` | downloading the nvm install script |
| `build-essential`, `python3` | node-gyp, which builds omegga's native modules on install |
| `wget`, `tar` | downloading and extracting steamcmd |
| `lib32gcc-s1` | steamcmd itself, which is a 32-bit binary |
| `git` | `omegga install` and `omegga update` for plugins |
| `openssl` | the web UI's https certificate. Without it the web UI falls back to http |

SteamCMD is not on that list: omegga asks to install it on the first start, into
`~/.config/omegga/steam`, or uses one already on `PATH`.

Omegga is installed as a global npm package

    npm i -g omegga

Alternatively, you can use a development/local omegga.

```sh
# clone omegga
git clone https://github.com/brickadia-community/omegga.git && cd omegga

# install dependencies
npm i

# point development omegga to global npm bin
npm link

# build the web ui, build omegga's typescript, and the plugin omegga.d.ts
npm run dist
```

If you accidentally install both from Github and `npm i -g omegga`, you can run `npm unlink omegga` to stop npm from using the git one.

Any errors, see [Troubleshooting](../troubleshooting.md) for a potential fix.

## Creating a New User

If you are running as root (terminal prompt ends with '#' instead of '$' or running `whoami` says "root"), create a new user.

The following commands will create a user named `brickadia`. Feel free to replace it to `user` or your own name.

```sh
# create the user
useradd -m brickadia
# set the new user's password
passwd brickadia
# allow "sudo apt install ...." to work in this user
usermod -aG sudo brickadia

# become this user, navigate to user's home, and run bash
su brickadia -c "cd && bash"

# if you were root, you would be in /root (root's home) instead of /home/brickadia
# this fixes some issues when installing omegga on a VPS
```
