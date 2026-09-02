# Troubleshooting

Narrow down where the issue might be with the following options:

- If you forgot your server's password:
  - terminal: `cat data/Saved/Config/LinuxServer/ServerSettings.ini | grep Password`
- If your brickadia is crashing and omegga works:
  - omegga console: `/debug`
  - terminal: `omegga --debug`
- If your omegga isn't starting
  - terminal: `omegga --verbose`
- If a plugin is crashing, message the plugin developer
  - discord: #plugin-bugs
- If the web UI is blank and you installed from `git clone`
  - terminal: `npm run dist`
- If the web UI is crashing, open the browser developer console and send the
  error to the #omegga-help discord channel
- If a plugin fails to update and it has a `package-lock.json`, ask the plugin
  developer to update that file before pushing
- If you are on Ubuntu and the output of `which npm` is `/bin/npm`
  - terminal: `sudo apt purge nodejs` and restart install instructions from `nvm install 24`.
- If you're getting an `EACCES` error when running `npm i -g omegga`:
  1. First, try [this](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally).
  2. If that doesn't work, try this horrible bodge method for WSL:
     1. Set your WSL to WSL 2
     2. `npm i -g omegga`
     3. Set your WSL back to WSL 1 (assuming you want wsl1)
- If you're getting a "`gyp ERR! stack Error: not found: make`", `make` comes
  from [build-essential](https://wiki.gnucash.org/wiki/Install_Build_Tools):

  ```sh
  sudo apt update && sudo apt upgrade
  sudo apt install build-essential
  npm i -g omegga # re-run the omegga install
  ```

For problems during `npm i -g omegga` rather than after it, see
[Install troubleshooting](install/linux.md#install-troubleshooting).
