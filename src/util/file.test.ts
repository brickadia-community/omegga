import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findFiles, rmdir } from './file';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omegga-file-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const touch = (...parts: string[]) => {
  const file = path.join(dir, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '');
  return file;
};

const relative = (files: string[]) => files.map(f => path.relative(dir, f));

describe('findFiles', () => {
  it('finds nested files by extension, in glob 7 order', () => {
    touch('saves', 'b.brs');
    touch('saves', 'B.brs');
    touch('saves', 'a.brs');
    touch('saves', 'sub', 'deep', 'y.brs');
    touch('saves', 'sub', 'x.brs');
    touch('saves', 'notes.txt');
    touch('saves', 'a.brs.bak');

    expect(relative(findFiles(path.join(dir, 'saves'), '.brs'))).toEqual([
      'saves/a.brs',
      'saves/b.brs',
      'saves/B.brs',
      'saves/sub/deep/y.brs',
      'saves/sub/x.brs',
    ]);
  });

  it('skips dotfiles and dot directories', () => {
    touch('saves', '.hidden.brs');
    touch('saves', '.cache', 'inside.brs');
    touch('saves', 'shown.brs');

    expect(relative(findFiles(path.join(dir, 'saves'), '.brs'))).toEqual([
      'saves/shown.brs',
    ]);
  });

  it('follows symlinked directories and files', () => {
    touch('shared', 'deep', 'linked.brs');
    touch('loose.brs');
    fs.mkdirSync(path.join(dir, 'saves'));
    fs.symlinkSync(path.join(dir, 'shared'), path.join(dir, 'saves', 'link'));
    fs.symlinkSync(
      path.join(dir, 'loose.brs'),
      path.join(dir, 'saves', 'file.brs'),
    );

    expect(relative(findFiles(path.join(dir, 'saves'), '.brs'))).toEqual([
      'saves/file.brs',
      'saves/link/deep/linked.brs',
    ]);
  });

  it('survives symlink loops and dangling links', () => {
    touch('saves', 'a.brs');
    fs.symlinkSync(path.join(dir, 'saves'), path.join(dir, 'saves', 'loop'));
    fs.symlinkSync(
      path.join(dir, 'missing.brs'),
      path.join(dir, 'saves', 'gone.brs'),
    );

    expect(relative(findFiles(path.join(dir, 'saves'), '.brs'))).toEqual([
      'saves/a.brs',
    ]);
  });

  it('takes glob characters in the directory literally', () => {
    touch('we[i]rd *', 'w.brs');

    expect(relative(findFiles(path.join(dir, 'we[i]rd *'), '.brs'))).toEqual([
      'we[i]rd */w.brs',
    ]);
  });

  it('returns nothing for a missing directory', () => {
    expect(findFiles(path.join(dir, 'nope'), '.brs')).toEqual([]);
  });
});

describe('rmdir', () => {
  it('removes a directory tree', async () => {
    touch('tree', 'a', 'b.txt');
    expect(await rmdir(path.join(dir, 'tree'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'tree'))).toBe(false);
  });

  it('reports false for a missing path', async () => {
    expect(await rmdir(path.join(dir, 'nope'))).toBe(false);
  });
});
