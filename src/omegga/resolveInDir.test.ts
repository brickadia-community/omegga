import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveInDir } from './server';

describe('resolveInDir', () => {
  let dir: string;
  let file: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'omegga-prefabs-'));
    file = join(dir, '3by3.brz');
    writeFileSync(file, '');
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('resolves a bare name', () => {
    expect(resolveInDir(dir, '3by3', '.brz')).toBe(file);
  });

  it('resolves a name that already has the extension', () => {
    expect(resolveInDir(dir, '3by3.brz', '.brz')).toBe(file);
  });

  // regression: getPrefabPath returns an absolute path, and plugins reasonably
  // pass that straight back into readSaveData. join() used to concatenate it
  // onto the directory, producing <dir>/<dir>/3by3.brz and a spurious
  // "prefab file not in Saved/Prefabs directory" error.
  it('resolves an absolute path inside the directory', () => {
    expect(resolveInDir(dir, file, '.brz')).toBe(file);
  });

  it('is case insensitive about the extension', () => {
    const upper = join(dir, 'CAPS.BRZ');
    writeFileSync(upper, '');
    expect(resolveInDir(dir, 'CAPS.BRZ', '.brz')).toBe(upper);
  });

  it('returns undefined for a file that does not exist', () => {
    expect(resolveInDir(dir, 'nope', '.brz')).toBeUndefined();
  });

  it('returns undefined for an absolute path outside the directory', () => {
    expect(resolveInDir(dir, '/etc/passwd', '.brz')).toBeUndefined();
  });

  it('returns undefined for traversal out of the directory', () => {
    expect(resolveInDir(dir, '../../etc/passwd', '.brz')).toBeUndefined();
  });

  it('returns undefined for empty or non-string names', () => {
    expect(resolveInDir(dir, '', '.brz')).toBeUndefined();
    expect(
      resolveInDir(dir, undefined as unknown as string, '.brz'),
    ).toBeUndefined();
  });
});
