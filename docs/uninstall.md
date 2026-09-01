# Uninstalling

```sh
# uninstall omegga
npm uninstall -g omegga

# remove omegga config
rm -rf ~/.config/omegga

# remove brickadia installs
rm -rf ~/.local/share/brickadia-launcher

# potentially remove extra brickadia config
rm ~/.config/Epic
```

`~/.config/omegga` is also where steamcmd installs the game, so removing it
reclaims the Brickadia download too.

You will have to delete the server folders you created manually.

If you ran omegga in a container instead, none of the above applies: remove the container, its `home` volume, and the `server` directory you bind mounted. See [Containers](containers.md).
