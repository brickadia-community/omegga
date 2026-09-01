# Omegga behind a real certificate

Omegga's web UI serves https with a certificate it generates itself, so browsers
warn on every visit. Putting a reverse proxy in front of it gets a certificate
browsers trust, at `omegga.yourdomain.com` instead of an IP and a port.

Replace any instance of `OMEGGA.YOURDOMAIN.COM` below with your domain (most
people use `omegga` as a subdomain).

Either way, first create an `A record` in your domain's DNS settings pointing
`OMEGGA.YOURDOMAIN.COM` at your server's IP, and make sure ports `80` and `443`
are forwarded and open on the firewall. Do not forward `8080` unless you are
troubleshooting.

## Caddy

Caddy obtains and renews the certificate on its own, so this is the shorter
path. Install it from [caddyserver.com/docs/install](https://caddyserver.com/docs/install),
then put this in `/etc/caddy/Caddyfile`:

```caddyfile
OMEGGA.YOURDOMAIN.COM {
    reverse_proxy https://127.0.0.1:8080 {
        transport http {
            # omegga's own certificate is self-signed
            tls_insecure_skip_verify
        }
    }
}
```

Then `sudo systemctl reload caddy`. That is the whole configuration:
websockets, the redirect from port 80, and certificate renewal are defaults.

Caddy needs port 80 reachable from the internet to complete the ACME challenge.
If it cannot get a certificate, `journalctl -u caddy` says why.

If you would rather not skip verification, set `https: false` under `omegga:` in
`omegga-config.yml` and proxy `http://127.0.0.1:8080` instead. The hop is then
plaintext over loopback, which does not leave the machine.

Running a second omegga is another block with its own hostname and port:

```caddyfile
OMEGGA2.YOURDOMAIN.COM {
    reverse_proxy https://127.0.0.1:8081 {
        transport http {
            tls_insecure_skip_verify
        }
    }
}
```

## nginx

More moving parts, and certbot has to be run separately, but if nginx is
already on the box this fits alongside what is there.

These are for people hosting a dedicated server who want other users to reach
the web ui, not for the faint of heart.

Replace any instance of `OMEGGA.YOURDOMAIN.COM` in these instructions with your domain (most users use `omegga` as a subdomain)

Create an `A record` in DNS settings for your domain. Point `OMEGGA.YOURDOMAIN.COM` at your server's IP.

Generate some temporary ssl keys and move them to `/etc/ssl/certs`

    sudo openssl req -x509 -newkey rsa:4096 -nodes -keyout ./omegga_key.pem -out ./omegga_cert.pem -days 365 -subj '/CN=OMEGGA.YOURDOMAIN.COM'
    sudo mv omegga_*.pem /etc/ssl/certs/

Generate a strong dhparam ([What is dhparam??](https://wiki.openssl.org/index.php/Diffie_Hellman))

    sudo openssl dhparam -out /etc/ssl/certs/dhparam.pem 2048

Create nginx config by pasting this in `/etc/nginx/sites-enabled/omegga.conf` and replace `OMEGGA.YOURDOMAIN.COM` with your domain.

    server {
        listen 443 ssl;
        server_name OMEGGA.YOURDOMAIN.COM;

        error_log /var/log/nginx/omegga.log;
        ssl_certificate /etc/ssl/certs/omegga_cert.pem;
        ssl_certificate_key /etc/ssl/certs/omegga_key.pem;
        ssl_dhparam /etc/ssl/certs/dhparam.pem;
        ssl_protocols TLSv1.2;
        ssl_ciphers 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:DHE-DSS-AES128-GCM-SHA256:kEDH+AESGCM:ECDHE-RSA-AES128-SHA256:ECDHE-ECDSA-AES128-SHA256:ECDHE-RSA-AES128-SHA:ECDHE-ECDSA-AES128-SHA:ECDHE-RSA-AES256-SHA384:ECDHE-ECDSA-AES256-SHA384:ECDHE-RSA-AES256-SHA:ECDHE-ECDSA-AES256-SHA:DHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA:DHE-DSS-AES128-SHA256:DHE-RSA-AES256-SHA256:DHE-DSS-AES256-SHA:DHE-RSA-AES256-SHA:AES128-GCM-SHA256:AES256-GCM-SHA384:AES128-SHA256:AES256-SHA256:AES128-SHA:AES256-SHA:AES:CAMELLIA:DES-CBC3-SHA:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!aECDH:!EDH-DSS-DES-CBC3-SHA:!EDH-RSA-DES-CBC3-SHA:!KRB5-DES-CBC3-SHA';
        ssl_prefer_server_ciphers on;
        ssl_session_cache shared:SSL:20m;
        ssl_session_timeout 180m;

        location / {
            proxy_pass https://127.0.0.1:8080/;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_set_header X-Nginx-Proxy true;
            proxy_redirect off;
        }
    }

    server {
      listen 80;
      server_name OMEGGA.YOURDOMAIN.COM;
      return 301 https://OMEGGA.YOURDOMAIN.COM$request_uri;
    }

Delete `/etc/nginx/sites-enabled/default` if you haven't already and `service nginx restart`

Make sure you have ports `80` and `443` forwarded/open on firewall for your server. Do not bother port forwarding `8080` unless you are troubleshooting.

Before you can run certbot, you need to make sure nginx is working. Visit `https://OMEGGA.YOURDOMAIN.COM` and check if it has insecure certificate.

You can check if nginx has any errors by `cat /var/log/nginx/error.log`

Follow [certbot instructions](https://certbot.eff.org/instructions) for nginx and run `certbot --nginx` when you are ready.

You should be able to access the omegga web ui from `https://OMEGGA.YOURDOMAIN.COM`!
