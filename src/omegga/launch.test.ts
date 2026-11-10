import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collectLaunchOptions, type LaunchSource } from './launch';

describe('collectLaunchOptions', () => {
  let root: string;
  let pluginA: string;
  let pluginB: string;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'omegga-launch-'));
    pluginA = join(root, 'a');
    pluginB = join(root, 'b');
    mkdirSync(pluginA);
    mkdirSync(pluginB);
    writeFileSync(join(pluginA, 'run.sh'), '#!/bin/sh\nexec "$@"\n');
    chmodSync(join(pluginA, 'run.sh'), 0o755);
    writeFileSync(join(pluginB, 'run.sh'), '#!/bin/sh\nexec "$@"\n');
    writeFileSync(join(pluginB, 'noexec.sh'), '');
  });

  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const source = (
    dir: string,
    launch: unknown,
    format = 'node_unsafe',
  ): LaunchSource => ({ name: dir, dir, format, launch });

  it('is empty without launch blocks', () => {
    expect(collectLaunchOptions([source(pluginA, undefined)], '/d')).toEqual({
      wrappers: [],
      args: [],
      env: {},
    });
  });

  it('resolves wrappers and expands placeholders', () => {
    const opts = collectLaunchOptions(
      [
        source(pluginA, {
          wrapper: 'run.sh',
          args: ['-nocrashreports'],
          env: { MODS: '${dataDir}/Mods', LIB: '${pluginDir}/lib.so' },
        }),
      ],
      '/data',
    );
    expect(opts.wrappers).toEqual([join(pluginA, 'run.sh')]);
    expect(opts.args).toEqual(['-nocrashreports']);
    expect(opts.env).toEqual({
      MODS: '/data/Mods',
      LIB: join(pluginA, 'lib.so'),
    });
  });

  it('keeps load order and lets later plugins win on env', () => {
    const opts = collectLaunchOptions(
      [
        source(pluginA, { args: ['-a'], env: { K: 'a' } }),
        source(pluginB, { args: ['-b'], env: { K: 'b' } }),
      ],
      '/d',
    );
    expect(opts.args).toEqual(['-a', '-b']);
    expect(opts.env.K).toBe('b');
  });

  it('ignores sandboxed plugins', () => {
    const opts = collectLaunchOptions(
      [source(pluginA, { wrapper: 'run.sh', args: ['-x'] }, 'node_safe')],
      '/d',
    );
    expect(opts).toEqual({ wrappers: [], args: [], env: {} });
  });

  it('ignores wrappers outside the plugin or not executable', () => {
    const opts = collectLaunchOptions(
      [
        source(pluginB, { wrapper: '../a/run.sh', args: ['-escape'] }),
        source(pluginB, { wrapper: 'noexec.sh', args: ['-noexec'] }),
      ],
      '/d',
    );
    expect(opts).toEqual({ wrappers: [], args: [], env: {} });
  });

  it('ignores malformed blocks', () => {
    const opts = collectLaunchOptions(
      [
        source(pluginA, { args: 'not-an-array' }),
        source(pluginA, { unknownKey: true }),
      ],
      '/d',
    );
    expect(opts).toEqual({ wrappers: [], args: [], env: {} });
  });
});
