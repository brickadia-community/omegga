# Installing on Windows (WSL)

These are simple instructions to get Windows Subsystem for Linux installed.
Once you have a shell in it, follow [Installing on Linux](linux.md).

**Note**: WSL 2 at the moment requires the [wsl2binds plugin](https://github.com/Meshiest/omegga-wsl2binds). You can install it with `omegga install gh:meshiest/wsl2binds`

To enable WSL, run this in powershell as an administrator:

```powershell
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
```

Then in the Microsoft Store, download a linux:

- [Ubuntu](https://www.microsoft.com/en-us/p/ubuntu/9nblggh4msv6)

[More Advanced Instructions here](https://docs.microsoft.com/en-us/windows/wsl/install-win10#manual-installation-steps) if the above is not sufficient.

To set WSL version from 2 to 1:

1. Check WSL version with `wsl -l -v` in cmd
2. In Administrator cmd, run `wsl --set-version <distribution name> 1` where `<distribution name>` is `Ubuntu`, `Debian`, etc. (From the NAME section of the previous command)

## WSL2 Networking

WSL2 has its own network, so the game server is not reachable from outside the
machine without forwarding. The wsl2binds plugin forwards UDP traffic for you
and prints the `netsh` command to run for the web UI:

```sh
omegga install gh:meshiest/wsl2binds
```

## EACCES on `npm i -g omegga`

Under WSL 1 the global install sometimes fails with `EACCES`. Try
[the npm fix](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally)
first. Failing that, switch to WSL 2, run `npm i -g omegga` there, and switch
back to WSL 1 if that is where you want to run.
