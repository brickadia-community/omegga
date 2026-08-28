import { existsSync } from 'node:fs';

/**
 * Whether omegga is running inside a container, where advice to reinstall
 * through npm does not apply - the install is baked into the image.
 */
export function isContainer(): boolean {
  return (
    existsSync('/.dockerenv') || // docker
    existsSync('/run/.containerenv') || // podman
    Boolean(process.env.container) // podman, lxc, systemd-nspawn
  );
}
