import { readFileSync } from 'node:fs';

export type DistroFamily = 'debian' | 'fedora' | 'arch' | 'unknown';

/** The same packages under the name each family's repositories give them. */
export type DistroPackages = Record<Exclude<DistroFamily, 'unknown'>, string>;

const INSTALLERS = {
  debian: { label: 'Debian/Ubuntu', command: 'sudo apt install' },
  fedora: { label: 'Fedora', command: 'sudo dnf install' },
  arch: { label: 'Arch', command: 'sudo pacman -S' },
} as const;

/**
 * ID_LIKE is how a derivative names its parent, so matching it covers Mint,
 * Pop, Rocky and Manjaro without naming any of them.
 */
export function parseDistroFamily(osRelease: string): DistroFamily {
  const field = (name: string) =>
    osRelease
      .match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]
      .replace(/["']/g, '') ?? '';
  const ids = new Set(`${field('ID')} ${field('ID_LIKE')}`.trim().split(/\s+/));

  if (ids.has('debian') || ids.has('ubuntu')) return 'debian';
  if (ids.has('fedora') || ids.has('rhel') || ids.has('centos'))
    return 'fedora';
  if (ids.has('arch')) return 'arch';
  return 'unknown';
}

/** Unknown when there is no os-release to read, which includes not being linux. */
export function getDistroFamily(): DistroFamily {
  try {
    return parseDistroFamily(readFileSync('/etc/os-release', 'utf8'));
  } catch {
    return 'unknown';
  }
}

/**
 * The one install command that works here. An unrecognised distro gets every
 * command instead, with continuation lines indented to sit under callers that
 * prefix the first.
 */
export function installHint(
  packages: DistroPackages,
  family: DistroFamily = getDistroFamily(),
): string {
  if (family !== 'unknown') {
    return `${INSTALLERS[family].command} ${packages[family]}`;
  }

  const families = Object.keys(INSTALLERS) as Exclude<
    DistroFamily,
    'unknown'
  >[];
  const width = Math.max(...families.map(f => INSTALLERS[f].label.length)) + 1;
  return families
    .map((f, i) => {
      const { label, command } = INSTALLERS[f];
      return `${i ? '  ' : ''}${`${label}:`.padEnd(width)} ${command} ${packages[f]}`;
    })
    .join('\n');
}
