import { describe, expect, it } from 'vitest';
import { installHint, parseDistroFamily } from './distro';

// trimmed from the real files on each distro
const OS_RELEASE = {
  debian:
    'PRETTY_NAME="Debian GNU/Linux 13 (trixie)"\nNAME="Debian GNU/Linux"\nID=debian\n',
  ubuntu:
    'PRETTY_NAME="Ubuntu 24.04.4 LTS"\nNAME="Ubuntu"\nID=ubuntu\nID_LIKE=debian\n',
  fedora:
    'NAME="Fedora Linux"\nVERSION="44 (Cloud Edition)"\nID=fedora\nVERSION_ID=44\n',
  arch: 'NAME="Arch Linux"\nPRETTY_NAME="Arch Linux"\nID=arch\nBUILD_ID=rolling\n',
  rocky: 'NAME="Rocky Linux"\nID="rocky"\nID_LIKE="rhel centos fedora"\n',
  manjaro: 'NAME="Manjaro Linux"\nID=manjaro\nID_LIKE=arch\n',
  alpine: 'NAME="Alpine Linux"\nID=alpine\n',
};

describe('parseDistroFamily', () => {
  it('recognises the distros omegga is tested on', () => {
    expect(parseDistroFamily(OS_RELEASE.debian)).toBe('debian');
    expect(parseDistroFamily(OS_RELEASE.ubuntu)).toBe('debian');
    expect(parseDistroFamily(OS_RELEASE.fedora)).toBe('fedora');
    expect(parseDistroFamily(OS_RELEASE.arch)).toBe('arch');
  });

  it('follows ID_LIKE, so derivatives need no entry of their own', () => {
    expect(parseDistroFamily(OS_RELEASE.rocky)).toBe('fedora');
    expect(parseDistroFamily(OS_RELEASE.manjaro)).toBe('arch');
  });

  it('is unknown rather than wrong for anything else', () => {
    expect(parseDistroFamily(OS_RELEASE.alpine)).toBe('unknown');
    expect(parseDistroFamily('')).toBe('unknown');
  });
});

describe('installHint', () => {
  const packages = {
    debian: 'libgl1 libglib2.0-0',
    fedora: 'mesa-libGL glib2',
    arch: 'libglvnd glib2',
  };

  it("gives one command, with that distro's names", () => {
    expect(installHint(packages, 'debian')).toBe(
      'sudo apt install libgl1 libglib2.0-0',
    );
    expect(installHint(packages, 'fedora')).toBe(
      'sudo dnf install mesa-libGL glib2',
    );
    expect(installHint(packages, 'arch')).toBe('sudo pacman -S libglvnd glib2');
  });

  it('falls back to every command rather than guessing one', () => {
    const hint = installHint(packages, 'unknown');
    expect(hint.split('\n')).toHaveLength(3);
    expect(hint).toContain('sudo apt install libgl1 libglib2.0-0');
    expect(hint).toContain('sudo dnf install mesa-libGL glib2');
    expect(hint).toContain('sudo pacman -S libglvnd glib2');
  });
});
