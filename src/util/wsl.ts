import { existsSync } from 'node:fs';
import { platform, version } from 'node:os';

export function getPlatform() {
  if (platform() === 'win32') return 'WINDOWS';
  // Only WSL1 has this
  if (version().match(/Microsoft/)) return 'WSL1';
  // Both WSL1 and WSL2 have this
  if (existsSync('/run/WSL')) return 'WSL2';
  if (platform() === 'linux') return 'LINUX';
  return 'UNKNOWN';
}

export function checkWsl(): number {
  switch (getPlatform()) {
    case 'WSL1':
      return 1;
    case 'WSL2':
      return 2;
    default:
      return 0;
  }
}
