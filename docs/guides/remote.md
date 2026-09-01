# Running omegga on another machine

Getting at the files and the web UI of an omegga that lives on a VPS or a
spare box, rather than the one in front of you.

## SSH

If you don't already have SSH access, it's easy to setup. These instructions should work on WSL, but additional config may be needed.

1. Install ssh server: `sudo apt install openssh-server`
2. On the computer you will be accessing from:
    1. If you haven't already, run `ssh-keygen`
    2. `ssh-copy-id user@remoteip` (copy the key to the server so you don't have to type passwords)
    3. `ssh user@remoteip` (ssh in)
    4. `sudo nano /etc/ssh/sshd_config` (modify the ssh server config file)

Disable in your `/etc/ssh/sshd_config`, it's advised to set `PasswordAuthentication no` and `UsePAM no` to prevent people from getting access by guessing passwords. You may need to manually copy future ssh public keys or temporarily disable this to gain access again from another PC.

If you want, change `Port 22` to a different port (may need to remove `#` from the beginning of the line)

Don't forget to port forward the configured port (default 22) on TCP.

## Remote file sharing

1. Install samba: `apt install samba`

2. Configure samba:

In `/etc/samba/smb.conf`, add a line like this, replace `USER` with your non-root user and `/home/USER/omegga` with the path to the omegga folder (or home if you want more freedom)

```ini
; Omegga folder path
[omegga]
  path = /home/USER/omegga
  browseable = yes
  valid users = @USER
  writable = yes
  read only = no
```

Then run `sudo service smbd restart` (you may need to port forward for TCP 445 or allow `sudo ufw allow samba`)

3. Add a samba user for you: `sudo smbpasswd -a USER` (it will prompt for a password)

4. Add it to windows by network drive or in the url bar with this url: `\\ip-address\omegga`

5. Done!

## Multiple Omeggas

If you are running instances of omegga, you will need to edit your `omegga-config.yml`. Here's one with non-default ports:

```yaml
omegga:
  port: 8081
  webui: true
  https: true
server:
  port: 7778
```

You need to change `server.port` or it will not post the correct port to the master server. You do not need to use a different `omegga.port` if you plan to redirect at the port forwarding level.

You may need to port forward the new ports in your VM and in your router.

## Reverse proxy (if you own a domain)

This step is not necessary if you do not own your own domain and are okay connecting to the web-ui by IP.

If you are running multiple omegga VMs, this step will have to take place on your main PC and cannot take place on a VM.

Follow the [https guide](https.md).

If you are running a second omegga, repeat the guide with these modifications (the [Caddy](https.md#caddy) route needs none of them beyond a second block)

* Skip the steps for generating `temporary ssl keys` and `dhparam`, these can be re-used
* DNS Configure `OMEGGA2.YOURDOMAIN.COM` to be a copy of the `OMEGGA.YOURDOMAIN.COM` record.
* Make a second `/etc/nginx/sites-enabled/omegga2.conf` based on the one in the guide with the following changes:
    * `OMEGGA.YOURDOMAIN.COM` is a different `OMEGGA2.YOURDOMAIN.COM`
    * `proxy_pass https://127.0.0.1:8080/;` becomes `proxy_pass https://127.0.0.1:8081/;` (new web ui port)
* Run certbot again to add key for the second domain
